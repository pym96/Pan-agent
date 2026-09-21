#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { POLICY, Refusal, requireThat, sha256, readLock, validateActivation, Attempt, guardedTransport, readRecords, reconstruct } from './guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export function installedIdentity(product) {
  product = path.resolve(product);
  const rows = [];
  function visit(dir, prefix = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir,name), relative = prefix+name, stat = fs.lstatSync(file);
      requireThat(!stat.isSymbolicLink(), 'product_symlink');
      if (stat.isDirectory()) visit(file,relative+'/');
      else { requireThat(stat.isFile(), 'product_file'); rows.push({path:relative,sha256:sha256(fs.readFileSync(file)),mode:stat.mode & 0o777}); }
    }
  }
  visit(product); rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const digest = sha256(JSON.stringify(rows,null,2)+'\n');
  requireThat(digest === POLICY.runtime_sha256, 'product_runtime_mismatch');
  return {product, runtime_sha256:digest};
}
export function bindingFor(runnerSHA, lockHash) {
  return {runner_sha:runnerSHA, product_sha:POLICY.product_sha, package_sha256:POLICY.package_sha256, lock_sha256:lockHash};
}
function safeUsage(usage) {
  if (usage?.status !== 'reported') return {status:'unavailable'};
  return {status:'reported',value:Object.fromEntries(['input','output','cacheRead','cacheWrite','cacheWrite1h','reasoning','totalTokens'].filter(k=>Number.isFinite(usage.value[k])).map(k=>[k,usage.value[k]]))};
}
const unavailableIdentity = () => ({provider:{status:'unavailable'},model:{status:'unavailable'},responseId:{status:'unavailable'}});
function failure(code, outcome) { return {kind:'failure',category:'provider',detail:code,retryable:false,usage:outcome?.usage ?? {status:'unavailable'},identity:outcome?.identity ?? unavailableIdentity()}; }

