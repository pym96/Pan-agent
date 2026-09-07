import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "./model-adapter.ts";
import { PiKernel } from "./kernels/pi-kernel.ts";
import { resolveKernelLimits, isKernelSelector } from "../../../typescript/src/runtime/agent-kernel.ts";
import { GeneralAgentSession as ProductSession, type NativeGeneralAgentSessionOptions, type SessionMemory, type KernelLimits, type ObservationSink } from "../../../typescript/src/runtime/session.ts";
export * from "../../../typescript/src/runtime/session.ts";
export interface PiGeneralAgentSessionOptions {
 readonly kernel?: "pi";
 readonly adapter: PiModelAdapter;
 readonly tools: readonly AgentTool[];
 readonly initialMessages?: readonly Message[];
 readonly systemPrompt: string;
 readonly memory: SessionMemory;
 readonly limits?: Partial<KernelLimits>;
 readonly onObservation?: ObservationSink;
 readonly cleanup?: () => Promise<void> | void;
}
export type GeneralAgentSessionOptions = PiGeneralAgentSessionOptions | NativeGeneralAgentSessionOptions;
/** Frozen Reference composition; the lifecycle remains the single Product Session. */
export class GeneralAgentSession extends ProductSession {
 constructor(options: GeneralAgentSessionOptions) {
  const selector = (options as { kernel?: unknown }).kernel ?? "pi";
  if (typeof selector !== "string" || !isKernelSelector(selector)) throw new Error(`Unsupported kernel: ${String(selector)}`);
  if (selector === "native") { super(options as NativeGeneralAgentSessionOptions); return; }
  const pi = options as PiGeneralAgentSessionOptions;
  super({ ...pi, kernel: new PiKernel({ adapter: pi.adapter, tools: [...pi.tools], systemPrompt: pi.systemPrompt,
   limits: resolveKernelLimits(pi.limits), initialMessages: pi.initialMessages }),
   adapterIdentity: { provider: pi.adapter.providerId, modelId: pi.adapter.modelId, thinkingLevel: pi.adapter.thinkingLevel } });
 }
}
