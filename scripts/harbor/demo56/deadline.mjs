// Separates agent deadline from environment lifetime; shorter delays only used by offline probes.
export function agentDeadline({cancel,onTimeout,onUnconfirmed,timeoutMs=900000,graceMs=30000}) {
 let grace;
 const deadline=setTimeout(()=>{onTimeout();cancel();grace=setTimeout(onUnconfirmed,graceMs);},timeoutMs);
 return ()=>{clearTimeout(deadline);clearTimeout(grace);};
}
