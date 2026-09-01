import type { Model } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import type { StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";

export const DEEPSEEK_MODEL_IDS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export type DeepSeekModelId = (typeof DEEPSEEK_MODEL_IDS)[number];

export interface PiModelAdapter {
	readonly providerId: string;
	readonly modelId: string;
	readonly model: Model<string>;
	readonly streamFn: StreamFn;
	readonly thinkingLevel: ThinkingLevel;
}

export interface DeepSeekProfile {
	readonly modelId: DeepSeekModelId;
	readonly thinkingLevel: Exclude<ThinkingLevel, "off">;
}

export const DEFAULT_DEEPSEEK_PROFILE: DeepSeekProfile = {
	modelId: "deepseek-v4-flash",
	thinkingLevel: "high",
};

/**
 * Real Adapter at the model/provider Seam. Construction is offline: Pi resolves
 * DEEPSEEK_API_KEY only when streamFn is first called for a submitted task.
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

export function isDeepSeekModelId(value: string): value is DeepSeekModelId {
	return DEEPSEEK_MODEL_IDS.some((modelId) => modelId === value);
}
