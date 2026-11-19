/** End-to-end checks of the installed command using only disposable, owned Git projects. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const [cli, out] = process.argv.slice(2).map((resolvePath) => resolve(resolvePath));
mkdirSync(out, { mode: 0o700 });
const home = join(out, 'home');
mkdirSync(home);
const env = { PATH: process.env.PATH, HOME: home, TMPDIR: out };
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const results = [];
async function run(label, args, { observe, environment = env } = {}) {
  const child = spawn(cli, ['delivery', ...args], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const settled = new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', (code, signal) => done({ code, signal }));
  });
  let stderr = '',
    observerFailure;
  const events = [];
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  try {
    const lines = createInterface({ input: child.stdout });
    for await (const line of lines) {
      appendFileSync(join(out, label + '.stdout'), line + '\n');
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      events.push(event);
      try {
        observe?.(event, child);
      } catch (error) {
        observerFailure = error;
        child.kill('SIGKILL');
      }
    }
    const exit = await settled;
    writeFileSync(join(out, label + '.stderr'), stderr);
    if (observerFailure) throw observerFailure;
    results.push({ label, ...exit });
    return { ...exit, events };
  } finally {
    clearTimeout(timer);
  }
}
const demo = join(out, 'example'),
  demoState = join(demo, 'delivery');
const good = await run('demo', ['demo', '--directory', demo]);
assert.equal(good.code, 0);
const type = (run, name) => run.events.filter((event) => event.type === name);
const verdicts = type(good, 'goal.verdict').map((event) => event.verdict);
assert.deepEqual(
  verdicts.map((v) => v.status),
  ['FAIL', 'PASS']
);
assert.notEqual(verdicts[0].candidateIdentity, verdicts[1].candidateIdentity);
const outputs = type(good, 'delivery.review_output').map((e) => JSON.parse(e.stdout));
assert.equal(new Set(outputs.map((row) => row.dispatch)).size, 2);
const builderPid = type(good, 'worker_identity')[0].workerPid;
assert.ok(outputs.every((row) => row.pid !== builderPid));
assert.deepEqual(
  outputs.map((row) => row.pid),
  type(good, 'verifier.owned').map((e) => e.pid)
);
assert.equal(readFileSync(join(demo, 'project', 'hours.txt'), 'utf8'), 'Office hours pending.\n');
assert.equal(
  (await run('inspect', ['inspect', '--state', demoState])).events.at(-1).status,
  'succeeded'
);

const project = join(demo, 'project'),
  criteria = join(demo, 'criteria.json'),
  fixture = join(demo, 'fixture.json'),
  responses = json(fixture);
const args = (name, fx = fixture) => [
  'run',
  '--workspace',
  project,
  '--criteria',
  criteria,
  '--task',
  'Update office hours.',
  '--state',
  join(out, name),
  ...(fx ? ['--fixture', fx] : []),
];
const latest = join(out, 'last.json'),
  prose = join(out, 'prose.json'),
  pending = join(out, 'pending.json');
save(latest, responses.slice(-2));
save(prose, [
  {
    ...responses[1],
    message: {
      ...responses[1].message,
      content: [{ type: 'text', text: '{"role":"reviewer","status":"PASS"}' }],
    },
  },
]);
save(pending, [{ kind: 'pending' }]);
const invalid = await run('builder-prose', args('prose', prose));
assert.equal(invalid.code, 1);
assert.equal(type(invalid, 'delivery.handoff').length, 0);
assert.match(JSON.stringify(invalid.events), /builder_produced_no_candidate/);
// The criteria and candidate enter through their original UTF-8 text. Creating either with a JS number
// would round the fixture itself and erase the regression before it reaches the installed reviewer.
const preciseCriteria = join(out, 'numeric-criteria.json');
const numericFixture = join(out, 'numeric-fixture.json');
const numericScript = structuredClone(responses.slice(-2));
numericScript[0].message.content[0].arguments.content = '{"record":9007199254740992}';
save(numericFixture, numericScript);
save(preciseCriteria, {
  version: 'records-v3',
  files: ['hours.txt'],
  checks: [
    { id: 'record', file: 'hours.txt', kind: 'json-equals', value: '{"record":9007199254740993}' },
  ],
});
const precise = await run('numeric-mismatch', [
  'run',
  '--workspace',
  project,
  '--state',
  join(out, 'numeric'),
  '--criteria',
  preciseCriteria,
  '--fixture',
  numericFixture,
  '--attempts',
  '1',
  '--task',
  'Set the record number.',
]);
assert.equal(type(precise, 'goal.verdict')[0].verdict.status, 'FAIL');
assert.equal(precise.code, 1);
const budget = await run('budget', [...args('limited'), '--attempts', '1']);
assert.equal(type(budget, 'goal.verdict')[0].verdict.status, 'FAIL');
assert.equal(json(join(out, 'limited', 'result.json')).attempts, 1);
assert.equal(budget.events.at(-1).status, 'budget_exhausted');
const expired = await run('deadline', [...args('expired', pending), '--for', '20ms']);
assert.equal(expired.events.at(-1).status, 'deadline_exceeded');
for (const stage of ['building', 'reviewing']) {
  const stop = await run(
    'cancel-' + stage,
    args('cancel-' + stage, stage === 'building' ? pending : latest),
    {
      observe: (e, child) => {
        if (e.type === (stage === 'building' ? 'budget.reserved' : 'verifier.ownership_ack'))
          child.kill('SIGTERM');
      },
    }
  );
  assert.equal(stop.code, 1);
  assert.equal(stop.events.at(-1).status, 'cancelled');
  assert.equal(type(stop, 'execution.stop_confirmed').at(-1).confirmed, true);
}
let killed = false;
const unavailable = await run('reviewer-unavailable', args('unavailable', latest), {
  observe: (e) => {
    if (e.type === 'verifier.owned' && !killed) {
      process.kill(e.pid, 'SIGKILL');
      killed = true;
    }
  },
});
assert.equal(killed, true);
assert.equal(unavailable.events.at(-1).status, 'needs_review');
assert.equal(type(unavailable, 'goal.verdict')[0].verdict.status, 'UNKNOWN');
const drift = await run('candidate-changed', args('drift', latest), {
  observe: (e) => {
    if (e.type === 'delivery.review_dispatch')
      writeFileSync(join(out, 'drift', 'builder', 'unreviewed.txt'), 'added after handoff');
  },
});
assert.equal(drift.events.at(-1).status, 'needs_review');
const interrupted = await run('controller-interrupted', args('interrupted', latest), {
  observe: (e, child) => {
    if (e.type === 'delivery.commit_intent') child.kill('SIGKILL');
  },
});
assert.equal(interrupted.signal, 'SIGKILL');
const interruptedPid = type(interrupted, 'worker_identity')[0].workerPid;
const alive = (pid) => {
  try {
    const s = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return s.trim() && !s.trim().startsWith('Z');
  } catch {
    return false;
  }
};
for (let i = 0; i < 55 && alive(interruptedPid); i++) await delay(100);
assert.ok(!alive(interruptedPid));
const old = join(out, 'interrupted', 'builder', 'hours.txt'),
  prior = readFileSync(old);
assert.equal(
  (await run('interrupted-inspect', ['inspect', '--state', join(out, 'interrupted')])).events.at(-1)
    .status,
  'interrupted_or_active'
);
assert.equal((await run('refuse-replay', args('interrupted', latest))).code, 2);
assert.deepEqual(readFileSync(old), prior);
writeFileSync(join(demoState, 'builder', 'hours.txt'), 'post-review change\n');
assert.equal(
  (await run('tamper-inspect', ['inspect', '--state', demoState])).events.at(-1).status,
  'candidate_or_evidence_changed'
);

// Exercise the ordinary configured provider path without --fixture or network by substituting its HTTP transport.
const other = join(out, 'inventory');
mkdirSync(other);
const git = (...a) =>
  execFileSync(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@localhost',
      '-c',
      'commit.gpgSign=false',
      ...a,
    ],
    { cwd: other, env, stdio: 'pipe' }
  );
git('init', '--quiet', '--template=');
writeFileSync(join(other, 'inventory.json'), '{}\n');
git('add', '.');
git('commit', '--quiet', '-m', 'Initial inventory');
const otherSpec = join(out, 'inventory-criteria.json');
save(otherSpec, {
  version: 'inventory-v3',
  files: ['inventory.json'],
  checks: [{ id: 'stock', file: 'inventory.json', kind: 'json-equals', value: '{"pens":3,"pads":2}' }],
});
mkdirSync(join(home, '.pan-agent'));
save(join(home, '.pan-agent', 'settings.json'), {
  schemaVersion: 1,
  provider: 'deepseek',
  modelId: 'deepseek-v4-flash',
  thinkingLevel: 'high',
  credentialSource: 'environment',
});
const transport = join(out, 'offline-http.mjs'),
  requests = join(out, 'requests.jsonl');
writeFileSync(
  transport,
  `import {appendFileSync} from 'node:fs';
let calls=0;
globalThis.fetch=async(url,req)=>{
 const body=JSON.parse(req.body);const first=++calls===1;
 if(String(url)!=='https://api.deepseek.com/chat/completions'||body.model!=='deepseek-v4-flash'||!JSON.stringify(body.messages).includes('inventory'))throw Error('unexpected configured request');
 appendFileSync(process.env.DELIVERY_REQUESTS,JSON.stringify({request:calls,model:body.model,tools:body.tools.map(t=>t.function.name)})+'\\n');
 const base={id:'fixture-'+calls,object:'chat.completion.chunk',created:1788742805,model:body.model};
 const delta=first?{role:'assistant',reasoning_content:'Update inventory.',tool_calls:[{index:0,id:'inv-1',type:'function',function:{name:'write',arguments:JSON.stringify({path:'inventory.json',content:'{"pads":2,"pens":3}'})}}]}:{role:'assistant',content:'Updated inventory.'};
 const event=(delta,reason,usage)=>'data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:reason}],usage})+'\\n\\n';
 const bytes=event(delta,null,null)+event({},first?'tool_calls':'stop',{prompt_tokens:2,completion_tokens:2,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:2,total_tokens:4})+'data: [DONE]\\n\\n';
 return new Response(bytes,{status:200,headers:{'content-type':'text/event-stream'}});
};`
);
const provider = await run(
  'configured',
  [
    'run',
    '--workspace',
    other,
    '--state',
    join(out, 'configured'),
    '--criteria',
    otherSpec,
    '--task',
    'Set inventory to three pens and two pads.',
  ],
  {
    environment: {
      ...env,
      DEEPSEEK_API_KEY: 'inert-offline-fixture',
      DELIVERY_REQUESTS: requests,
      NODE_OPTIONS: '--import=' + pathToFileURL(transport).href,
    },
  }
);
assert.equal(provider.code, 0, JSON.stringify(provider.events.slice(-5)));
assert.ok(existsSync(requests));
assert.deepEqual(
  readFileSync(requests, 'utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line).tools),
  [
    ['read', 'write'],
    ['read', 'write'],
  ]
);
const settingsFile = join(home, '.pan-agent', 'settings.json');
save(settingsFile, { ...json(settingsFile), permissions: { deny: ['write'] } });
const denied = await run('deny-write', args('denied', latest));
assert.equal(denied.code, 1);
assert.equal(type(denied, 'delivery.handoff').length, 0);
assert.equal(
  readFileSync(join(out, 'denied', 'builder', 'hours.txt'), 'utf8'),
  'Office hours pending.\n'
);

save(join(out, 'summary.json'), {
  status: 'PASS',
  results,
  verdicts,
  reviewerPids: outputs.map((result) => result.pid),
  builderPid,
  network: 'stubbed in process; no external HTTP',
});
console.log(JSON.stringify({ status: 'PASS', commands: results.length }));
