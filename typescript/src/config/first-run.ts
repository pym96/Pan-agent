/** #52 first-run configuration wizard: explicit choices, closed selection, secrets never persisted here. */
import { createInterface, emitKeypressEvents, type Key } from "node:readline";
import type { Writable, Readable } from "node:stream";
import { DEEPSEEK_MODEL_IDS, type DeepSeekModelId, type DeepSeekThinkingLevel } from "../providers/deepseek/deepseek-profile.ts";
import { KIMI_MODEL_ID, KIMI_K3_MODEL_ID, type KimiModelId } from "../providers/kimi/kimi-profile.ts";
import { loadPanSettings, savePanSettings, type PanSettings, type PanCredentialSource, PAN_SETTINGS_SCHEMA_VERSION } from "./settings.ts";
import { saveKeychainCredential, PAN_KEYCHAIN_SERVICE, PAN_KEYCHAIN_ACCOUNT, PAN_KEYCHAIN_KIMI_ACCOUNT, type KeychainReference } from "./keychain.ts";

export interface FirstRunDependencies {
	readonly input: Readable;
	readonly output: Writable;
	readonly home?: string;
	/** Injectable for tests; production uses the real Keychain. */
	readonly saveCredential?: (secret: string, reference: KeychainReference) => void;
	readonly keychainReference?: KeychainReference;
	readonly platform?: NodeJS.Platform;
}

export function providerCredentialVariable(provider: PanSettings["provider"]): string {
	return provider === "kimi-code" ? "KIMI_API_KEY" : "DEEPSEEK_API_KEY";
}

const THINKING_LEVELS: readonly DeepSeekThinkingLevel[] = ["low", "high", "max"];

export class ConfigurationInterrupted extends Error {}

/** Read one answer per displayed prompt. A real TTY stays in no-echo mode throughout setup. */
function openPrompts(input: Readable, output: Writable) {
	const tty = input as NodeJS.ReadStream;
	const cancelled = () => new Error("configuration_cancelled: input closed");
	if (!tty.isTTY) {
		// Preserve piped/scripted configuration, including prewritten lines followed by EOF.
		const lines = createInterface({ input, terminal: false });
		const iterator = lines[Symbol.asyncIterator]();
		return {
			async ask(query: string) {
				output.write(query);
				const next = await iterator.next();
				if (next.done) throw cancelled();
				return next.value.trim();
			},
			close() { lines.close(); },
		};
	}

	const wasRaw = tty.isRaw;
	tty.setRawMode(true);
	emitKeypressEvents(tty);
	const bracketed = (output as NodeJS.WriteStream).isTTY === true;
	if (bracketed) output.write("\x1b[?2004h");
	let answer = "", pasting = false, invalid = false, submitted = false, closed = false;
	let reply: ((answer: string | undefined) => void) | undefined;
	let interrupted = false;
	const end = () => { closed = true; reply?.(undefined); };
	const interrupt = () => { interrupted = true; end(); };
	const closedError = () => interrupted ? new ConfigurationInterrupted("Configuration interrupted.") : cancelled();
	const keypress = (character: string | undefined, key: Key) => {
		if (closed || !reply) return;
		if (key.name === "paste-start") { if (submitted) invalid = true; pasting = true; return; }
		if (key.name === "paste-end") { if (submitted) invalid = true; pasting = false; return; }
		if (!pasting && key.ctrl && key.name === "c") { interrupt(); return; }
		if (submitted) { invalid = true; return; }
		if (!pasting && key.ctrl && key.name === "d") { end(); return; }
		if (key.name === "return" || key.name === "enter") {
			if (pasting) { invalid = true; return; }
			submitted = true;
			// Keypresses from one input chunk are synchronous. Reject the whole batch if
			// trailing bytes arrived with Enter, before they can answer another prompt.
			queueMicrotask(() => {
				if (closed) return;
				output.write("\n");
				if (invalid) {
					output.write("Enter one answer at a time.\n" + prompt);
					answer = ""; invalid = false; submitted = false;
				} else {
					const resolve = reply;
					reply = undefined;
					resolve?.(answer.trim());
				}
			});
		} else if (!pasting && key.name === "backspace") {
			answer = answer.slice(0, -1);
		} else if (character && !/[\x00-\x1f\x7f]/u.test(character) && !key.meta) {
			answer += character;
		} else {
			// Never interpret an escape/control sequence inside a pasted value as a choice.
			invalid = true;
		}
	};
	let prompt = "";
	process.on("SIGINT", interrupt);
	tty.on("keypress", keypress);
	tty.on("end", end);
	tty.resume();
	return {
		async ask(query: string) {
			if (closed) throw closedError();
			prompt = query;
			answer = ""; invalid = false; submitted = false;
			const response = new Promise<string | undefined>((resolve) => { reply = resolve; });
			output.write(query);
			const value = await response;
			if (value === undefined) throw closedError();
			return value;
		},
		close() {
			process.off("SIGINT", interrupt);
			tty.off("keypress", keypress);
			tty.off("end", end);
			tty.pause();
			tty.setRawMode(wasRaw);
			if (bracketed) output.write("\x1b[?2004l");
			if (interrupted) throw closedError();
		},
	};
}

