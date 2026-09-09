import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfflineProcess } from './process.ts';
import { validateBinding, connectorEnvironment, subscriptionPreflight } from './connector-authority.ts';
import { type Manifest, type Attempt, insist } from './model.ts';
import { load } from './storage.ts';
export class CodexProcess extends OfflineProcess {
 launch(m:Manifest,a:Attempt,dir:string):void {
  insist(m.mode!=='offline','connector_mode_required');const b=validateBinding(m);
  chmodSync(dir,0o700);
  mkdirSync(join(m.workspace,'home'),{recursive:true,mode:0o700});
  if(b.stage==='B')subscriptionPreflight(m,b);
  const root=join(m.workspace,'state');
  insist(!existsSync(join(root,'stop.json')) && Date.now()<Math.min(load(root).expiry,a.intentAt+m.limits.roleMs),'launch_stopped_or_expired');
  const wrapper=fileURLToPath(new URL('../fixtures/codex-supervisor.mjs',import.meta.url));
  const child=spawn(m.executable,[...(b.stage==='A'?['--import',fileURLToPath(new URL('../fixtures/connector-guard.mjs',import.meta.url))]:[]),'--experimental-strip-types',wrapper,dir],{cwd:a.worktree,env:connectorEnvironment(m,b),detached:true,stdio:'ignore'});
  child.on('error',()=>{});child.unref();
 }
}
