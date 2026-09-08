import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { digest, templates, type Manifest, manifestCore } from './model.ts';
import { atomic } from './storage.ts';
import { git } from './process.ts';
export function fixture(kind='repair', root?:string): {manifest:Manifest;config:string;state:string;workspace:string} {
  const workspace=realpathSync(root??mkdtempSync(join(tmpdir(),'pan-overnight-SIMULATED-')));
  mkdirSync(join(workspace,'worktrees'));git(workspace,['init','--bare','remote.git']);git(workspace,['init','-b','main','repo']);
  const repo=join(workspace,'repo');writeFileSync(join(repo,'README.md'),'SIMULATED disposable job\n');git(repo,['add','README.md']);
  git(repo,['-c','user.name=Offline Fixture','-c','user.email=offline@example.invalid','commit','-m','SIMULATED base']);
  git(repo,['remote','add','origin',join(workspace,'remote.git')]);git(repo,['push','origin','main']);
  const base=git(repo,['rev-parse','HEAD']);const contract='SIMULATED contract 1.0\nC-DEMO-01: create a synthetic file; independent review required.\n';
  writeFileSync(join(workspace,'contract.txt'),contract);atomic(join(workspace,'repository.json'),{id:'synthetic-repository'});
  atomic(join(workspace,'scenario.json'),{kind});
  const manifest:Manifest={mode:'offline',job:'synthetic-job',repository:'synthetic-repository',issue:45001,base,branch:'workorder/45001-candidate',version:'1.0',contractDigest:digest(contract),criteria:['C-DEMO-01'],highRisk:[],humanProof:null,workspace,executable:process.execPath,templates:{builder:digest(templates.builder),regulator:digest(templates.regulator)},limits:{repairs:2,totalMs:60000,roleMs:10000},authorization:{id:'synthetic-authorization',digest:''}};
  git(repo,['push','origin',`HEAD:refs/heads/${manifest.branch}`]);
  authorize(manifest);return {manifest,config:join(workspace,'manifest.json'),state:join(workspace,'state'),workspace};
}
export function authorize(m:Manifest):void {
  const auth={id:m.authorization.id,manifestDigest:digest(manifestCore(m))};m.authorization.digest=digest(auth);
  atomic(join(m.workspace,'authorization.json'),auth);atomic(join(m.workspace,'manifest.json'),m);
}
