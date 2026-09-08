import { createHash } from "node:crypto";

export interface AttachmentSnapshot {
	readonly path: string;
	readonly sha256: string;
	readonly bytes: number;
	readonly text: string;
}
export interface AttachedTask {
	readonly format: "pan-agent/attached-task";
	readonly version: 1;
	readonly prompt: string;
	readonly attachments: readonly AttachmentSnapshot[];
	readonly integrity: string;
}
const prefix = "PAN_AGENT_ATTACHED_TASK_V1\n";
export const attachmentHash = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
export function eligibleRelativePath(path: string): boolean {
	return path.length > 0 && !path.includes("\0") && path.split("/").every(part => part.length > 0 && !part.startsWith("."));
}
function validSnapshot(value: unknown): value is AttachmentSnapshot {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const row = value as AttachmentSnapshot;
	if (Object.keys(row).sort().join(",") !== "bytes,path,sha256,text" || typeof row.path !== "string" || !eligibleRelativePath(row.path)
		|| typeof row.text !== "string" || row.text.includes("\0") || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) return false;
	const bytes = Buffer.from(row.text, "utf8");
	return bytes.toString("utf8") === row.text && bytes.length === row.bytes && attachmentHash(bytes) === row.sha256;
}
/** Encoding is user data, never a role change. With no attachments retain the exact original task. */
export function prepareAttachedTask(prompt: string, attachments: readonly AttachmentSnapshot[]): string {
	if (!attachments.length) return prompt;
	if (!attachments.every(validSnapshot) || new Set(attachments.map(a => a.path)).size !== attachments.length) throw new Error("attachment_envelope_invalid");
	const body = {format:"pan-agent/attached-task" as const, version:1 as const, prompt, attachments:attachments.map(a => ({path:a.path,sha256:a.sha256,bytes:a.bytes,text:a.text}))};
	return prefix + JSON.stringify({...body, integrity:attachmentHash(JSON.stringify(body))});
}
/** Recognition requires the entire versioned shape and exact payload integrity; otherwise ordinary legacy text. */
export function decodeAttachedTask(task: string): AttachedTask | undefined {
	if (!task.startsWith(prefix)) return undefined;
	try {
		const value: unknown = JSON.parse(task.slice(prefix.length));
		if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
		const data = value as AttachedTask;
		if (Object.keys(data).sort().join(",") !== "attachments,format,integrity,prompt,version" || data.format !== "pan-agent/attached-task" || data.version !== 1
			|| typeof data.prompt !== "string" || !Array.isArray(data.attachments) || data.attachments.length === 0 || !data.attachments.every(validSnapshot)
			|| new Set(data.attachments.map(a => a.path)).size !== data.attachments.length || typeof data.integrity !== "string") return undefined;
		if (prepareAttachedTask(data.prompt, data.attachments) !== task) return undefined;
		return data;
	} catch { return undefined; }
}
