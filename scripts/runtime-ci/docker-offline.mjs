#!/usr/bin/env node
/** Installed CLI compatibility check for the existing, image-pinned Docker backend. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {pathToFileURL} from 'node:url';
const [installed,output]=process.argv.slice(2);
if(!installed||!output)throw Error('usage: docker-offline.mjs INSTALLED_PACKAGE NEW_OUTPUT');
const out=path.resolve(output);
fs.mkdirSync(out,{mode:0o700});
const workspace=path.join(out,'work'),root=path.join(out,'boxes');
fs.mkdirSync(workspace);
const api=await import(pathToFileURL(path.resolve(installed,'dist/index.js')).href);
const {DockerSandbox}=await import(pathToFileURL(path.resolve(installed,'dist/sandbox/docker.js')).href);
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
function response(content,stopReason){
  return {kind:'response',message:{role:'assistant',timestamp:0,content},stopReason,usage:{status:'unavailable'},identity};
}
const command=`python -c 'import socket; print([name for _,name in socket.if_nameindex()])'`;
const replies=[response([{type:'tool_call',id:'interfaces',name:'bash',arguments:{command}}],'tool_calls'),
  response([{type:'text',text:'Finished owned offline container.'}],'stop')];
const outputStream=new PassThrough();
let transcript='';outputStream.on('data',chunk=>transcript+=chunk);
try{
  const code=await api.runCli(['--kernel','native','--workspace',workspace,'--memory-root',path.join(out,'memory'),'--sandbox-root',root],{
    home:out,output:outputStream,createNativeAdapter:()=>new api.FauxModelAdapter(replies),startTui:async tui=>{
      assert.equal(tui.executionMode,'sandbox');
      tui.session.setApprovalChannel(async req=>({requestId:req.requestId,decision:'allow-once'}));
      try {
        const run=await tui.session.runTask('Report the interfaces in the isolated Docker task');
        const records=await tui.archiveStore.readArchive(run.runId);
        fs.writeFileSync(path.join(out,'archive.json'),JSON.stringify(records,null,2));
        assert.equal(run.archiveSealed,true);
        const tool=records.find(row=>row.type==='tool.settled'&&row.toolCallId==='interfaces');
        assert.equal(tool?.isError,false,JSON.stringify(records));
        assert.match(tool.text,/\['lo'\]/);
      } finally{await tui.session.close();}
      return 0;
    }});
  assert.equal(code,0,transcript);
  const dirs=fs.readdirSync(root);assert.equal(dirs.length,1);
  const box=await DockerSandbox.load(path.join(root,dirs[0]));
  const state=JSON.parse(fs.readFileSync(path.join(box.directory,'state.json')));
  assert.match(JSON.stringify(state.events),/"NetworkMode":"none"/);
  await box.export(path.join(out,'export'));await box.cleanup();
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({status:'PASS',interfaces:['lo'],image:state.image,phase:box.identity.phase,run:box.identity.runId})+'\n');
}finally{
  fs.writeFileSync(path.join(out,'cli.stdout'),transcript);
}
