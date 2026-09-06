import { assertJsonObject, assertJsonValue, CanonicalProtocolError, type JsonObject, type JsonValue } from "./canonical-protocol.ts";

export interface AgentToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly parameters: JsonObject;
}

export type ToolValidation<TArguments extends JsonObject> =
	| { readonly ok: true; readonly value: TArguments }
	| { readonly ok: false; readonly error: string };

export interface AgentToolInvocation<TArguments extends JsonObject> {
	readonly toolCallId: string;
	readonly arguments: TArguments;
	readonly signal: AbortSignal;
}

export interface AgentToolExecutionResult<TDetails extends JsonValue | undefined = JsonValue | undefined> {
	readonly content: readonly (
		| { readonly type: "text"; readonly text: string }
		| { readonly type: "image"; readonly data: string; readonly mediaType: string }
	)[];
	readonly details?: TDetails;
}

/** Validation is explicit and completes before NativeKernel may invoke execute. */
export interface AgentTool<
	TArguments extends JsonObject = JsonObject,
	TDetails extends JsonValue | undefined = JsonValue | undefined,
> extends AgentToolDefinition {
	validate(argumentsValue: JsonObject): ToolValidation<TArguments>;
	execute(invocation: AgentToolInvocation<TArguments>): Promise<AgentToolExecutionResult<TDetails>>;
}

export function validateAgentTools(tools: readonly AgentTool[]): void {
	const names = new Set<string>();
	for (const tool of tools) {
		if (typeof tool.name !== "string" || tool.name.trim().length === 0) {
			throw new CanonicalProtocolError("tool_name_empty");
		}
		if (names.has(tool.name)) throw new CanonicalProtocolError(`duplicate_tool_name:${tool.name}`);
		names.add(tool.name);
		if (typeof tool.description !== "string") throw new CanonicalProtocolError(`tool_description_invalid:${tool.name}`);
		assertJsonObject(tool.parameters, `tool_schema:${tool.name}`);
		if (typeof tool.validate !== "function") throw new CanonicalProtocolError(`tool_validator_missing:${tool.name}`);
		if (typeof tool.execute !== "function") throw new CanonicalProtocolError(`tool_execute_missing:${tool.name}`);
	}
}

export function describeAgentTool(tool: AgentTool): AgentToolDefinition {
	assertJsonValue(tool.parameters, `tool_schema:${tool.name}`);
	return { name: tool.name, description: tool.description, parameters: tool.parameters };
}
