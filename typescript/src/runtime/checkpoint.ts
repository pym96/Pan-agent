import type { Message, Usage } from "../protocol/canonical-protocol.ts";

/** Private application storage only; deliberately not a Run Archive record. */
export interface NativeCheckpoint {
 readonly version: 1;
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
 readonly next: "model_exchange";
}

/** Both callbacks are durable barriers. Throwing prevents further effects. */
export interface CheckpointSink {
 commit(checkpoint: NativeCheckpoint): Promise<void>;
 invalidate(): Promise<void>;
}
