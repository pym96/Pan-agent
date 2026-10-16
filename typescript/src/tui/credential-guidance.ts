import type { ModelFailure } from '../protocol/canonical-protocol.ts';

/** Fixed copy only: never interpolate provider error details, response bodies or credentials. */
export function credentialGuidance(failure: ModelFailure | undefined, provider: string,
 source: 'environment' | 'keychain' | undefined): string | undefined {
 const variable=provider==='kimi-code'?'KIMI_API_KEY':provider==='deepseek'?'DEEPSEEK_API_KEY':undefined;
 const code=provider==='kimi-code'?'kimi_credential_unavailable':provider==='deepseek'?'deepseek_credential_unavailable':undefined;
 if(!failure||failure.category!=='authentication'||!code||failure.detail!==code)return undefined;
 if(source==='environment')return `Missing ${variable}. Exit with :exit, set ${variable} in your terminal, then restart Pan. Or run pan-agent configure to choose a credential source. Never paste API keys into a task.`;
 if(source==='keychain')return 'The configured macOS Keychain credential is unavailable. Exit with :exit and run pan-agent configure to update the Keychain entry or choose another credential source. Never paste API keys into a task.';
 return 'The configured credential is unavailable. Exit with :exit and run pan-agent configure to review the credential source. Never paste API keys into a task.';
}
