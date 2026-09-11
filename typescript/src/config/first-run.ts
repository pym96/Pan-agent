/** #52 first-run configuration wizard: explicit choices, closed selection, secrets never persisted here. */
import { createInterface } from "node:readline";
import { Writable, type Readable } from "node:stream";
import { DEEPSEEK_MODEL_IDS, type DeepSeekModelId, type DeepSeekThinkingLevel } from "../providers/deepseek/deepseek-profile.ts";
import { KIMI_MODEL_ID, type KimiModelId } from "../providers/kimi/kimi-profile.ts";
import { savePanSettings, type PanSettings, type PanCredentialSource, PAN_SETTINGS_SCHEMA_VERSION } from "./settings.ts";
import { saveKeychainCredential, PAN_KEYCHAIN_SERVICE, PAN_KEYCHAIN_ACCOUNT, type KeychainReference } from "./keychain.ts";

export interface FirstRunDependencies {
	readonly input: Readable;
	readonly output: Writable;
	readonly home?: string;
	/** Injectable for tests; production uses the real Keychain. */
	readonly saveCredential?: (secret: string, reference: KeychainReference) => void;
	readonly keychainReference?: KeychainReference;
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
 * Interactive first-run configuration. Every selection is explicit; kimi-code and
 * unknown providers render unavailable and persist nothing; the Keychain item is
 * written only after an explicit save confirmation; secrets never enter settings.
 */
export async function runFirstRunConfiguration(dependencies: FirstRunDependencies): Promise<PanSettings> {
	const { input, output, home } = dependencies;
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
	terminal.on("close", () => {
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
			return (await new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }))).trim();
		} finally {
			if (mask) {
				muted.muted = false;
				muted.inner.write("\n");
			}
		}
	};
	try {
		write("Pan first-run configuration. Settings persist ordinary preferences only; secrets are never written to settings.");
		let provider: "deepseek" | "kimi-code" | undefined;
		while (!provider) {
			const answer = (await ask("Provider [deepseek|kimi-code] (default deepseek): ")).toLowerCase();
			if (answer === "" || answer === "deepseek") provider = "deepseek";
			else if (answer === "kimi-code" || answer === "kimi") provider = "kimi-code";
			else write(`Unknown provider: ${answer}. This build supports deepseek and kimi-code only.`);
		}
		let modelId: DeepSeekModelId | KimiModelId;
		if (provider === "kimi-code") {
			modelId = KIMI_MODEL_ID;
			write(`Model fixed: ${KIMI_MODEL_ID} (Kimi Code official coding model).`);
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
		if (provider === "kimi-code") {
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
		const credentialEnv = provider === "kimi-code" ? "KIMI_API_KEY" : "DEEPSEEK_API_KEY";
		const keychainAccount = provider === "kimi-code" ? "kimi-code-key" : reference.account;
		const activeReference: KeychainReference = { service: reference.service, account: keychainAccount };
		let credentialSource: PanCredentialSource | undefined;
		while (!credentialSource) {
			const answer = (await ask(`Credential source: (e)nvironment ${credentialEnv}, never saved / (k)eychain remember [e]: `)).toLowerCase();
			if (answer === "" || answer === "e" || answer === "environment") credentialSource = "environment";
			else if (answer === "k" || answer === "keychain") {
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
			} else write(`Unknown credential source: ${answer}.`);
		}
		const settings: PanSettings = { schemaVersion: PAN_SETTINGS_SCHEMA_VERSION, provider, modelId, thinkingLevel, credentialSource };
		const path = await savePanSettings(settings, home);
		write(`Settings saved: ${path} (mode 0600; contains no secret).`);
		return settings;
	} finally {
		terminal.close();
	}
}
