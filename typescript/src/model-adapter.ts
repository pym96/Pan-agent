import type { Model } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import type { StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
	DEFAULT_DEEPSEEK_PROFILE,
	type DeepSeekProfile,
} from "./deepseek-profile.ts";

export {
	DEEPSEEK_MODEL_IDS,
	DEFAULT_DEEPSEEK_PROFILE,
	isDeepSeekModelId,
	type DeepSeekModelId,
	type DeepSeekProfile,
} from "./deepseek-profile.ts";

export interface PiModelAdapter {
	readonly providerId: string;
	readonly modelId: string;
	readonly model: Model<string>;
	readonly streamFn: StreamFn;
	readonly thinkingLevel: ThinkingLevel;
}

/**
 * Transitional Pi Provider Adapter used by the default PiKernel path.
 * Construction is offline: Pi resolves DEEPSEEK_API_KEY only when streamFn is
 * first called for a submitted task.
 */
export function createPiDeepSeekAdapter(profile: DeepSeekProfile = DEFAULT_DEEPSEEK_PROFILE): PiModelAdapter {
	const models = createModels();
	models.setProvider(deepseekProvider());
	const model = models.getModel("deepseek", profile.modelId);
	if (!model) {
		throw new Error(`Pi DeepSeek model is unavailable: ${profile.modelId}`);
	}
	return {
		providerId: "deepseek",
		modelId: profile.modelId,
		model: model as Model<string>,
		streamFn: models.streamSimple.bind(models),
		thinkingLevel: profile.thinkingLevel,
	};
}
