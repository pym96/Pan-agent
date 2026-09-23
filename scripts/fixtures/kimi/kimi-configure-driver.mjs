/** Offline installed configure probe: no system Keychain operation is permitted. */
import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const [product,home,answersFile,account,mode]=process.argv.slice(2);
const {runCli,panSettingsPath}=await import(pathToFileURL(join(product,'dist/index.js')));
const answers=JSON.parse(await readFile(answersFile,'utf8')).answers;
const input=new PassThrough(),output=new PassThrough();let rendered='',keychainCalls=0;
output.setEncoding('utf8');output.on('data',chunk=>rendered+=chunk);
const pending=runCli(['configure'],{input,output,home,saveCredential:()=>{keychainCalls++;throw Error('Keychain forbidden in offline probe');}});
input.end(answers.map(line=>line+'\n').join(''));
const code=await pending;let settings=null,settingsMode=null,settingsSha=null;
try{const path=panSettingsPath(home),bytes=await readFile(path);settings=JSON.parse(bytes);settingsMode=(await stat(path)).mode&0o777;settingsSha=createHash('sha256').update(bytes).digest('hex');}catch{}
if(keychainCalls!==0)throw Error('unexpected Keychain save selection');
await writeFile(join(home,'configure-report.json'),JSON.stringify({mode,code,rendered,settings,settingsMode,settingsSha,keychainCalls,homeEntries:await readdir(home)},null,2)+'\n');
process.exitCode=code;