async function execute({activation, runnerSHA, product, packageFile, lockFile=path.join(here,'lock.json'), signal, mode, fetchImplementation, credentialSource, clock}) {
  const {hash} = readLock(lockFile);
  validateActivation(activation,bindingFor(runnerSHA,hash),mode);
  requireThat(sha256(fs.readFileSync(packageFile))===POLICY.package_sha256, 'product_package_mismatch');
  const identity = installedIdentity(product);
  if (mode==='synthetic') requireThat(typeof fetchImplementation==='function' && typeof credentialSource==='function', 'synthetic_interception_required');
  // All identity checks precede ownership, credential resolution, Session admission and network.
  const attempt = new Attempt(activation,{signal,clock});
  let session, adapter, result, responses=0, expectedCall;
  let reportedModel;
  try {
    attempt.check(signal);
    const metadata = JSON.parse(fs.readFileSync(path.join(identity.product,'package.json'),'utf8'));
    const api = await import(pathToFileURL(path.join(identity.product,metadata.exports['.'].import)));
    attempt.check(signal);
    const source = () => {
      attempt.check(signal);
      requireThat(attempt.active && attempt.calls>0,'credential_without_reservation');
      return mode==='synthetic' ? credentialSource() : process.env[activation.credential_env];
    };
    // Explicit redirect:error prevents fetch from following a provider redirect to another endpoint.
    const sendFetch = async (url, options) => {
      attempt.check(signal);
      requireThat(url === POLICY.endpoint,'fetch_endpoint');
      attempt.record({type:'dispatch',ordinal:attempt.calls});
      attempt.check(signal);
      return (mode==='synthetic' ? fetchImplementation : globalThis.fetch)(url,{...options,redirect:'error'});
    };
    const transport = guardedTransport(attempt,new api.KimiFetchTransport({credentialSource:source,fetchImplementation:sendFetch}));
    adapter = new api.PanKimiModelAdapter({modelId:POLICY.model,thinkingLevel:POLICY.reasoning},{transport});
    const boundedAdapter = {
      providerId:adapter.providerId,modelId:adapter.modelId,reasoningLevel:adapter.reasoningLevel,
      async exchange(request) {
        try {
          attempt.check(request.signal);
          const outcome = await adapter.exchange(request);
          attempt.check(request.signal);
          const model = outcome.identity.model;
          const usage = safeUsage(outcome.usage);
          attempt.record({type:'response',ordinal:attempt.calls,model,usage,kind:outcome.kind});
          if (outcome.kind!=='response') { attempt.stop('model_failure'); return failure('smoke_model_failure',outcome); }
          if (usage.status!=='reported') { attempt.stop('usage_missing'); return failure('smoke_usage_missing',outcome); }
          if (usage.value.output > POLICY.max_tokens) { attempt.stop('output_cap_exceeded'); return failure('smoke_output_cap_exceeded',outcome); }
          if (model.status==='reported') {
            if (reportedModel!==undefined && reportedModel!==model.value) { attempt.stop('model_changed'); return failure('smoke_model_changed',outcome); }
            reportedModel=model.value;
          }
          const calls=outcome.message.content.filter(c=>c.type==='tool_call');
          const text=outcome.message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
          const valid = responses===0
            ? outcome.stopReason==='tool_calls' && calls.length===1 && calls[0].name===POLICY.tool && /^[A-Za-z0-9_-]{1,128}$/.test(calls[0].id) && Object.keys(calls[0].arguments).length===0 && text.trim()===''
            : responses===1 && outcome.stopReason==='stop' && calls.length===0 && text.trim()===POLICY.marker && attempt.tools===1;
          if (!valid) { attempt.stop('smoke_shape'); return failure('smoke_shape',outcome); }
          if (responses===0) expectedCall=calls[0].id;
          responses++;
          // The original admitted message object must reach NativeKernel unchanged: K3 privately binds its identity.
          return outcome;
        } catch { if (!attempt.reason) attempt.stop('model_failure'); return failure('smoke_stopped'); }
      }
    };
    const tool = {name:POLICY.tool,description:'Return the fixed smoke fixture.',parameters:{type:'object',properties:{},additionalProperties:false},
      validate: value => value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===0 ? {ok:true,value} : {ok:false,error:'empty_object_required'},
      async execute(invocation) {
        requireThat(invocation.toolCallId===expectedCall && Object.keys(invocation.arguments).length===0,'tool_correlation');
        attempt.tool(invocation.toolCallId,invocation.signal);
        return {content:[{type:'text',text:POLICY.marker}],isError:false};
      }};
    const content='Protocol smoke. Follow the task using only the supplied tool.';
    session = new api.GeneralAgentSession({kernel:'native',adapter:boundedAdapter,tools:[tool],systemPrompt:'Perform the single protocol smoke task.',
      memory:{archiveStore:await api.RunArchiveStore.open(path.join(attempt.dir,'archive')),runbook:async()=>({content,revision:'sha256:'+sha256(content)})},
      limits:{maxModelTurns:2,maxToolSteps:1},cleanup:()=>adapter.dispose()});
    attempt.onStop = () => {session.cancel(); adapter.dispose();};
    attempt.check(signal);
    result = await session.runTask(POLICY.task);
    attempt.check(signal);
  } catch { if (!attempt.reason) attempt.stop('runner_failure'); }
  finally {
    try { await session?.close(); } catch { if (!attempt.reason) attempt.stop('cleanup_failure'); }
    adapter?.dispose();
    attempt.settle({status:result?.status ?? 'stopped',archive_sealed:result?.archiveSealed ?? false,
      oracle_met:result?.status==='completed' && result.archiveSealed && responses===2 && result.modelCalls===2 && result.toolCalls===1 && attempt.tools===1 && result.finalText.trim()===POLICY.marker});
  }
  const report = reconstruct(readRecords(attempt.file));
  fs.writeFileSync(path.join(attempt.dir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return {report,directory:attempt.dir};
}
/** Offline-only injection entry. No default credential callback or fetch is reachable here. */
export function runSynthetic(options) { return execute({...options,mode:'synthetic'}); }

function runnerSHA() {
  const repo=path.resolve(here,'../..');
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  requireThat(git('status','--porcelain','--untracked-files=no')==='', 'runner_dirty');
  return git('rev-parse','HEAD');
}
async function main(args) {
  if (args.length===0 || (args.length===1 && args[0]==='--help')) {
    console.log('Kimi smoke Stage A: no live authorization supplied. Commands: dry-run | report RECORDS | live ACTIVATION PRODUCT_DIR PRODUCT_TGZ. Synthetic verification: verify.mjs PRODUCT_DIR PRODUCT_TGZ OUTPUT_DIR RUNNER_SHA.'); return;
  }
  if (args.length===1 && args[0]==='dry-run') { const {lock,hash}=readLock(path.join(here,'lock.json')); console.log(JSON.stringify({mode:'dry-run',lock,lock_sha256:hash,authorized:false})); return; }
  if (args.length===2 && args[0]==='report') { console.log(JSON.stringify(reconstruct(readRecords(args[1])),null,2)); return; }
  requireThat(args.length===4 && args[0]==='live','arguments_invalid');
  let activation; try {activation=JSON.parse(fs.readFileSync(args[1],'utf8'));} catch {throw new Refusal('activation_invalid');}
  const controller=new AbortController();
  const cancel=()=>controller.abort(); process.once('SIGINT',cancel); process.once('SIGTERM',cancel);
  try {
    const {report}=await execute({mode:'live',activation,product:args[2],packageFile:args[3],runnerSHA:runnerSHA(),signal:controller.signal});
    console.log(JSON.stringify(report,null,2)); if (!report.smoke_success) process.exitCode=1;
  } finally {process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({refused:true,code:error instanceof Refusal ? error.code : 'local_failure'}));process.exitCode=1;});
}
