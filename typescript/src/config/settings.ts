/** #52/#53 persisted ordinary settings: never a secret container. */
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isDeepSeekModelId, type DeepSeekModelId, type DeepSeekThinkingLevel } from "../providers/deepseek/deepseek-profile.ts";
import { KIMI_MODEL_ID, type KimiModelId } from "../providers/kimi/kimi-profile.ts";

export const PAN_SETTINGS_SCHEMA_VERSION = 1;
export const PAN_CREDENTIAL_SOURCES = ["environment", "keychain"] as const;
export type PanCredentialSource = (typeof PAN_CREDENTIAL_SOURCES)[number];
export const PAN_PROVIDERS = ["deepseek", "kimi-code"] as const;
export type PanProvider = (typeof PAN_PROVIDERS)[number];

/** Ordinary non-secret preferences. No credential value, endpoint or arbitrary provider is representable. */
export interface PanSettings {
	readonly schemaVersion: typeof PAN_SETTINGS_SCHEMA_VERSION;
	readonly provider: PanProvider;
	readonly modelId: DeepSeekModelId | KimiModelId;
	readonly thinkingLevel: DeepSeekThinkingLevel;
	readonly credentialSource: PanCredentialSource;
}

export function panSettingsPath(home: string = homedir()): string {
	return join(home, ".pan-agent", "settings.json");
}

const SECRET_OR_ENDPOINT_KEY = /key|secret|token|password|endpoint|url|credential/i;

/** Strict parse: any secret-looking or endpoint key, unknown provider/model/thinking/source or shape drift fails closed. */
export function parsePanSettings(body: string): PanSettings {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		throw new Error("settings_invalid: not JSON");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("settings_invalid: shape");
	const record = value as Record<string, unknown>;
	const allowed = new Set(["schemaVersion", "provider", "modelId", "thinkingLevel", "credentialSource"]);
	for (const key of Object.keys(record)) {
		if (allowed.has(key)) continue;
		if (SECRET_OR_ENDPOINT_KEY.test(key)) throw new Error(`settings_invalid: forbidden key ${key}`);
		throw new Error(`settings_invalid: unknown key ${key}`);
	}
	if (record.schemaVersion !== PAN_SETTINGS_SCHEMA_VERSION) throw new Error("settings_invalid: schemaVersion");
	if (record.provider !== "deepseek" && record.provider !== "kimi-code") {
		throw new Error(`provider_unavailable: ${String(record.provider)} (this build supports deepseek and kimi-code only)`);
	}
	if (record.provider === "kimi-code") {
		if (record.modelId !== KIMI_MODEL_ID) throw new Error(`settings_invalid: kimi-code uses the fixed model ${KIMI_MODEL_ID}`);
	} else if (typeof record.modelId !== "string" || !isDeepSeekModelId(record.modelId)) {
		throw new Error(`settings_invalid: unsupported model ${String(record.modelId)}`);
	}
	if (record.thinkingLevel !== "low" && record.thinkingLevel !== "high" && record.thinkingLevel !== "max") {
		throw new Error(`settings_invalid: unsupported thinking level ${String(record.thinkingLevel)}`);
	}
	if (record.credentialSource !== "environment" && record.credentialSource !== "keychain") {
		throw new Error(`settings_invalid: credential source ${String(record.credentialSource)}`);
	}
	return value as PanSettings;
}

/** Undefined when absent; invalid content is an explicit error, never a silent fallback. */
export async function loadPanSettings(home?: string): Promise<PanSettings | undefined> {
	const path = panSettingsPath(home);
	let body: string;
	try {
		body = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	return parsePanSettings(body);
}

/** Mode 0700 directory, mode 0600 file, atomic rename. Only ordinary preferences are serializable. */
export async function savePanSettings(settings: PanSettings, home?: string): Promise<string> {
	const path = panSettingsPath(home);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await chmod(dirname(path), 0o700).catch(() => undefined);
	const temporary = `${path}.tmp-${process.pid}`;
	await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
	await chmod(temporary, 0o600);
	await rename(temporary, path);
	return path;
}
