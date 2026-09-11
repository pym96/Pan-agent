/** #53 Human Kimi demo: real PanKimiModelAdapter streaming the frozen wires through a scripted no-network transport. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const [product,workspace,memory,fixturePath,settingsHome]=process.argv.slice(2);
if(!product||!workspace||!memory||!fixturePath)throw new Error('usage: kimi-interactive-driver.mjs INSTALLED_PACKAGE WORKSPACE MEMORY FIXTURE [SETTINGS_HOME]');
const fixture=JSON.parse(await fsp.readFile(fixturePath,'utf8'));
const recordsRoot=join(workspace,'..');
const transcript=join(recordsRoot,'terminal-output.pty');
const write=process.stdout.write.bind(process.stdout);
let outputBytes=0;
process.stdout.write=function(chunk,...args){const s=String(chunk);fs.appendFileSync(transcript,s);outputBytes+=Buffer.byteLength(s);return write(s,...args);};
const {runCli,PanKimiModelAdapter}=await import(pathToFileURL(join(product,'dist/index.js')));
let exchanges=0;
const scriptedTransport={
 async send(request){
  const index=exchanges++;
  const wire=fixture.exchanges[Math.min(index,fixture.exchanges.length-1)].wire;
  const bytes=new TextEncoder().encode(wire);
  return {status:200,body:(async function*(){for(let i=0;i<bytes.length;i+=11){yield bytes.slice(i,i+11);await delay(25);}})()};
 },
};
let networkAttempts=0;globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline preview prohibits network');};
console.log('OFFLINE / SIMULATED KIMI PREVIEW · actual installed Pan Product · real PanKimiModelAdapter over scripted frozen wires · no network, no credentials.');
console.log('Confirm y, then enter the frozen first task exactly:');
console.log('  Create hello.js, run it and verify its exact source.');
console.log('Watch it write hello.js, run node hello.js and read the source back. Afterwards try :runs, :replay RUN_ID and :exit.');
console.log('Local recording directory: '+recordsRoot);
const deps={createKimiAdapter:profile=>new PanKimiModelAdapter(profile,{transport:scriptedTransport})};
if(settingsHome)deps.home=settingsHome;
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],deps);
await fsp.writeFile(join(recordsRoot,'report.json'),JSON.stringify({code,fixture:fixture.id,exchanges,networkAttempts,outputBytes,terminal:process.env.TERM,settingsHome:settingsHome??null},null,2)+'\n');
console.log(`OFFLINE Kimi preview closed · Kimi exchanges=${exchanges} · network attempts=${networkAttempts} · records=${memory}`);
process.exit(code);