/**
 * First-time setup and credential-only recovery share the same consent prompt.
 * Only an affirmative save writes a Keychain item.
 */
export async function runFirstRunConfiguration(dependencies: FirstRunDependencies, mode: "configure" | "recover" = "configure"): Promise<PanSettings> {
	const { input, output, home } = dependencies;
	// Validate before prompting or changing credentials; invalid policy is never discarded.
	const previous = await loadPanSettings(home);
	const recovering = mode === "recover";
	if (recovering && previous?.credentialSource !== "environment") throw new Error("configuration_changed: restart Pan");
	const supportsKeychain = (dependencies.platform ?? process.platform) === "darwin";
	const keychainSave = dependencies.saveCredential ?? saveKeychainCredential;
	const reference = dependencies.keychainReference ?? { service: PAN_KEYCHAIN_SERVICE, account: PAN_KEYCHAIN_ACCOUNT };
	const { ask, close } = openPrompts(input, output);
	const write = (line: string): void => { output.write(`${line}\n`); };
	const chooseProfile = async () => {
		write("Pan first-run configuration. Input is hidden at every prompt. Press Enter to use a displayed default. Ctrl-C exits setup.");
		let provider: "deepseek" | "kimi-code" | undefined;
		let selectK3 = false;
		while (!provider) {
			const answer = (await ask("Provider [deepseek|kimi-code|kimi-code:k3-256k] (default deepseek): ")).toLowerCase();
			if (answer === "" || answer === "deepseek") provider = "deepseek";
			else if (answer === "kimi-code" || answer === "kimi") provider = "kimi-code";
			else if (answer === "kimi-code:k3-256k") { provider = "kimi-code"; selectK3 = true; }
			else write("Unknown provider. Choose a displayed provider.");
		}
		let modelId: DeepSeekModelId | KimiModelId;
		if (provider === "kimi-code") {
			modelId = selectK3 ? KIMI_K3_MODEL_ID : KIMI_MODEL_ID;
			write(selectK3 ? `Model selected: ${modelId}.` : `Model fixed: ${KIMI_MODEL_ID} (Kimi Code official coding model).`);
		} else {
			let selected: DeepSeekModelId | undefined;
			while (!selected) {
				const answer = await ask(`Model [${DEEPSEEK_MODEL_IDS.join("|")}] (default deepseek-v4-flash): `);
				if (answer === "") selected = "deepseek-v4-flash";
				else if ((DEEPSEEK_MODEL_IDS as readonly string[]).includes(answer)) selected = answer as DeepSeekModelId;
				else write("Unknown model. Choose a displayed model.");
			}
			modelId = selected;
		}
		let thinkingLevel: DeepSeekThinkingLevel = "high";
		if (provider === "kimi-code" && !selectK3) {
			write("Thinking level is not applicable to kimi-for-coding in this build; stored as inert default.");
		} else {
			let selectedThinking: DeepSeekThinkingLevel | undefined;
			while (!selectedThinking) {
				const answer = (await ask(`Thinking [${THINKING_LEVELS.join("|")}] (default high): `)).toLowerCase();
				if (answer === "") selectedThinking = "high";
				else if ((THINKING_LEVELS as readonly string[]).includes(answer)) selectedThinking = answer as DeepSeekThinkingLevel;
				else write("Unknown thinking level. Choose a displayed level.");
			}
			thinkingLevel = selectedThinking;
		}
		return { provider, modelId, thinkingLevel };
	};
	try {
		const { provider, modelId, thinkingLevel } = recovering && previous ? previous : await chooseProfile();
		const credentialEnv = providerCredentialVariable(provider);
		const interactive = (input as NodeJS.ReadStream).isTTY === true && (output as NodeJS.WriteStream).isTTY === true;
		const defaultKeychain = interactive && supportsKeychain && !process.env[credentialEnv]?.trim();
		if (recovering) {
			write(`Saved provider ${provider} uses ${credentialEnv}, which is missing in this terminal. Keep environment mode to open Pan without a key, or press Ctrl-C to exit and supply it from your shell or secret manager. Input is hidden at every prompt.`);
		}
		const keychainAccount = provider === "kimi-code" ? PAN_KEYCHAIN_KIMI_ACCOUNT : reference.account;
		const activeReference: KeychainReference = { service: reference.service, account: keychainAccount };
		let credentialSource: PanCredentialSource | undefined;
		while (!credentialSource) {
			const options = supportsKeychain
				? `(k)eychain — remember across terminals and projects / (e)nvironment ${credentialEnv}`
				: `(e)nvironment ${credentialEnv} from your shell or secret manager`;
			const answer = (await ask(`Credential source: ${options} / (q)uit [${defaultKeychain ? "k" : "e"}]: `)).toLowerCase();
			if (answer === "q" || answer === "quit") throw new Error("configuration_cancelled: no changes saved");
			const choice = answer || (defaultKeychain ? "k" : "e");
			if (choice === "e" || choice === "environment") {
				if (recovering && previous) return previous;
				credentialSource = "environment";
			} else if (supportsKeychain && (choice === "k" || choice === "keychain")) {
				const secret = await ask(`${provider === "kimi-code" ? "Kimi" : "DeepSeek"} API key to remember (input hidden; stored only in macOS Keychain): `);
				if (!secret) {
					write("Empty key; nothing written.");
					continue;
				}
				const confirm = (await ask(`Save this key to macOS Keychain service ${activeReference.service} account ${activeReference.account}? [y/N]: `)).toLowerCase();
				if (confirm !== "y" && confirm !== "yes") {
					write("Remembering declined; no Keychain item written.");
					continue;
				}
				try {
					keychainSave(secret, activeReference);
				} catch (error) {
					write(`Keychain save failed explicitly: ${error instanceof Error ? error.message : "unknown"}. No plaintext fallback written; choose another source.`);
					continue;
				}
				write("Keychain item saved. Settings will reference it by name only.");
				credentialSource = "keychain";
			} else write("Choose one of the displayed credential sources, or q to quit.");
		}
		const settings: PanSettings = { ...previous, schemaVersion: PAN_SETTINGS_SCHEMA_VERSION, provider, modelId, thinkingLevel, credentialSource };
		const path = await savePanSettings(settings, home);
		write(`Settings saved: ${path} (mode 0600; contains no secret).`);
		return settings;
	} finally {
		close();
	}
}
