import { FauxModelAdapter } from './faux-model-adapter.ts';
import type { ModelAdapter, ModelExchangeRequest } from '../../protocol/model-adapter-contract.ts';
import type { ModelOutcome } from '../../protocol/canonical-protocol.ts';

/** Offline synthetic continuation. No real Provider state or network is involved. */
export class CheckpointFauxAdapter implements ModelAdapter {
 readonly providerId = 'pan-faux';
 readonly modelId = 'checkpoint-faux-v1';
 readonly reasoningLevel = 'off';
 private cursor = 0;
 private restored = false;
 private readonly scriptIdentity: string;
 private readonly plan: (request: ModelExchangeRequest, step: number) => Promise<ModelOutcome>;
 private readonly privateCanary: string;
 constructor(scriptIdentity: string, plan: (request: ModelExchangeRequest, step: number) => Promise<ModelOutcome>, privateCanary: string) {this.scriptIdentity=scriptIdentity;this.plan=plan;this.privateCanary=privateCanary;}
 readonly checkpoint = {
  format: 'pan-faux-private-v1',
  exportState: async (): Promise<unknown> => ({version:1, script:this.scriptIdentity, cursor:this.cursor, continuation:this.privateCanary}),
  importState: async (input: unknown): Promise<void> => {
   const s = input as {version?:unknown;script?:unknown;cursor?:unknown;continuation?:unknown};
   if (!s || s.version !== 1 || s.script !== this.scriptIdentity || s.continuation !== this.privateCanary
    || typeof s.cursor !== 'number' || !Number.isSafeInteger(s.cursor) || s.cursor < 1) throw new Error('faux_checkpoint_invalid');
   this.cursor = s.cursor; this.restored = true;
  },
 };
 get didRestore(): boolean { return this.restored; }
 async exchange(request: ModelExchangeRequest): Promise<ModelOutcome> {
  const outcome = await this.plan(request, this.cursor++);
  return new FauxModelAdapter([outcome], {modelId:this.modelId}).exchange(request);
 }
}
