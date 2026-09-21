import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const POLICY = Object.freeze({
  version: '69/Criteria1.0', product_sha: 'c9fd25d7337ae9426c22b2829e365451b237d2e6',
  package_sha256: '98b190d97cce81a53706c0766dd94626c6a406f4b291764bfb919e2c70da345f',
  runtime_sha256: '6d9b75058698a2db046af1ea0462313ae4fce0c9b7118a97708d239df8c57f6b',
  provider: 'kimi-code', model: 'k3-256k', reasoning: 'high', kernel: 'native',
  endpoint: 'https://api.kimi.com/coding/v1/chat/completions',
  task: 'Call get_smoke_fixture exactly once with {}. Then reply with only the returned marker. Do not call any other tool.',
  tool: 'get_smoke_fixture', marker: 'PAN_K3_SMOKE_OK_20260921',
  attempts: 1, dispatches: 2, tool_executions: 1, max_tokens: 4096,
  request_bytes: 131072, response_bytes: 524288, dispatch_ms: 120000, attempt_ms: 300000,
});
export class Refusal extends Error { constructor(code) { super(code); this.code = code; } }
export function requireThat(ok, code) { if (!ok) throw new Refusal(code); }
export function readLock(file) {
  const bytes = fs.readFileSync(file); let lock;
  try { lock = JSON.parse(bytes); } catch { throw new Refusal('lock_invalid'); }
  requireThat(isDeepStrictEqual(lock, POLICY), 'lock_mismatch');
  return { lock, hash: sha256(bytes) };
}
export function validateActivation(a, binding, mode, wall = Date.now()) {
  requireThat(a && typeof a === 'object' && !Array.isArray(a), 'activation_invalid');
  const expected = ['version','mode','runner_sha','product_sha','package_sha256','lock_sha256','run_id','credential_env','account_confirmed','human_authorization','approval_reference','approved_at','starts_at','expires_at','ledger_root'];
  requireThat(isDeepStrictEqual(Object.keys(a).sort(), expected.sort()), 'activation_fields');
  requireThat(a.version === POLICY.version && a.mode === mode, 'activation_mode');
  for (const key of ['runner_sha','product_sha','package_sha256','lock_sha256']) {
    requireThat(typeof a[key] === 'string' && a[key] === binding[key] && /^[a-f0-9]+$/.test(a[key]), 'activation_binding');
  }
  requireThat(/^[a-f0-9]{40}$/.test(a.runner_sha) && !/^(.)\1+$/.test(a.runner_sha), 'runner_sha_invalid');
  requireThat(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.run_id), 'run_id_invalid');
  requireThat(/^[A-Z][A-Z0-9_]{2,63}$/.test(a.credential_env), 'credential_name_invalid');
  requireThat(a.account_confirmed === true && a.human_authorization === 'I authorize this exact single smoke attempt and its resource limits.', 'human_authorization_missing');
  requireThat(mode === 'synthetic' ? a.approval_reference === 'synthetic-only-not-authorization' : /^https:\/\/github\.com\/pym96\/Pan-agent\/issues\/\d+#issuecomment-\d+$/.test(a.approval_reference), 'approval_reference_invalid');
  const dates = ['approved_at','starts_at','expires_at'].map(k => typeof a[k] === 'string' ? Date.parse(a[k]) : NaN);
  requireThat(dates.every(Number.isFinite) && dates[0] <= dates[1] && dates[1] <= wall && wall < dates[2], 'activation_time');
  requireThat(typeof a.ledger_root === 'string' && path.isAbsolute(a.ledger_root) && path.normalize(a.ledger_root) === a.ledger_root, 'ledger_path_invalid');
  return a;
}
export const realClock = { now: () => performance.now(), schedule: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) };
function syncDirectory(dir) { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function durableCreate(file, value) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(path.dirname(file));
}
/** Never reclaimed: a crash, partial record, or failed admission consumes the activation. */
export class Attempt {
  constructor(activation, { clock = realClock, signal } = {}) {
    this.clock = clock; this.start = clock.now(); this.controller = new AbortController();
    this.calls = 0; this.tools = 0; this.active = false; this.reason = null; this.finished = false;
    this.dir = path.join(activation.ledger_root, activation.run_id);
    fs.mkdirSync(activation.ledger_root, { recursive: true, mode: 0o700 });
    try { fs.mkdirSync(this.dir, { mode: 0o700 }); } catch { throw new Refusal('activation_consumed'); }
    syncDirectory(activation.ledger_root);
    this.file = path.join(this.dir, 'records.jsonl');
    durableCreate(this.file, { type:'admitted', mode:activation.mode, run_id:activation.run_id,
      runner_sha:activation.runner_sha, product_sha:activation.product_sha,
      package_sha256:activation.package_sha256, lock_sha256:activation.lock_sha256, elapsed_ms:0 });
    this.timer = clock.schedule(() => this.stop('attempt_deadline'), POLICY.attempt_ms);
    this.external = signal; this.onAbort = () => this.stop('cancelled');
    signal?.addEventListener('abort', this.onAbort, { once:true });
    if (signal?.aborted) this.stop('cancelled');
  }
  elapsed() { return Math.max(0, this.clock.now()-this.start); }
  record(value) {
    const fd = fs.openSync(this.file, 'a');
    try { fs.writeFileSync(fd, JSON.stringify({ ...value, elapsed_ms:this.elapsed() })+'\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  }
  stop(code) {
    if (this.reason || this.finished) return;
    this.reason = code;
    // Abort even if persistence fails; never allow a ledger failure to leave permission alive.
    try { this.record({type:'stop', code}); } finally { this.controller.abort(); this.onStop?.(); }
  }
  check(signal) {
    if (signal?.aborted) this.stop('cancelled');
    if (this.elapsed() >= POLICY.attempt_ms) this.stop('attempt_deadline');
    if (this.dispatchStart !== undefined && this.clock.now()-this.dispatchStart >= POLICY.dispatch_ms) this.stop('dispatch_deadline');
    requireThat(!this.reason && !this.finished, this.reason ?? 'attempt_finished');
  }
  reserve(bytes, signal) {
    this.check(signal);
    if (this.active || this.calls >= POLICY.dispatches) { this.stop('dispatch_budget'); throw new Refusal('dispatch_budget'); }
    this.dispatchStart = this.clock.now(); this.calls++; this.active = true;
    this.record({type:'reserved', ordinal:this.calls, request_bytes:bytes});
    this.check(signal); // fsync time belongs to both deadlines.
    this.dispatchTimer = this.clock.schedule(() => this.stop('dispatch_deadline'), Math.max(0, POLICY.dispatch_ms-(this.clock.now()-this.dispatchStart)));
    return this.calls;
  }
  finishDispatch() { this.clock.clear(this.dispatchTimer); this.dispatchStart = undefined; this.active = false; }
  tool(id, signal) {
    this.check(signal);
    if (this.tools >= 1) { this.stop('tool_budget'); throw new Refusal('tool_budget'); }
    this.tools++; this.record({type:'tool', ordinal:this.tools, tool_call_id:id}); this.check(signal);
  }
  settle(terminal) {
    try { this.check(); } catch { /* retain deadline as authoritative */ }
    this.record({type:'terminal', ...terminal, stop:this.reason});
    const prior = this.reason;
    try { this.check(); } catch { /* include time spent persisting terminal */ }
    if (this.reason !== prior) this.record({type:'terminal', ...terminal, stop:this.reason});
    this.finished = true; this.clock.clear(this.timer); this.finishDispatch();
    this.external?.removeEventListener('abort', this.onAbort);
  }
}
export async function abortRace(promise, signal) {
  let abort;
  const cancelled = new Promise((_, reject) => { abort = () => reject(new Refusal('cancelled')); signal.addEventListener('abort', abort, {once:true}); });
  try { if (signal.aborted) throw new Refusal('cancelled'); return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
export function capRequest(request) {
  requireThat(request.method === 'POST' && request.path === '/chat/completions', 'request_route');
  requireThat(isDeepStrictEqual(request.headers, { 'content-type':'application/json', accept:'text/event-stream' }), 'request_headers');
  let body; try { body = JSON.parse(request.body); } catch { throw new Refusal('request_json'); }
  requireThat(body && isDeepStrictEqual(Object.keys(body).sort(), ['model','messages','stream','stream_options','reasoning_effort','tools'].sort()), 'request_fields');
  requireThat(body.model === POLICY.model && body.reasoning_effort === POLICY.reasoning && body.stream === true && isDeepStrictEqual(body.stream_options,{include_usage:true}), 'request_profile');
  requireThat(Array.isArray(body.messages) && isDeepStrictEqual(body.tools, [{type:'function',function:{name:POLICY.tool,description:'Return the fixed smoke fixture.',parameters:{type:'object',properties:{},additionalProperties:false}}}]), 'request_tools');
  const encoded = JSON.stringify({...body, max_tokens:POLICY.max_tokens});
  requireThat(Buffer.byteLength(encoded) <= POLICY.request_bytes, 'request_bytes');
  return encoded;
}
/** Public Kimi transport wrapper: no retries; cap is the only wire mutation. */
export function guardedTransport(attempt, upstream) {
  return { async send(request) {
    let iterator; let ordinal; let count = 0;
    const signal = AbortSignal.any([request.signal, attempt.controller.signal]);
    try {
      attempt.check(signal);
      const body = capRequest(request);
      ordinal = attempt.reserve(Buffer.byteLength(body), signal);
      const response = await abortRace(Promise.resolve().then(() => { attempt.check(signal); return upstream.send({...request, body, signal}); }), signal);
      attempt.check(signal);
      requireThat(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, 'http_status_invalid');
      attempt.record({type:'http',ordinal,status:response.status});
      if (response.status < 200 || response.status >= 300) {
        attempt.stop('http_refusal');
        try { void Promise.resolve(response.body[Symbol.asyncIterator]().return?.()).catch(()=>{}); } catch {}
        throw new Refusal('http_refusal');
      }
      iterator = response.body[Symbol.asyncIterator]();
      return {status:response.status, body: { async *[Symbol.asyncIterator]() {
        let complete = false;
        try {
          while (true) {
            attempt.check(signal);
            const item = await abortRace(Promise.resolve().then(()=>iterator.next()), signal);
            attempt.check(signal);
            if (item.done) { complete = true; break; }
            requireThat(item.value instanceof Uint8Array, 'response_chunk');
            if (count + item.value.byteLength > POLICY.response_bytes) throw new Refusal('response_bytes');
            count += item.value.byteLength;
            yield item.value;
          }
        } catch (error) { attempt.stop(error instanceof Refusal ? error.code : 'transport_failure'); throw new Refusal(attempt.reason); }
        finally {
          attempt.record({type:'stream',ordinal,response_bytes:count,complete});
          if (!complete && !attempt.reason) attempt.stop('stream_incomplete');
          attempt.finishDispatch();
          try { void Promise.resolve(iterator.return?.()).catch(()=>{}); } catch {}
        }
      }}};
    } catch (error) {
      attempt.stop(error instanceof Refusal ? error.code : 'transport_failure');
      attempt.finishDispatch();
      throw new Refusal(attempt.reason);
    }
  }};
}
/** Only retained, allowlisted records enter reports; no provider, credential or tool callbacks. */
export function reconstruct(records) {
  const admission = records.find(r=>r.type==='admitted');
  const terminal = records.findLast(r=>r.type==='terminal');
  const responses = records.filter(r=>r.type==='response');
  const calls = records.filter(r=>r.type==='reserved').map(r=>({ordinal:r.ordinal,elapsed_ms:r.elapsed_ms,request_bytes:r.request_bytes,
    dispatched:records.some(x=>x.type==='dispatch' && x.ordinal===r.ordinal),
    status:records.find(x=>x.type==='http' && x.ordinal===r.ordinal)?.status ?? 'unavailable',
    response_bytes:records.find(x=>x.type==='stream' && x.ordinal===r.ordinal)?.response_bytes ?? 'unavailable'}));
  const oracle = Boolean(terminal?.oracle_met && !terminal.stop && responses.length===2 && records.filter(r=>r.type==='tool').length===1);
  return {version:POLICY.version, mode:admission?.mode ?? 'unavailable',
    binding:admission ? Object.fromEntries(['runner_sha','product_sha','package_sha256','lock_sha256','run_id'].map(k=>[k,admission[k]])) : null,
    evidence_complete:Boolean(terminal), oracle_met:oracle,
    smoke_success:admission?.mode==='live' && oracle, live_compatibility_demonstrated:admission?.mode==='live' && oracle,
    requested_model:POLICY.model, responses:responses.map(r=>({ordinal:r.ordinal,model:r.model,usage:r.usage})),
    calls, reserved_dispatches:calls.length, upstream_dispatch_attempts:records.filter(r=>r.type==='dispatch').length, tool_executions:records.filter(r=>r.type==='tool').length,
    terminal:terminal ? {status:terminal.status,stop:terminal.stop,archive_sealed:terminal.archive_sealed} : {status:'uncertain',stop:'unavailable',archive_sealed:false},
    subscription_quota:'unknown', monetary_cost:'unknown', planned_new_payments:0,
    limits:'Requested max_tokens is not a proven quota ceiling; abort does not prove server computation or billing stopped.'};
}
export function readRecords(file) { return fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line)); }
