/** #52 installed configure driver: answers from verifier JSON; real or injected Keychain save. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const [product,home,answersFile,account,mode]=process.argv.slice(2);
if(!product||!home||!answersFile||!account||!mode)throw new Error('usage: config-configure-driver.mjs PRODUCT HOME ANSWERS_JSON ACCOUNT accept|decline|kimi|interrupt');
const {runCli,saveKeychainCredential,readKeychainCredential,keychainCredentialExists,loadPanSettings,panSettingsPath}=await import(pathToFileURL(join(product,'dist/index.js')));
const answers=JSON.parse(await readFile(answersFile,'utf8')).answers;
const reference={service:'com.pym96.pan-agent.workorder-52-test',account};
const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
let rendered='';output.on('data',c=>{rendered+=c;});
const hash=b=>createHash('sha256').update(b).digest('hex');
const pending=runCli(['configure'],{input,output,home,saveCredential:(secret,ref)=>saveKeychainCredential(secret,ref),keychainReference:reference});
for(const line of answers)input.write(line+'\n');
if(mode!=='interrupt')input.end();
let code,error=null;
try{code=await pending;}catch(e){error=String(e);code=1;}
const settingsPath=panSettingsPath(home);
let settings=null,settingsMode=null,settingsSha=null;
try{settings=JSON.parse(await readFile(settingsPath,'utf8'));settingsMode=(await stat(settingsPath)).mode&0o777;settingsSha=hash(await readFile(settingsPath));}catch{}
const itemExists=keychainCredentialExists(reference);
const report={mode,code,error,rendered,settings,settingsMode,settingsSha,itemExists,homeEntries:await readdir(home).catch(()=>[])};
await writeFile(join(home,'configure-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode,code,settings,itemExists},null,2));
process.exit(code ?? 1);
