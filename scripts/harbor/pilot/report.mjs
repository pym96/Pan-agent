export function summary(manifest,reports=[]){
 const rows=manifest.tasks.map(task=>{const report=reports.find(r=>r.task===task.id);if(!report)return {task:task.id,state:'not_started',reward:null,usage:null};
  let state=report.verifier?.status==='official_scored'?'official_scored':report.verifier?.status==='evaluation_error'?'evaluation_error':report.stopReason?'agent_stopped':'infrastructure_failure';
  const rewards=report.verifier?.rewards;
  if(state==='official_scored'&&(!rewards||Object.keys(rewards).length===0||Object.values(rewards).some(v=>typeof v!=='number'||!Number.isFinite(v))))state='evaluation_error';
  return {task:task.id,state,reward:rewards??null,agentStatus:report.agentStatus??null,stopReason:report.stopReason??null,usage:report.usage??null,infrastructurePhase:report.infrastructurePhase??null,verifierExitOrException:report.verifier?.verifier_exit_or_exception??null};});
 return {denominator:5,rows,counts:Object.fromEntries([...new Set(rows.map(r=>r.state))].map(s=>[s,rows.filter(r=>r.state===s).length])),label:'fixed public 5-task pilot; not full leaderboard'};
}
