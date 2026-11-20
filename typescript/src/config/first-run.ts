/** #52 first-run configuration wizard: explicit choices, closed selection, secrets never persisted here. */
import { createInterface } from "node:readline";
import { Writable, type Readable } from "node:stream";
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

class MutedWritable extends Writable {
	muted = false;
	readonly inner: Writable;
	constructor(inner: Writable) {
		super();
		this.inner = inner;
	}
	override _write(chunk: unknown, encoding: BufferEncoding, callback: () => void): void {
		if (!this.muted) this.inner.write(chunk as string, encoding);
		callback();
	}
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
	const muted = new MutedWritable(output);
	const terminal = createInterface({ input, output: muted, terminal: (input as NodeJS.ReadStream).isTTY === true });
	const write = (line: string): void => {
		output.write(`${line}\n`);
	};
	// Buffered line queue: pre-written scripted input must survive stream end.
	const buffered: string[] = [];
	const waiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
	terminal.on("line", (line) => {
		const waiter = waiters.shift();
		if (waiter) waiter.resolve(line);
		else buffered.push(line);
	});
	let closed = false;
	terminal.on("close", () => {
		closed = true;
		const waiter = waiters.shift();
		if (waiter) waiter.reject(new Error("configuration_cancelled: input closed"));
	});
	/** One answered line; EOF with an empty buffer is an explicit cancellation, never a default. */
	const ask = async (query: string, mask = false): Promise<string> => {
		if (mask) {
			muted.inner.write(query);
			muted.muted = true;
		} else {
			muted.inner.write(query);
		}
		try {
			if (buffered.length) return buffered.shift()!.trim();
			if (closed) throw new Error("configuration_cancelled: input closed");
			return (await new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }))).trim();
		} finally {
			if (mask) {
				muted.muted = false;
				muted.inner.write("\n");
			}
		}
	};
	const chooseProfile = async () => {
		write("Pan first-run configuration. Settings persist ordinary preferences only; secrets are never written to settings.");
		let provider: "deepseek" | "kimi-code" | undefined;
		let selectK3 = false;
		while (!provider) {
			const answer = (await ask("Provider [deepseek|kimi-code|kimi-code:k3-256k] (default deepseek): ")).toLowerCase();
			if (answer === "" || answer === "deepseek") provider = "deepseek";
			else if (answer === "kimi-code" || answer === "kimi") provider = "kimi-code";
			else if (answer === "kimi-code:k3-256k") { provider = "kimi-code"; selectK3 = true; }
			else write(`Unknown provider: ${answer}. This build supports deepseek and kimi-code only.`);
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
				else write(`Unknown model: ${answer}.`);
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
				else write(`Unknown thinking level: ${answer}.`);
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
			write(`Saved provider ${provider} uses ${credentialEnv}, which is missing in this terminal. Keep environment mode to open Pan without a key, or quit and supply it from your shell or secret manager.`);
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
				const secret = await ask(`${provider === "kimi-code" ? "Kimi" : "DeepSeek"} API key to remember (input hidden; stored only in macOS Keychain): `, true);
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
		terminal.close();
	}
}
