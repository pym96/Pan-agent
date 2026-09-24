/** Fixed-shape structural observations only: never retain provider strings or bodies. */
export interface KimiStructure {
 version: 1;
 stage: 'encode' | 'send' | 'http' | 'sse' | 'json' | 'envelope' | 'delta' | 'terminal' | 'tools' | 'validation' | 'complete';
 events: number;
 deltas: number;
 reasoning: { missing: number; null: number; empty: number; string: number; invalid: number };
 assembledReasoning: boolean;
 reasoningCharacters: number;
 toolFragments: number;
 assembledTools: number;
 completeTools: number;
 finish: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'invalid' | null;
 done: number;
 usagePresent: number;
 usageParsed: boolean;
}
export function newKimiStructure(): KimiStructure {
 return {version:1,stage:'encode',events:0,deltas:0,reasoning:{missing:0,null:0,empty:0,string:0,invalid:0},assembledReasoning:false,reasoningCharacters:0,toolFragments:0,assembledTools:0,completeTools:0,finish:null,done:0,usagePresent:0,usageParsed:false};
}
export function observeReasoning(s: KimiStructure, delta: Record<string, unknown>): void {
 const value=delta.reasoning_content;
 if (!Object.hasOwn(delta,'reasoning_content')) s.reasoning.missing++;
 else if (value===null) s.reasoning.null++;
 else if (typeof value!=='string') s.reasoning.invalid++;
 else {if(value.length===0)s.reasoning.empty++;else s.reasoning.string++;s.reasoningCharacters+=value.length;}
}
