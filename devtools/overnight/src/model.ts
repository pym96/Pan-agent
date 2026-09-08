import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const HOME = fileURLToPath(new URL('../', import.meta.url));
export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const templates = {
  builder: 'SIMULATED Working Agent. Implement only the frozen issue in the allowed candidate worktree. Emit a SHA-bound Handoff. No role grants, main mutation or acceptance.',
  regulator: 'SIMULATED Regulator Agent. Separate session and clean exact-remote-SHA worktree. Read only frozen contract and public evidence. Emit a SHA-bound Verdict. Never invent Human evidence or change criteria.'
} as const;
export type Role = keyof typeof templates;
export const digest = (x: unknown): string => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export const fileDigest = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
export class Refusal extends Error { category: string; constructor(category: string) { super(category); this.category=category; } }
export const insist = (v: unknown, why = 'invalid_identity'): void => { if (!v) throw new Refusal(why); };
export const hex = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
export const hash = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
export const ident = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
export function keys(x: any, names: string[]): void { insist(x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join() === names.sort().join(), 'invalid_schema'); }
export function integer(x: unknown, min: number, max: number): void { insist(typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max, 'invalid_limits'); }
export interface Manifest {
  mode: 'offline'; job: string; repository: string; issue: number; base: string; branch: string;
  version: string; contractDigest: string; criteria: string[]; highRisk: string[]; humanProof: string | null;
  workspace: string; executable: string; templates: Record<Role, string>;
  limits: { repairs: number; totalMs: number; roleMs: number };
  authorization: { id: string; digest: string };
}
export function manifestCore(m: Manifest): object { const { authorization, ...core } = m; return core; }
export function shape(m: any): asserts m is Manifest {
  if (m?.mode !== 'offline') throw new Refusal('offline_only');
  keys(m, ['mode','job','repository','issue','base','branch','version','contractDigest','criteria','highRisk','humanProof','workspace','executable','templates','limits','authorization']);
  insist(ident(m.job) && ident(m.repository) && hex(m.base)); integer(m.issue, 1, 2147483647);
  insist(m.branch === `workorder/${m.issue}-candidate` && typeof m.version==='string' && /^\d+\.\d+$/.test(m.version));
  insist(hash(m.contractDigest) && Array.isArray(m.criteria) && m.criteria.length > 0 && m.criteria.every(ident) && new Set(m.criteria).size === m.criteria.length);
  insist(Array.isArray(m.highRisk) && m.highRisk.every((x: string) => m.criteria.includes(x)) && new Set(m.highRisk).size === m.highRisk.length);
  insist(m.humanProof === null || hash(m.humanProof));
  keys(m.templates, ['builder','regulator']); for (const r of ['builder','regulator'] as Role[]) insist(m.templates[r] === digest(templates[r]), 'role_template_mismatch');
  keys(m.limits, ['repairs','totalMs','roleMs']); integer(m.limits.repairs, 0, 2); integer(m.limits.totalMs, 1, 28800000); integer(m.limits.roleMs, 1, 3600000);
  keys(m.authorization, ['id','digest']); insist(ident(m.authorization.id) && hash(m.authorization.digest));
  insist(typeof m.workspace === 'string' && resolve(m.workspace) === m.workspace && m.executable === process.execPath, 'path_or_executable');
}
export function validate(m: unknown): Manifest {
  shape(m); insist(realpathSync(m.workspace) === m.workspace, 'path_or_executable');
  const auth = JSON.parse(readFileSync(join(m.workspace, 'authorization.json'), 'utf8'));
  keys(auth, ['id','manifestDigest']); insist(auth.id === m.authorization.id && auth.manifestDigest === digest(manifestCore(m)) && digest(auth) === m.authorization.digest, 'authorization_mismatch');
  const repo = JSON.parse(readFileSync(join(m.workspace,'repository.json'),'utf8')); keys(repo,['id']); insist(repo.id === m.repository);
  for (const p of ['remote.git','repo','worktrees','contract.txt']) insist(!lstatSync(join(m.workspace,p)).isSymbolicLink(), 'path_or_executable');
  insist(fileDigest(join(m.workspace,'contract.txt')) === m.contractDigest, 'contract_drift');
  if (m.humanProof !== null) {
    const p = join(m.workspace, 'human-proof.json'); insist(fileDigest(p) === m.humanProof, 'human_evidence_missing');
    const proof = JSON.parse(readFileSync(p,'utf8')); keys(proof,['simulation','authorization','criteria']);
    insist(proof.simulation === 'SIMULATED' && proof.authorization === m.authorization.id && JSON.stringify(proof.criteria) === JSON.stringify(m.highRisk),'human_evidence_missing');
  }
  return m;
}
export interface Attempt { key: string; role: Role; number: number; session: string; candidate: string; worktree: string; intentAt: number; phase: 'intent'|'launched'|'publishing'|'recorded'; pid?: number; birth?: string; resultDigest?: string; }
export interface Ledger { simulation: 'SIMULATED'; manifest: Manifest; manifestDigest: string; state: string; reason: string; created: number; expiry: number; lastWall: number; candidate: string; repairs: number; attempts: Attempt[]; transitions: {state: string; at: number}[]; }
export interface Result { simulation: 'SIMULATED'; kind: 'handoff'|'verdict'; job: string; repository: string; issue: number; version: string; contractDigest: string; authorization: string; role: Role; template: string; session: string; key: string; candidate: string; outcome: string; blockers: string[]; evidence: { name: string; digest: string }; }
export function resultShape(r: any, m: Manifest, a: Attempt): asserts r is Result {
  keys(r, ['simulation','kind','job','repository','issue','version','contractDigest','authorization','role','template','session','key','candidate','outcome','blockers','evidence']);
  insist(r.simulation === 'SIMULATED' && r.kind === (a.role === 'builder' ? 'handoff' : 'verdict') && r.role === a.role && r.job === m.job && r.repository === m.repository && r.issue === m.issue && r.version === m.version && r.contractDigest === m.contractDigest && r.authorization === m.authorization.digest && r.template === m.templates[a.role] && r.session === a.session && r.key === a.key && hex(r.candidate), 'result_identity');
  insist(Array.isArray(r.blockers) && r.blockers.every((x: unknown) => typeof x === 'string' && m.criteria.includes(x as string)) && new Set(r.blockers).size === r.blockers.length, 'unknown_criterion');
  const outcomes = a.role === 'builder' ? ['handoff','scope_challenge','quota_unavailable'] : ['accepted','criterion_failed','evidence_incomplete','scope_challenge','quota_unavailable'];
  insist(outcomes.includes(r.outcome) && (r.outcome === 'criterion_failed' ? r.blockers.length > 0 : r.blockers.length === 0), 'malformed_result');
  keys(r.evidence,['name','digest']); insist(r.evidence.name === 'evidence.json' && hash(r.evidence.digest), 'evidence_missing');
}
export function safe(x: unknown): string { return JSON.stringify(x).replace(/[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`); }
