/** #62 installed scroll PTY driver: real DailyWorkspace, long streamed Faux transcript, per-key timing records. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,workspace,memory]=process.argv.slice(2);
if(!product||!workspace||!memory)throw new Error('usage: scroll-pty-driver.mjs INSTALLED_PACKAGE WORKSPACE MEMORY');
const recordsRoot=join(workspace,'..');
const {runCli,FauxModelAdapter}=await import(pathToFileURL(join(product,'dist/index.js')));
const {DailyWorkspace}=await import(pathToFileURL(join(product,'dist/tui/daily-workspace.js')));
const transcript=join(recordsRoot,'terminal-output.pty');
const write=process.stdout.write.bind(process.stdout);
let outputBytes=0;
process.stdout.write=function(chunk,...args){const s=String(chunk);fs.appendFileSync(transcript,s);outputBytes+=Buffer.byteLength(s);return write(s,...args);};
let ui,keyCount=0,admissions=0,exchanges=0;
const wheelTimings=[],dimensions=[],keys=[];
const oldDraw=DailyWorkspace.prototype.draw;DailyWorkspace.prototype.draw=function(...args){ui=this;const size=[process.stdout.columns,process.stdout.rows];if(JSON.stringify(dimensions.at(-1))!==JSON.stringify(size))dimensions.push(size);return oldDraw.apply(this,args);};
const oldKey=DailyWorkspace.prototype.key;DailyWorkspace.prototype.key=function(...args){keyCount++;return oldKey.apply(this,args);};
const oldScroll=DailyWorkspace.prototype.scroll;
DailyWorkspace.prototype.scroll=function(delta){const t0=performance.now();const r=oldScroll.apply(this,arguments);wheelTimings.push({delta,ms:performance.now()-t0,top:this.top,follow:this.follow,anchor:this.anchor?{...this.anchor}:null,builds:this.layoutStats.builds,visits:this.layoutStats.sourceRowVisits});return r;};
const long=Array.from({length:800},(_,i)=>'Transcript line '+String(i+1).padStart(3,'0')+' · '+(i%5===4?'中é👩‍💻 '.repeat(8):'x'.repeat(40))).join('\n');
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=text=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text}]},stopReason:'stop',usage:{status:'unavailable'},identity});
const adapter={providerId:'pan-faux (offline/simulated)',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){
 const index=exchanges++;
 const text=index===0?long:'Offline scroll demo: replay is view only. Use :runs, :replay RUN_ID or :exit.';
 return new FauxModelAdapter([response(text)],{progress:async function*(signal){for(let i=0;i<text.length;i+=64){if(signal.aborted)return;yield text.slice(i,i+64);if(index===0)await new Promise(r=>setTimeout(r,1));}}}).exchange(request);
}};
let networkAttempts=0;globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline demo prohibits network');};
console.log('OFFLINE / SIMULATED SCROLL DEMO · installed Product · long transcript · wheel/PageUp/PageDown/Ctrl-End · resize freely.');
console.log('Confirm y, then enter any short task (e.g. demo) to receive an 800-line transcript, then scroll.');
console.log('Local recording directory: '+recordsRoot);
process.on('SIGUSR2',async()=>{
 await fsp.writeFile(join(recordsRoot,'scroll-report.json'),JSON.stringify({keyCount,admissions,exchanges,networkAttempts,outputBytes,dimensions,wheelTimings,layoutStats:ui?.layoutStats??null,top:ui?.top,follow:ui?.follow,newOutput:ui?.newOutput,entries:ui?.entries.length,terminal:process.env.TERM},null,2)+'\n');
 process.exit(0);
});
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
await fsp.writeFile(join(recordsRoot,'scroll-report.json'),JSON.stringify({code,keyCount,admissions,exchanges,networkAttempts,outputBytes,dimensions,wheelTimings,layoutStats:ui?.layoutStats??null,top:ui?.top,follow:ui?.follow,newOutput:ui?.newOutput,entries:ui?.entries.length,terminal:process.env.TERM},null,2)+'\n');
process.exit(code);
