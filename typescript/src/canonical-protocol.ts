/** Provider-neutral JSON data admitted at the Pan semantic seam. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface TextContent {
	readonly type: "text";
	readonly text: string;
}

export interface ImageContent {
	readonly type: "image";
	readonly data: string;
	readonly mediaType: string;
}

export interface ToolCall {
	readonly type: "tool_call";
	readonly id: string;
	readonly name: string;
	readonly arguments: JsonObject;
}

export interface ToolResult {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly content: readonly (TextContent | ImageContent)[];
	readonly isError: boolean;
	readonly details?: JsonValue;
}

export interface UserMessage {
	readonly role: "user";
	readonly content: readonly (TextContent | ImageContent)[];
	readonly timestamp: number;
}

export interface AssistantMessage {
	readonly role: "assistant";
	readonly content: readonly (TextContent | ToolCall)[];
	readonly timestamp: number;
}

export interface ToolResultMessage extends ToolResult {
	readonly role: "tool_result";
	readonly timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export type Availability<T> =
	| { readonly status: "reported"; readonly value: T }
	| { readonly status: "unavailable" };

export interface UsageCost {
	readonly input: number;
	readonly output: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly total: number;
}

export interface UsageValues {
	readonly input: number;
	readonly output: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly cacheWrite1h?: number;
	readonly reasoning?: number;
	readonly totalTokens: number;
	readonly cost?: UsageCost;
}

/** A missing report has no numeric fields, so it cannot masquerade as reported zero. */
export type Usage =
	| { readonly status: "reported"; readonly value: UsageValues }
	| { readonly status: "unavailable" };

export interface ResponseIdentity {
	readonly provider: Availability<string>;
	readonly model: Availability<string>;
	readonly responseId: Availability<string>;
}

export type ModelStopReason = "stop" | "tool_calls" | "length";

/** Hidden reasoning is reduced to non-executable presence metadata. Its text is never canonical content. */
export interface ModelDiagnostics {
	readonly reasoning?: { readonly state: "present" | "redacted" };
}

export interface ModelResponse {
	readonly kind: "response";
	readonly message: AssistantMessage;
	readonly stopReason: ModelStopReason;
	readonly usage: Usage;
	readonly identity: ResponseIdentity;
	readonly diagnostics?: ModelDiagnostics;
}

export type ModelFailureCategory =
	| "authentication"
	| "rate_limit"
	| "context_overflow"
	| "transport"
	| "protocol"
	| "provider"
	| "cancelled"
	| "unknown";

/** A failed exchange is an outcome of its own, never fabricated assistant content. */
export interface ModelFailure {
	readonly kind: "failure";
	readonly category: ModelFailureCategory;
	readonly detail: string;
	readonly retryable: boolean;
	readonly usage: Usage;
	readonly identity: ResponseIdentity;
}

export type ModelOutcome = ModelResponse | ModelFailure;

export class CanonicalProtocolError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = "CanonicalProtocolError";
		this.code = code;
	}
}

export const UNAVAILABLE = { status: "unavailable" } as const;

export const ZERO_REPORTED_USAGE: Usage = {
	status: "reported",
	value: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cacheWrite1h: 0,
		reasoning: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
};

function assertNonEmpty(value: unknown, code: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) throw new CanonicalProtocolError(code);
}

function assertFiniteNonNegative(value: unknown, code: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new CanonicalProtocolError(code);
	}
}

