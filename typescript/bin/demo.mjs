/** Offline scripted model, real installed NativeKernel/tools/TUI. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runCli, FauxModelAdapter } from '../dist/index.js';
import { createPanTrustedLocalTools } from '../dist/tools/pan-trusted-local-tools.js';
export async function runDemo(args) {
  if (args.length && !(args.length === 2 && args[0] === '--directory')) {
    console.error('Usage: pan-agent demo [--directory NEW_DIRECTORY]'); return 2;
  }
  const root = args.length ? resolve(args[1]) : await mkdtemp(join(tmpdir(), 'pan-demo-'));
  if (args.length) await mkdir(root);
  const workspace = join(root, 'workspace'), memory = join(root, 'archives');
  await mkdir(workspace); await mkdir(join(root, 'home'));
  await writeFile(join(workspace, 'hello.js'), '// Ready for the offline demonstration.\n');
  const calls = [
    {id:'demo-write', name:'write', arguments:{path:'hello.js', content:'console.log("PAN_DEMO_OK");\n'}},
    {id:'demo-shell', name:'bash', arguments:{command:'node hello.js'}},
    {id:'demo-read', name:'read', arguments:{path:'hello.js'}},
  ];
  const response = (text, call) => ({kind:'response', message:{role:'assistant', timestamp:0,
    content:[{type:'text',text}, ...(call ? [{type:'tool_call',...call}] : [])]},
    stopReason:call?'tool_calls':'stop', usage:{status:'unavailable'},
    identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'offline-demo'},responseId:{status:'unavailable'}}});
  const script = [...calls.map(c=>response('Offline script: '+c.name+'.',c)), response('Offline script finished. Check the tool results and hello.js. Use :runs, then :replay RUN_ID. Replay reads saved events without executing tools.')];
  let exchanges=0,toolExecutions=0,networkAttempts=0; const checkpoints=[];
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Offline demo prohibits network'); };
  const adapter = {providerId:'OFFLINE / SCRIPTED',modelId:'pan-faux',reasoningLevel:'off',async exchange(request){
    const entry=script[exchanges++] ?? response('This demo contains one scripted task. Use :runs, :replay RUN_ID, or :exit.');
    checkpoints.push({event:'exchange',exchanges,toolExecutions});
    return new FauxModelAdapter([entry],{progress:async function*(_,signal){
      for(const fragment of entry.message.content[0].text.match(/.{1,5}/gu)??[]){if(signal.aborted)return;yield fragment;await delay(35);}
    }}).exchange(request);
  }};
  console.log('OFFLINE / SCRIPTED MODEL — actual installed TUI and tools. No API key or network.');
  console.log('Submit: Create hello.js, run it, and read it back.');
  console.log('Approve the displayed node hello.js command only if intended.');
  console.log('Then :runs → :replay RUN_ID → :exit. Files and archives: '+root);
  const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{
    home:join(root,'home'),createNativeAdapter:()=>adapter,
    createTools:cwd=>{const original=createPanTrustedLocalTools(cwd);return {...original,tools:original.tools.map(tool=>({...tool,async execute(call){toolExecutions++;checkpoints.push({event:'tool',name:tool.name,exchanges,toolExecutions});return tool.execute(call);}}))};},
  });
  await writeFile(join(root,'demo-report.json'),JSON.stringify({mode:'offline-scripted',code,exchanges,toolExecutions,networkAttempts,checkpoints},null,2)+'\n');
  console.log(`Demo closed: ${exchanges} scripted exchanges, ${toolExecutions} tool executions, ${networkAttempts} network attempts.`);
  return code;
}
