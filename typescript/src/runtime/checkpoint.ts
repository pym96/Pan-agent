import type { Message, Usage, ToolResultMessage } from "../protocol/canonical-protocol.ts";

/** Private application storage only; deliberately not a Run Archive record. */
export interface NativeCheckpoint {
 readonly version: 1 | 2;
 readonly sourceRunId: string;
 readonly task: string;
 readonly systemPrompt: string;
 readonly toolsJSON: string;
 readonly provider: string;
 readonly model: string;
 readonly reasoning: string;
 readonly providerFormat: string;
 readonly providerState: unknown;
 readonly messages: readonly Message[];
 readonly modelCalls: number;
 readonly toolCalls: number;
 readonly usage: Usage;
 readonly next: "model_exchange" | "pending_tool";
 /** Only a trusted application reconciler may attach a resolution after stop confirmation. */
 readonly resolution?: {readonly kind: "not_started"} | {readonly kind: "completed"; readonly result: ToolResultMessage};
}

/** Both callbacks are durable barriers. Throwing prevents further effects. */
export interface CheckpointSink {
 settled?(result: ToolResultMessage): Promise<void>;
 pending?(checkpoint: NativeCheckpoint): Promise<void>;
 commit(checkpoint: NativeCheckpoint): Promise<void>;
 invalidate(): Promise<void>;
}
