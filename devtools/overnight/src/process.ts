import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { atomic, read, birth } from './storage.ts';
import { FIXTURES, insist, type Attempt, type Manifest } from './model.ts';
export const environment = (workspace: string): NodeJS.ProcessEnv => ({PATH:'/usr/bin:/bin',HOME:workspace,LANG:'C',LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'});
export function git(cwd: string, args: string[]): string { return execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','protocol.allow=never','-c','protocol.file.allow=always','-c','credential.helper=',...args],{cwd,env:environment(cwd),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
export interface Receipt { pid: number; birth: string; key: string; session: string; }
export interface ProcessAdapter {
  launch(m: Manifest, a: Attempt, dir: string): void;
  receipt(dir: string): Receipt | null;
  completion(dir: string): {exit: number|null} | null;
  cleanup(receipt: Receipt, dir: string): Promise<boolean>;
}
export function members(group: number): {pid:number;group:number;stat:string}[] {
  const s=execFileSync('/bin/ps',['-axo','pid=,pgid=,stat='],{encoding:'utf8'});
  return s.trim().split('\n').map(x=>x.trim().split(/\s+/)).map(x=>({pid:Number(x[0]),group:Number(x[1]),stat:x[2]!})).filter(x=>x.group===group && !x.stat.startsWith('Z'));
}
export const pause = (ms: number): Promise<void> => new Promise(r=>setTimeout(r,ms));
export class OfflineProcess implements ProcessAdapter {
  launch(m: Manifest, a: Attempt, dir: string): void {
    const child=spawn(m.executable,['--import',join(FIXTURES,'offline-guard.mjs'),join(FIXTURES,'supervisor.mjs'),dir],{cwd:a.worktree,env:environment(m.workspace),detached:true,stdio:'ignore'});
    child.on('error',()=>{}); child.unref();
  }
  receipt(dir: string): Receipt|null { return existsSync(join(dir,'receipt.json'))?read(join(dir,'receipt.json')):null; }
  completion(dir: string): {exit:number|null}|null { return existsSync(join(dir,'completion.json'))?read(join(dir,'completion.json')):null; }
  async cleanup(r: Receipt, dir: string): Promise<boolean> {
    const t0=performance.now(); const observations: unknown[]=[]; let term:number|null=null,kill:number|null=null;
    if (birth(r.pid)!==r.birth) {
      const empty=birth(r.pid)===null && members(r.pid).length===0;
      atomic(join(dir,'cleanup.json'),{t0,term,kill,confirmed:empty,reason:empty?'already_absent':'identity_unconfirmed',observations}); return empty;
    }
    const signal=(name: NodeJS.Signals):void=>{try{process.kill(-r.pid,name);}catch{}};
    term=performance.now();signal('SIGTERM');
    while(performance.now()-t0<=2000) {
      const live=members(r.pid);observations.push({at:performance.now(),members:live});
      if(live.length===0) {atomic(join(dir,'cleanup.json'),{t0,term,kill,confirmed:true,elapsed:performance.now()-t0,observations});return true;}
      if(kill===null && performance.now()-term>=150) {kill=performance.now();signal('SIGKILL');}
      await pause(15);
    }
    atomic(join(dir,'cleanup.json'),{t0,term,kill,confirmed:false,elapsed:performance.now()-t0,observations});return false;
  }
}
export function checkReceipt(r: Receipt, a: Attempt): void { insist(r && Number.isSafeInteger(r.pid) && r.pid>1 && typeof r.birth==='string' && r.birth.includes('supervisor.mjs') && r.key===a.key && r.session===a.session, 'process_identity'); }
