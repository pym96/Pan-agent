/** Offline installed-package fixture. No provider, tool or network operation is permitted. */
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const [installed,root,mode='live']=process.argv.slice(2);
const {runCli,FauxModelAdapter}=await import(pathToFileURL(join(resolve(installed),'dist/index.js')));
const text='# Recovery report\n\n## Result\n- **Passed**: seven checks\n- Output: `recovered.json`\n1. Inspect the original files\n2. Recover records and verify\n\n```python\nrows = [{"id": 1, "name": "apple"}]\nprint("**literal code**", rows)\n```\n\n中文说明：保留原始记录 👩‍💻\nPartial syntax stays visible: **unfinished';
for(const name of ['workspace','archives','home'])await mkdir(join(root,name),{recursive:true});
let scriptedExchanges=0,providerCalls=0,toolCalls=0,networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('network forbidden');};
const hashes=async()=>{const files=await readdir(join(root,'archives'),{recursive:true});return Object.fromEntries(await Promise.all(files.filter(x=>/\.jsonl?$/.test(x)).map(async f=>[f,createHash('sha256').update(await readFile(join(root,'archives',f))).digest('hex')])));};
const before=await hashes();
const adapter={providerId:'OFFLINE SCRIPTED',modelId:'markdown-fixture',reasoningLevel:'off',async exchange(request){
 if(mode!=='live'){providerCalls++;throw Error('replay provider forbidden');}scriptedExchanges++;
 return new FauxModelAdapter([{kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text}]},stopReason:'stop',usage:{status:'unavailable'},identity:{provider:{status:'reported',value:'offline'},model:{status:'reported',value:'fixture'},responseId:{status:'unavailable'}}}],{progress:async function*(){for(const fragment of text.match(/[\s\S]{1,8}/gu)??[]){yield fragment;await delay(30);}}}).exchange(request);
}};
const code=await runCli(['--kernel','native','--workspace',join(root,'workspace'),'--memory-root',join(root,'archives')],{home:join(root,'home'),createNativeAdapter:()=>adapter,createTools:()=>({boundary:'trusted-local',tools:[{name:'read',description:'forbidden',parameters:{type:'object'},validate:value=>({ok:true,value}),async execute(){toolCalls++;throw Error('tools forbidden');}}]})});
const after=await hashes();await writeFile(join(root,mode+'-report.json'),JSON.stringify({code,mode,scriptedExchanges,providerCalls,toolCalls,networkCalls,archiveUnchanged:JSON.stringify(before)===JSON.stringify(after),before,after,fixture:text},null,2)+'\n');
if(code||providerCalls||toolCalls||networkCalls||mode!=='live'&&JSON.stringify(before)!==JSON.stringify(after))process.exitCode=1;
