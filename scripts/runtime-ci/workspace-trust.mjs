// Exercise the installed operator CLI, actual native children and sealed task archives using temporary owned fixtures.
import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {PassThrough} from "node:stream";
import {pathToFileURL} from "node:url";

const [installedArg, outputArg] = process.argv.slice(2);
const installed = fs.realpathSync(installedArg);
fs.mkdirSync(outputArg, {mode: 0o700});
const out = fs.realpathSync(outputArg), project = path.join(out,"project"), home = path.join(out,"home");
const archives = path.join(out,"archive"), archiveResults = [];
for (const dir of [project, home, path.join(project,".pan-agent")]) fs.mkdirSync(dir,{mode:0o700});
const env = "PAN_SYNTHETIC_FIXTURE_TOKEN";
const credentials = [randomBytes(20).toString("hex"), randomBytes(20).toString("hex") + "\n"];
process.env[env] = credentials[0];
fs.writeFileSync(path.join(project, ".env.fixture"),credentials[1]);
fs.writeFileSync(path.join(project, "ordinary"),"fixture");
const ids = ["env:" + env, "file:.env.fixture"];
fs.writeFileSync(path.join(project,".pan-agent/workspace.json"),JSON.stringify({version:1,resources:ids}));
const hash = value => createHash("sha256").update(value).digest("hex");
const bin = path.join(installed,"bin/pan-agent.mjs");
const cli = (...args) => {
  const result = spawnSync(process.execPath,[bin,...args],{env:{HOME:home,PATH:"/usr/bin:/bin"},encoding:"utf8",timeout:10000});
  assert.equal(result.status,0,result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
const review = cli("trust","--workspace",project);
assert.deepEqual(review.eligible,[]);
assert.deepEqual(cli("trust","--workspace",project,"--approve",review.review).eligible,ids);
const policyDir = path.join(home,".pan-agent/workspace-trust");
const policyPath = path.join(policyDir,fs.readdirSync(policyDir)[0]);
const policyBytes = fs.readFileSync(policyPath);
const api = await import(pathToFileURL(path.join(installed,"dist/index.js")));
const identity={provider:{status:"reported",value:"faux"},model:{status:"reported",value:"faux"},responseId:{status:"unavailable"}};
const response=(content,stopReason="tool_calls")=>({kind:"response",message:{role:"assistant",timestamp:0,content},stopReason,usage:{status:"unavailable"},identity});
const call=(id,name,args)=>response([{type:"tool_call",id,name,arguments:args}]);
fs.writeFileSync(path.join(project,"consume.cjs"),[
  "const fs=require('node:fs'), crypto=require('node:crypto');",
  'const v=process.env.PAN_GRANTED_VALUE;',
  'if(process.env.'+env+' !== undefined || process.env.LANG !== "C")process.exit(11);',
  'if(fs.readFileSync("ordinary","utf8")!=="fixture")process.exit(12);',
  'fs.appendFileSync("results", (v===undefined?"absent":crypto.createHash("sha256").update(v).digest("hex"))+"\\n");',
  'if(v!==undefined)process.stdout.write(v);',
].join("\n"));
const command = "/bin/bash -c 'node consume.cjs'";
const policyArg = "'"+policyPath.replaceAll("'","'\\''")+"'";
const other = "test -z \"\${PAN_GRANTED_VALUE+x}\" && test -z \"\${"+env+"+x}\" && ! cat .env.fixture && ! cat "+policyArg+" && ! (echo change > "+policyArg+") && echo ordinary-ok";
const source = fs.readFileSync(path.join(project,".env.fixture"),"utf8");
let transcript="";
for(const [index,id] of ids.entries()) {
  const output = new PassThrough(); output.on("data",chunk=>transcript+=chunk);
  const scripts = [
    call("deny-file","read",{path:".env.fixture"}),
    call("deny-write","write",{path:policyPath,content:"invalid"}),
    call("ordinary","bash",{command:index ? other.replace("test -z", "test -n") : other}),
    call("use1","bash",{command}),
    call("use2","bash",{command}),
    response([{type:"text",text:"done"}],"stop"),
    call("fresh","bash",{command}),response([{type:"text",text:"done"}],"stop")
  ];
  const code = await api.runCli(["--kernel","native","--workspace",project,"--memory-root",archives,"--native-sandbox","--native-offline","--native-resource",id,...(index?["--grant-task"]:["--grant-command",command])],{
    home,output,createNativeAdapter:()=>new api.FauxModelAdapter(scripts),
    startTui:async options=>{
      options.session.setApprovalChannel(async request=>({requestId:request.requestId,decision:"allow-once"}));
      for(const task of ["inspect synthetic fixture", "fresh task"]) {
        const result = await options.session.runTask(task);
        assert.equal(result.archiveSealed,true);
        const records = await options.archiveStore.readArchive(result.runId);
        archiveResults.push(records);
        const events = records.filter(r=>r.type==="tool.settled");
        for(const event of events) {
          const denied = ["deny-file","deny-write"].includes(event.toolCallId);
          assert.equal(event.isError,denied,event.toolCallId);
        }
        assert.equal(events.length,task==="fresh task"?1:5);
      }
      await options.session.close();return 0;
    }
  });
  assert.equal(code,0,transcript);
}
assert.deepEqual(fs.readFileSync(path.join(project,"results"),"utf8").trim().split("\n"),
  [hash(credentials[0]),"absent","absent",hash(credentials[1]),hash(credentials[1]),"absent"]);
assert.equal(fs.readFileSync(path.join(project,".env.fixture"),"utf8"),source);
assert.deepEqual(fs.readFileSync(policyPath),policyBytes);
const evidence = JSON.stringify(archiveResults);
for(const secret of credentials) {
  assert.equal((evidence + transcript + policyBytes.toString()).includes(secret.trim()),false);
}
assert.match(transcript,/grant expired/);
fs.writeFileSync(path.join(out,"events.json"),evidence);
fs.writeFileSync(path.join(out,"terminal.txt"),transcript);
console.log(JSON.stringify({platform:process.platform,installed,review:review.review,runs:archiveResults.length,
  checks:["operator-review","native-file-and-policy-denial","ordinary-shell","child-hash-one-command","child-hash-first-task","fresh-task","suppressed-output","sealed-archives"]}));
