export const DEEPSEEK_MODEL_IDS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export type DeepSeekModelId = (typeof DEEPSEEK_MODEL_IDS)[number];
export type DeepSeekThinkingLevel = "low" | "high" | "max";

/** Provider selection shared by the independent Pi and Pan Adapter paths. */
export interface DeepSeekProfile {
	readonly modelId: DeepSeekModelId;
	readonly thinkingLevel: DeepSeekThinkingLevel;
}

export const DEFAULT_DEEPSEEK_PROFILE: DeepSeekProfile = {
	modelId: "deepseek-v4-flash",
	thinkingLevel: "high",
};

export function isDeepSeekModelId(value: string): value is DeepSeekModelId {
	return DEEPSEEK_MODEL_IDS.some((modelId) => modelId === value);
}
