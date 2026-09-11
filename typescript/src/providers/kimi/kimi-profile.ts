/** #53 Kimi Code profile: fixed official OpenAI-compatible identity. No DeepSeek reuse. */

export const KIMI_MODEL_ID = "kimi-for-coding";
export type KimiModelId = typeof KIMI_MODEL_ID;

export interface KimiProfile {
	readonly modelId: KimiModelId;
}

export const DEFAULT_KIMI_PROFILE: KimiProfile = { modelId: KIMI_MODEL_ID };

export function isKimiModelId(value: string): value is KimiModelId {
	return value === KIMI_MODEL_ID;
}

/** Source-located, hash-pinned official documentation used to define the wire contract. */
export const KIMI_OFFICIAL_CONTRACT = Object.freeze({
	retrievedOn: "2026-09-11",
	docsOverview: {
		url: "https://www.kimi.com/code/docs/en/",
		sha256: "cece99db5709e5e1ecaa8af354201883575ef35bc484064e68b531251968e74d",
	},
	membershipGuide: {
		url: "https://www.kimi.com/en/help/kimi-code/membership-guide",
		sha256: "8957d91161c924ac20c4966f3b5fd796f5a8115aec3b89224a497cc841f423b1",
	},
	// Frozen protocol choice from those sources: OpenAI-compatible chat completions only.
	baseUrl: "https://api.kimi.com/coding/v1",
	chatCompletionsPath: "/chat/completions",
	// The same documentation also describes an Anthropic-compatible /messages endpoint; deliberately out of scope.
});
