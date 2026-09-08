/** Test-only instrumentation: actual CLI, physical PTY keys, controlled filesystem completion. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {createInterface} from 'node:readline';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,workspace,memory,controlFd,eventFd,mode]=process.argv.slice(2);
const compiled=product.endsWith('/pan-agent'),base=join(product,compiled?'dist':'typescript/src'),ext=compiled?'js':'ts';
const {runCli,FauxModelAdapter,createCompactPresentation}=await import(pathToFileURL(join(base,'index.'+ext)));
const {AttachmentPicker}=await import(pathToFileURL(join(base,'tui/attachment-picker.'+ext)));
const {TerminalInput}=await import(pathToFileURL(join(base,'tui/terminal-input.'+ext)));
let picker,terminal,outputBytes=0,exchanges=0,admissions=0,opens=0,reads=0,bytesRead=0,gateListing=false,gateCapture=false,faultSelection=false,faultHint=false;
const results=[],observations=[],contexts=[],keys=[],gates=new Map();let keyCount=0;
const stdout=process.stdout.write.bind(process.stdout);
process.stdout.write=function(chunk,...args){let text=String(chunk);if(faultSelection)text=text.replace(/│ > [^\r\n]+/g,'│ > WRONG-SELECTION');if(faultHint)text=text.replace(/Not submitted · (?:Enter Send|Write a task|Busy)/g,m=>' '.repeat(Array.from(m).length));outputBytes+=Buffer.byteLength(text)+(text.match(/\n/g)?.length??0);return stdout(text,...args);};
function state(){const p=picker?.picker,segments=p?[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(p.query)]:[];return {query:p?.query??null,cursor:p?segments.filter(s=>s.index<p.cursor).length:null,index:p?.index??null,chosen:p?.names.filter(n=>n.includes(p.query))[p.index]??null,loading:p?.loading??false,capturing:p?.capturing??false,attachments:picker?.selected??[],draft:terminal?.draft?.join('')??'',exchanges,admissions,opens,reads,bytesRead,results:[...results],keyCount,outputBytes};}
const notify=e=>fs.writeSync(Number(eventFd),JSON.stringify({...e,state:state()})+'\n');
function barrier(name){return new Promise(resolve=>{gates.set(name,resolve);notify({barrier:name});});}
const oldOpen=AttachmentPicker.prototype.open;AttachmentPicker.prototype.open=function(...args){picker=this;return oldOpen.apply(this,args);};
for(const name of ['show','summary']){const original=AttachmentPicker.prototype[name];AttachmentPicker.prototype[name]=function(...args){const result=original.apply(this,args);queueMicrotask(()=>notify({picker:name}));return result;};}
const oldPrompt=TerminalInput.prototype.setPrompt;TerminalInput.prototype.setPrompt=function(...args){terminal=this;return oldPrompt.apply(this,args);};
const oldStat=fsp.lstat;fsp.lstat=async function(path,...args){if(gateListing&&path===join(workspace,'.git')){gateListing=false;await barrier('listing');}return oldStat.call(this,path,...args);};
const oldFileOpen=fsp.open;fsp.open=async function(path,...args){const file=await oldFileOpen.call(this,path,...args);if(typeof path==='string'&&path.startsWith(workspace+'/')){opens++;const oldRead=file.read.bind(file);file.read=async function(...args){const result=await oldRead(...args);reads++;bytesRead+=result.bytesRead;if(gateCapture){gateCapture=false;await barrier('capture');}return result;};}return file;};syncBuiltinESMExports();
process.stdin.on('keypress',(text,key)=>{const event={text,key};keys.push(event);keyCount++;queueMicrotask(()=>notify({key:event}));});
const controls=createInterface({input:fs.createReadStream('',{fd:Number(controlFd),autoClose:false})});
controls.on('line',line=>{if(line==='gate-listing')gateListing=true;else if(line==='gate-capture')gateCapture=true;else if(line==='fault-selection-on')faultSelection=true;else if(line==='fault-selection-off')faultSelection=false;else if(line==='fault-hint-on')faultHint=true;else if(line==='fault-hint-off')faultHint=false;else if(line.startsWith('release-')){gates.get(line.slice(8))?.();gates.delete(line.slice(8));}notify({control:line});});
const response=text=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text}]},stopReason:'stop',usage:{status:'unavailable'},identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}}});
const faux=new FauxModelAdapter([response('Snapshot received.'),response('Next draft received.')],{progress:async function*(i){yield 'Working ';if(i===0)await barrier('model');yield 'offline.';}});
const adapter={providerId:faux.providerId,modelId:faux.modelId,reasoningLevel:faux.reasoningLevel,async exchange(request){exchanges++;contexts.push(request.context);return faux.exchange(request);}};
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter,createTools:()=>({tools:[],boundary:'offline'}),createPresentation:write=>{const view=createCompactPresentation(write);return {...view,observe(e){observations.push(e);if(e.type==='run.started')admissions++;view.observe(e);},settle(r){results.push(r);view.settle(r);queueMicrotask(()=>notify({settled:r}));},details(){view.details();queueMicrotask(()=>notify({view:'details'}));},replay(records,id){view.replay(records,id);queueMicrotask(()=>notify({view:'replay'}));}};}});
await fsp.writeFile(join(workspace,'..','report.json'),JSON.stringify({code,mode,keys,observations,contexts,...state()},null,2)+'\n');notify({exit:code});controls.close();process.exit(code);
