/** #52 macOS Keychain via the `security` CLI. No enumeration: only the exact named item is ever touched. */
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";

export interface KeychainReference {
	readonly service: string;
	readonly account: string;
}

/** Production Pan-owned convention. Tests must pass the authorized disposable service/account instead. */
export const PAN_KEYCHAIN_SERVICE = "com.pym96.pan-agent";
export const PAN_KEYCHAIN_ACCOUNT = "deepseek-api-key";

export type PanKeychainErrorCode = "keychain_denied" | "keychain_locked" | "keychain_unavailable" | "keychain_not_found" | "keychain_failed";

export class PanKeychainError extends Error {
	readonly code: PanKeychainErrorCode;
	constructor(code: PanKeychainErrorCode, detail: string) {
		super(`${code}: ${detail}`);
		this.name = "PanKeychainError";
		this.code = code;
	}
}

function classify(stderr: string): PanKeychainErrorCode {
	if (/User interaction is not allowed/i.test(stderr)) return "keychain_denied";
	if (/could not be found/i.test(stderr)) return "keychain_not_found";
	if (/locked|unlock|passphrase/i.test(stderr)) return "keychain_locked";
	return "keychain_failed";
}

function run(reference: KeychainReference, args: readonly string[]): string {
	// Explicit minimal environment: no ambient credential variable may flow into
	// the security child, and no ambient env enumeration is required to spawn it.
	// spawnSync keeps the operation off any asynchronous child recorder; the
	// security CLI receives the secret only through its own authorized argv
	// boundary, which this product never logs or retains.
	// The security CLI must see the real user home (passwd entry), never a
	// redirected settings/test HOME — otherwise it blocks on keychain access.
	const env = { PATH: "/usr/bin:/bin", HOME: userInfo().homedir, TMPDIR: "/tmp" };
	const result = spawnSync("security", [...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env,
	});
	if (result.error) throw new PanKeychainError("keychain_unavailable", `security CLI unavailable: ${result.error.message}`);
	const stderr = String(result.stderr ?? "");
	if (result.status !== 0) throw new PanKeychainError(classify(stderr), `security ${args[0]} failed for service ${reference.service} account ${reference.account}: exit ${String(result.status)}`);
	return String(result.stdout ?? "").trim();
}

/** Explicit write after a user choice. -U updates only the same named item. */
export function saveKeychainCredential(secret: string, reference: KeychainReference): void {
	run(reference, ["add-generic-password", "-s", reference.service, "-a", reference.account, "-w", secret, "-U"]);
}

/** Retrieval only through the exact named reference. */
export function readKeychainCredential(reference: KeychainReference): string {
	const value = run(reference, ["find-generic-password", "-s", reference.service, "-a", reference.account, "-w"]);
	if (!value) throw new PanKeychainError("keychain_not_found", `empty or missing item for service ${reference.service} account ${reference.account}`);
	return value;
}

export function deleteKeychainCredential(reference: KeychainReference): void {
	run(reference, ["delete-generic-password", "-s", reference.service, "-a", reference.account]);
}

/** True when the exact named item exists; never enumerates. */
export function keychainCredentialExists(reference: KeychainReference): boolean {
	try {
		readKeychainCredential(reference);
		return true;
	} catch {
		return false;
	}
}
