/** Test scripts are canonical Pan outcomes; no Provider wire or compatibility conversion. */
import { FauxModelAdapter } from "../src/providers/faux/faux-model-adapter.ts";
import { ZERO_REPORTED_USAGE, UNAVAILABLE, type ModelOutcome, type AssistantMessage, type ToolCall, type JsonObject } from "../src/protocol/canonical-protocol.ts";
import type { ModelAdapter, ModelContext, ModelExchangeRequest } from "../src/protocol/model-adapter-contract.ts";
export function call(name: string, args: JsonObject, options: { id: string }): ToolCall {
 return { type: "tool_call", name, arguments: args, id: options.id };
}
export function response(content: string | AssistantMessage["content"] | ToolCall,
 options: { stopReason?: "stop" | "tool_calls" | "length" | "error"; errorMessage?: string; responseId?: string } = {}): ModelOutcome {
 const identity = { provider: { status: "reported" as const, value: "pan-faux" }, model: { status: "reported" as const, value: "pan-faux-v1" }, responseId: options.responseId ? { status: "reported" as const, value: options.responseId } : UNAVAILABLE };
 if (options.stopReason === "error") return { kind: "failure", category: "provider", detail: options.errorMessage ?? "fixture_error", retryable: false, usage: ZERO_REPORTED_USAGE, identity };
 return { kind: "response", message: { role: "assistant", timestamp: 0, content: typeof content === "string" ? [{type: "text", text: content}] : Array.isArray(content) ? content : [content] }, stopReason: options.stopReason ?? "stop", usage: ZERO_REPORTED_USAGE, identity };
}
type Entry = ModelOutcome | ((context: ModelContext) => ModelOutcome);
/** Callbacks observe admission/context; each outcome is validated/exchanged by the accepted Pan Faux. */
export function scriptedAdapter() {
 let entries: Entry[] = [], count = 0, unchecked = false;
 const requests: ModelExchangeRequest[] = [];
 const adapter: ModelAdapter = {
  providerId: "pan-faux", modelId: "pan-faux-v1", reasoningLevel: "high",
  async exchange(request) {
   const entry = entries[count++]; requests.push(request);
   const outcome = typeof entry === "function" ? entry(request.context) : entry;
   if (unchecked && outcome !== undefined) return structuredClone(outcome); // Explicit malformed-outcome kernel admission probe.
   return new FauxModelAdapter(outcome === undefined ? [] : [outcome]).exchange(request);
  },
 };
 const faux = { setResponses(script: Entry[]) { entries = script; count = 0; unchecked = false; }, setUncheckedResponses(script: Entry[]) { entries = script; count = 0; unchecked = true; }, get state() { return { callCount: count, requests }; } };
 return { adapter, faux };
}
export const stringParameters = { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false };
export const emptyParameters = { type: "object", properties: {}, additionalProperties: false };
export function validateFixtureArguments(value: JsonObject) {
 return typeof value.value === "string" && Object.keys(value).length === 1
  ? { ok: true as const, value } : { ok: false as const, error: "fixture_value_required" };
}