export function assertJsonValue(value: unknown, path = "value", ancestors = new Set<object>()): asserts value is JsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new CanonicalProtocolError(`json_non_finite:${path}`);
		return;
	}
	if (typeof value !== "object") throw new CanonicalProtocolError(`json_incompatible:${path}`);
	if (ancestors.has(value)) throw new CanonicalProtocolError(`json_cycle:${path}`);
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, ancestors));
			return;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new CanonicalProtocolError(`json_non_plain_object:${path}`);
		}
		for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${path}.${key}`, ancestors);
	} finally {
		ancestors.delete(value);
	}
}

export function assertJsonObject(value: unknown, path = "arguments"): asserts value is JsonObject {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new CanonicalProtocolError(`json_object_required:${path}`);
	}
	assertJsonValue(value, path);
}

function validateAvailability(value: Availability<string>, field: string): void {
	if (value.status === "unavailable") return;
	if (value.status !== "reported") throw new CanonicalProtocolError(`availability_status_invalid:${field}`);
	assertNonEmpty(value.value, `identity_empty:${field}`);
}

export function validateResponseIdentity(identity: ResponseIdentity): void {
	validateAvailability(identity.provider, "provider");
	validateAvailability(identity.model, "model");
	validateAvailability(identity.responseId, "response_id");
}

export function validateUsage(usage: Usage): void {
	if (usage.status === "unavailable") return;
	if (usage.status !== "reported") throw new CanonicalProtocolError("usage_status_invalid");
	const values = usage.value;
	for (const [name, value] of Object.entries({
		input: values.input,
		output: values.output,
		cache_read: values.cacheRead,
		cache_write: values.cacheWrite,
		total_tokens: values.totalTokens,
	})) assertFiniteNonNegative(value, `usage_invalid:${name}`);
	if (values.cacheWrite1h !== undefined) assertFiniteNonNegative(values.cacheWrite1h, "usage_invalid:cache_write_1h");
	if (values.reasoning !== undefined) assertFiniteNonNegative(values.reasoning, "usage_invalid:reasoning");
	if (values.cost) {
		for (const [name, value] of Object.entries(values.cost)) {
			assertFiniteNonNegative(value, `usage_cost_invalid:${name}`);
		}
	}
}

function validateTextContent(content: TextContent): void {
	if (content.type !== "text" || typeof content.text !== "string") {
		throw new CanonicalProtocolError("text_content_invalid");
	}
}

function validateImageContent(content: ImageContent): void {
	if (content.type !== "image") throw new CanonicalProtocolError("image_content_invalid");
	assertNonEmpty(content.data, "image_data_empty");
	assertNonEmpty(content.mediaType, "image_media_type_empty");
}

export function validateToolCall(call: ToolCall): void {
	if (call.type !== "tool_call") throw new CanonicalProtocolError("tool_call_type_invalid");
	assertNonEmpty(call.id, "tool_call_id_empty");
	assertNonEmpty(call.name, "tool_call_name_empty");
	assertJsonObject(call.arguments);
}

export function validateToolResult(result: ToolResult): void {
	assertNonEmpty(result.toolCallId, "tool_result_call_id_empty");
	assertNonEmpty(result.toolName, "tool_result_name_empty");
	if (typeof result.isError !== "boolean") throw new CanonicalProtocolError("tool_result_error_flag_invalid");
	if (!Array.isArray(result.content)) throw new CanonicalProtocolError("tool_result_content_invalid");
	for (const content of result.content) {
		if (content.type === "text") validateTextContent(content);
		else if (content.type === "image") validateImageContent(content);
		else throw new CanonicalProtocolError("tool_result_content_invalid");
	}
	if (result.details !== undefined) assertJsonValue(result.details, "tool_result.details");
}

function validateAssistantMessage(message: AssistantMessage): void {
	if (!Array.isArray(message.content)) throw new CanonicalProtocolError("assistant_content_invalid");
	for (const content of message.content) {
		if (content.type === "text") validateTextContent(content);
		else if (content.type === "tool_call") validateToolCall(content);
		else throw new CanonicalProtocolError("assistant_content_invalid");
	}
}

function validateMessage(message: Message): void {
	if (!Number.isFinite(message.timestamp)) throw new CanonicalProtocolError("message_timestamp_invalid");
	if (message.role === "user") {
		if (!Array.isArray(message.content)) throw new CanonicalProtocolError("user_content_invalid");
		for (const content of message.content) {
			if (content.type === "text") validateTextContent(content);
			else if (content.type === "image") validateImageContent(content);
			else throw new CanonicalProtocolError("user_content_invalid");
		}
		return;
	}
	if (message.role === "assistant") {
		validateAssistantMessage(message);
		return;
	}
	if (message.role === "tool_result") {
		validateToolResult(message);
		return;
	}
	throw new CanonicalProtocolError("message_role_invalid");
}

/** Validate an exchange-ready Context: every ToolCall is unique and settled exactly once. */
export function validateCanonicalContext(messages: readonly Message[]): void {
	const pending = new Map<string, string>();
	const settled = new Set<string>();
	for (const message of messages) {
		validateMessage(message);
		if (message.role === "assistant") {
			for (const content of message.content) {
				if (content.type !== "tool_call") continue;
				if (pending.has(content.id) || settled.has(content.id)) {
					throw new CanonicalProtocolError(`duplicate_tool_call_id:${content.id}`);
				}
				pending.set(content.id, content.name);
			}
			continue;
		}
		if (message.role !== "tool_result") continue;
		const expectedName = pending.get(message.toolCallId);
		if (expectedName === undefined) throw new CanonicalProtocolError(`orphan_tool_result:${message.toolCallId}`);
		if (expectedName !== message.toolName) {
			throw new CanonicalProtocolError(`tool_result_name_mismatch:${message.toolCallId}`);
		}
		pending.delete(message.toolCallId);
		settled.add(message.toolCallId);
	}
	const unmatched = pending.keys().next().value as string | undefined;
	if (unmatched !== undefined) throw new CanonicalProtocolError(`unmatched_tool_call:${unmatched}`);
}

export function validateModelOutcome(outcome: ModelOutcome, context: readonly Message[]): void {
	validateUsage(outcome.usage);
	validateResponseIdentity(outcome.identity);
	if (outcome.kind === "failure") {
		const categories = new Set<ModelFailureCategory>([
			"authentication", "rate_limit", "context_overflow", "transport",
			"protocol", "provider", "cancelled", "unknown",
		]);
		if (!categories.has(outcome.category)) throw new CanonicalProtocolError("model_failure_category_invalid");
		assertNonEmpty(outcome.detail, "model_failure_detail_empty");
		if (typeof outcome.retryable !== "boolean") throw new CanonicalProtocolError("model_failure_retryable_invalid");
		return;
	}
	validateAssistantMessage(outcome.message);
	const priorIds = new Set<string>();
	for (const message of context) {
		if (message.role !== "assistant") continue;
		for (const content of message.content) if (content.type === "tool_call") priorIds.add(content.id);
	}
	const responseIds = new Set<string>();
	const calls = outcome.message.content.filter((content): content is ToolCall => content.type === "tool_call");
	for (const call of calls) {
		if (priorIds.has(call.id) || responseIds.has(call.id)) {
			throw new CanonicalProtocolError(`duplicate_tool_call_id:${call.id}`);
		}
		responseIds.add(call.id);
	}
	if (outcome.stopReason === "tool_calls" && calls.length === 0) {
		throw new CanonicalProtocolError("tool_calls_stop_without_call");
	}
	if (outcome.stopReason !== "tool_calls" && calls.length > 0) {
		throw new CanonicalProtocolError("tool_call_stop_mismatch");
	}
	const reasoningState = outcome.diagnostics?.reasoning?.state;
	if (reasoningState !== undefined && reasoningState !== "present" && reasoningState !== "redacted") {
		throw new CanonicalProtocolError("reasoning_metadata_invalid");
	}
}

export function assistantPublicText(message: AssistantMessage): string {
	return message.content
		.filter((content): content is TextContent => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

export function addUsage(left: Usage, right: Usage): Usage {
	if (left.status === "unavailable" || right.status === "unavailable") return UNAVAILABLE;
	const cacheWrite1h = left.value.cacheWrite1h === undefined || right.value.cacheWrite1h === undefined
		? undefined
		: left.value.cacheWrite1h + right.value.cacheWrite1h;
	const reasoning = left.value.reasoning === undefined || right.value.reasoning === undefined
		? undefined
		: left.value.reasoning + right.value.reasoning;
	const leftCost = left.value.cost;
	const rightCost = right.value.cost;
	const cost = leftCost === undefined || rightCost === undefined ? undefined : {
		input: leftCost.input + rightCost.input,
		output: leftCost.output + rightCost.output,
		cacheRead: leftCost.cacheRead + rightCost.cacheRead,
		cacheWrite: leftCost.cacheWrite + rightCost.cacheWrite,
		total: leftCost.total + rightCost.total,
	};
	return {
		status: "reported",
		value: {
			input: left.value.input + right.value.input,
			output: left.value.output + right.value.output,
			cacheRead: left.value.cacheRead + right.value.cacheRead,
			cacheWrite: left.value.cacheWrite + right.value.cacheWrite,
			...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
			...(reasoning === undefined ? {} : { reasoning }),
			totalTokens: left.value.totalTokens + right.value.totalTokens,
			...(cost === undefined ? {} : { cost }),
		},
	};
}
