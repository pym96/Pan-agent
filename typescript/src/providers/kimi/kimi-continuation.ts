import { createHash } from "node:crypto";
import type { AssistantMessage, Message } from "../../protocol/canonical-protocol.ts";
import type { ModelExchangeRequest } from "../../protocol/model-adapter-contract.ts";

interface Entry {
 readonly sessionId: string;
 readonly digest: string;
 readonly prefix: readonly { ref: WeakRef<Message>; digest: string }[];
 readonly reasoning?: string;
 readonly signal: AbortSignal;
}
const digest = (message: Message): string => createHash("sha256").update(JSON.stringify(message)).digest("hex");

/** Process-local provenance, never serialized. Copies, altered ancestors and foreign sessions fail closed. */
export class KimiContinuation {
 #entries = new WeakMap<AssistantMessage, Entry>();
 #closed = false;
 admit(message: AssistantMessage, request: ModelExchangeRequest, reasoning?: string): void {
  if (this.#closed || request.signal.aborted) throw new Error("kimi_continuation_unavailable");
  this.#entries.set(message, {
   sessionId: request.sessionId, digest: digest(message),
   prefix: request.context.messages.map(value => ({ ref: new WeakRef(value), digest: digest(value) })),
   ...(reasoning === undefined ? {} : { reasoning }), signal: request.signal,
  });
 }
 resolve(message: AssistantMessage, index: number, request: ModelExchangeRequest): string | undefined {
  const entry = this.#entries.get(message);
  if (this.#closed || !entry || entry.signal.aborted || entry.sessionId !== request.sessionId
   || entry.digest !== digest(message) || entry.prefix.length !== index
   || entry.prefix.some((prior, offset) => prior.ref.deref() !== request.context.messages[offset]
    || prior.digest !== digest(request.context.messages[offset]!))) throw new Error("kimi_continuation_unavailable");
  return entry.reasoning;
 }
 dispose(): void { this.#closed = true; this.#entries = new WeakMap(); }
}
