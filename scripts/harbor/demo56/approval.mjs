// External, explicitly activated container-scoped approval channel. Runtime still authorizes each call.
export function scopedApprovals({sessionId,workspace,containerId,isOpen,record}) {
 let runId, boundSession=sessionId;
 return async (request,signal)=>{
  const start=Date.now();
  const valid=!signal.aborted && isOpen() && typeof request.sessionId==='string' && request.sessionId.length>0 && (!boundSession||request.sessionId===boundSession) && request.workspace===workspace
   && ['read','write','edit','bash'].includes(request.tool) && typeof request.runId==='string' && request.runId.length>0
   && (!runId||runId===request.runId) && (request.tool!=='bash'||request.resourceIdentity===containerId);
  if(valid){runId??=request.runId;boundSession??=request.sessionId;}
  const decision=valid?'allow-once':'deny';
  record({requestId:request.requestId,sessionId:request.sessionId,runId:request.runId,tool:request.tool,argumentsHash:request.argumentsHash,containerId,decision,requestedAt:start,decidedAt:Date.now(),mechanism:'activated container-scoped automatic Allow once'});
  return {requestId:request.requestId,decision};
 };
}
