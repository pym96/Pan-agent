import { createHash } from "node:crypto";
import type { AssistantMessage, Message } from "../../protocol/canonical-protocol.ts";
import type { ModelExchangeRequest } from "../../protocol/model-adapter-contract.ts";

export interface KimiRequestLineage {
 readonly sessionId: string;
 readonly prefix: readonly { ref: WeakRef<Message>; digest: string }[];
 readonly signal: AbortSignal;
}
interface Entry extends KimiRequestLineage {
 readonly digest: string;
 /** Undefined is an admitted absence, not missing provenance; empty string stays present. */
 readonly reasoning?: string;
}
const digest = (message: Message): string => createHash("sha256").update(JSON.stringify(message)).digest("hex");

/** Process-local provenance, never serialized. Copies, altered ancestors and foreign sessions fail closed. */
export class KimiContinuation {
 #entries = new WeakMap<AssistantMessage, Entry>();
 #closed = false;
 capture(request: ModelExchangeRequest): KimiRequestLineage {
  return Object.freeze({
   sessionId: request.sessionId, signal: request.signal,
   prefix: Object.freeze(request.context.messages.map(value => Object.freeze({ ref: new WeakRef(value), digest: digest(value) }))),
  });
 }
 unchanged(lineage: KimiRequestLineage, request: ModelExchangeRequest): boolean {
  return !this.#closed && !lineage.signal.aborted && lineage.sessionId === request.sessionId
   && lineage.prefix.length === request.context.messages.length
   && lineage.prefix.every((prior, index) => prior.ref.deref() === request.context.messages[index]
    && prior.digest === digest(request.context.messages[index]!));
 }
 admit(message: AssistantMessage, lineage: KimiRequestLineage, reasoning?: string): void {
  if (this.#closed || lineage.signal.aborted) throw new Error("kimi_continuation_unavailable");
  this.#entries.set(message, {
   ...lineage, digest: digest(message), ...(reasoning === undefined ? {} : { reasoning }),
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
