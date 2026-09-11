/** #52 first-run configuration wizard: explicit choices, closed selection, secrets never persisted here. */
import { createInterface } from "node:readline";
import { Writable, type Readable } from "node:stream";
import { DEEPSEEK_MODEL_IDS, type DeepSeekModelId, type DeepSeekThinkingLevel } from "../providers/deepseek/deepseek-profile.ts";
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
		let provider: "deepseek" | undefined;
		while (!provider) {
			const answer = (await ask("Provider [deepseek] (kimi-code: unavailable, planned): ")).toLowerCase();
			if (answer === "" || answer === "deepseek") provider = "deepseek";
			else if (answer === "kimi-code" || answer === "kimi") write("kimi-code: unavailable in this build (planned, not implemented). No configuration saved for it.");
			else write(`Unknown provider: ${answer}. Only deepseek is available.`);
		}
		let modelId: DeepSeekModelId | undefined;
		while (!modelId) {
			const answer = await ask(`Model [${DEEPSEEK_MODEL_IDS.join("|")}] (default deepseek-v4-flash): `);
			if (answer === "") modelId = "deepseek-v4-flash";
			else if ((DEEPSEEK_MODEL_IDS as readonly string[]).includes(answer)) modelId = answer as DeepSeekModelId;
			else write(`Unknown model: ${answer}.`);
		}
		let thinkingLevel: DeepSeekThinkingLevel | undefined;
		while (!thinkingLevel) {
			const answer = (await ask(`Thinking [${THINKING_LEVELS.join("|")}] (default high): `)).toLowerCase();
			if (answer === "") thinkingLevel = "high";
			else if ((THINKING_LEVELS as readonly string[]).includes(answer)) thinkingLevel = answer as DeepSeekThinkingLevel;
			else write(`Unknown thinking level: ${answer}.`);
		}
		let credentialSource: PanCredentialSource | undefined;
		while (!credentialSource) {
			const answer = (await ask("Credential source: (e)nvironment DEEPSEEK_API_KEY, never saved / (k)eychain remember [e]: ")).toLowerCase();
			if (answer === "" || answer === "e" || answer === "environment") credentialSource = "environment";
			else if (answer === "k" || answer === "keychain") {
				const secret = await ask("DeepSeek API key to remember (input hidden; stored only in macOS Keychain): ", true);
				if (!secret) {
					write("Empty key; nothing written.");
					continue;
				}
				const confirm = (await ask(`Save this key to macOS Keychain service ${reference.service} account ${reference.account}? [y/N]: `)).toLowerCase();
				if (confirm !== "y" && confirm !== "yes") {
					write("Remembering declined; no Keychain item written.");
					continue;
				}
				try {
					keychainSave(secret, reference);
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
