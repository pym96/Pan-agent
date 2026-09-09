import { existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest, insist, Refusal, type Ledger } from './model.ts';
export function atomic(path: string, value: unknown): void {
  const temp = `${path}.${process.pid}.tmp`; const fd = openSync(temp,'wx',0o600);
  try { writeFileSync(fd, JSON.stringify(value)+'\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp,path);
}
export function read(path: string): any { return JSON.parse(readFileSync(path,'utf8')); }
export function save(root: string, ledger: Ledger): void { atomic(join(root,'ledger.json'),{digest:digest(ledger),ledger}); }
export function load(root: string): Ledger { try { const x=read(join(root,'ledger.json')); insist(x.digest === digest(x.ledger),'corrupt_ledger'); return x.ledger; } catch { throw new Refusal('corrupt_ledger'); } }
export function birth(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try {
    const stat=execFileSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8'}).trim();
    if(!stat || stat.startsWith('Z')) return null;
    const identity=execFileSync('/bin/ps',['-p',String(pid),'-o','lstart=','-o','command='],{encoding:'utf8'}).trim();
    // A short-lived wrapper may exit between the status and identity reads.
    // Confirm it is still live before treating changed command text as PID reuse.
    const after=execFileSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8'}).trim();
    if(!after || after.startsWith('Z'))return null;
    return identity || null;
  } catch(e:any) { if(e.status===1)return null;throw new Refusal('process_inventory_unknown'); }
}
export function acquire(root: string): () => void {
  mkdirSync(root,{recursive:true}); const p=join(root,'owner.json');
  try { const fd=openSync(p,'wx',0o600); writeFileSync(fd,JSON.stringify({pid:process.pid,birth:birth(process.pid)})); closeSync(fd); }
  catch { throw new Refusal('owner_busy'); }
  return () => { if(existsSync(p)) { const x=read(p); if(x.pid===process.pid && x.birth===birth(process.pid)) unlinkSync(p); } };
}
// Explicit reconciliation only: a positively absent owner may be retired. A reused PID is never signaled or stolen.
export function reconcileOwner(root: string): void {
  const p=join(root,'owner.json'); if(!existsSync(p)) return;
  const x=read(p); insist(Number.isSafeInteger(x.pid) && typeof x.birth==='string','owner_uncertain');
  const actual=birth(x.pid); insist(actual===null,'owner_busy_or_identity_mismatch');
  renameSync(p,join(root,`retired-owner-${Date.now()}.json`));
}
export interface Tracker { publish(key: string, result: unknown): void; lookup(key: string): unknown | null; }
export class OfflineTracker implements Tracker {
  readonly root: string; constructor(root: string) { this.root=root; mkdirSync(root,{recursive:true}); }
  lookup(key: string): unknown | null { const p=join(this.root,`${key}.json`); try{return existsSync(p)?read(p):null;}catch{throw new Refusal('tracker_unknown');} }
  publish(key: string, result: unknown): void {
    const old=this.lookup(key); if(old!==null) { insist(digest(old)===digest(result),'publication_conflict'); return; }
    const fd=openSync(join(this.root,`${key}.json`),'wx',0o600); try { writeFileSync(fd,JSON.stringify(result)+'\n');fsyncSync(fd); } finally {closeSync(fd);}
  }
}
