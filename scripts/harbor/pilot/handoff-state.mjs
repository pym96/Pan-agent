import {digest} from './policy.mjs';
// No arbitrary exception text, stack, request or provider content is emitted.
const codes=new Set(['agent_settlement_timeout','session_close_timeout','handoff_timeout','environment_stop_timeout','command_stop_unconfirmed','recovery_timeout','ECONNRESET','ETIMEDOUT','EPIPE','ABORT_ERR']);
const watchdogs=new WeakMap();
export function timeoutError(code){const e=new Error(code);watchdogs.set(e,code);return e;}
export function watchdogCode(error){return watchdogs.get(error);}
export function faultRecord(error,source,phase,sequence){
 const chain=[];const seen=new Set();let x=error;
 for(let i=0;x&&i<4&&!seen.has(x);i++,x=x.cause){seen.add(x);const raw=typeof x.code==='string'?x.code:typeof x.message==='string'?x.message:'';chain.push({type:['Error','TypeError','AbortError','TimeoutError'].includes(x.name)?x.name:'Error',code:watchdogCode(x)??(codes.has(raw)?raw:'unclassified'),fingerprint:digest(String(raw))});}
 return {sequence,source,phase,at:performance.now(),code:watchdogCode(error)??'unclassified',chain};
}
export function recoveryAllowed(report){
 const p=report.continuation;
 return report.stopConfirmed===true&&p?.version===1&&p.allowed===true&&p.localWatchdog===true&&Object.values(p.confirmations??{}).length===7&&['admissionClosed','runSettled','sessionClosed','transportSettled','toolsSettled','quiesced','environmentStopped'].every(k=>p.confirmations[k]===true)&&report.globalStops?.length>0&&report.globalStops.every(x=>['attempt_error','session_stop_unconfirmed'].includes(x.reason));
}
