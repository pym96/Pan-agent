// Installed application only; browser actions and source files are retained privately.
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const data=process.env.DEPLOY_DATA,out=process.env.EVIDENCE_DIR;
await mkdir(out,{recursive:false});const cfg=JSON.parse(await readFile(data+'/config.json'));
const live=cfg.provider==='kimi',origin=`http://127.0.0.1:${cfg.httpPort}`;
const questions=['统计这份报告各结果类别、有效评分分母及已知/未知用量，说明用量统计覆盖范围，给出来源并生成明细CSV。','只列出其中有效评分失败的任务，保留原始行来源并生成CSV；没有评分的任务不要算作失败。'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:out,size:{width:1440,height:1080}}});const page=await context.newPage(),video=page.video(),start=Date.now();
const chapters=[],tasks=[];let bundleId,conversationId,toolFrame=false;
const save=async(n,v)=>writeFile(out+'/'+n,JSON.stringify(v,null,2));
async function chapter(title,extra={}){const row={seconds:(Date.now()-start)/1000,title,mode:cfg.provider,...extra};chapters.push(row);await save('chapters.json',chapters);await page.evaluate(row=>{let el=document.getElementById('recording-chapter');if(!el){el=document.createElement('div');el.id='recording-chapter';el.style='position:fixed;top:0;left:0;right:0;z-index:10000;background:#15372b;color:white;padding:10px;font:17px sans-serif';document.body.append(el)}el.textContent=(row.mode==='kimi'?'真实 Kimi k3-256k / high':'离线 Faux · 非真实模型')+' | '+row.title},row)}
async function get(path){const r=await context.request.get(origin+path);assert.equal(r.status(),200);return r.json()}
try{
 await page.goto(origin);await page.getByLabel('邮箱').fill(cfg.accounts.a.email);await page.getByLabel('密码',{exact:true}).fill(cfg.accounts.a.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'退出登录'}).waitFor();
 await chapter('导入固定报告；此次仅分析报告，不重跑评测');await page.getByLabel('Manifest',{exact:true}).setInputFiles(cfg.release+'/inputs/manifest.json');await page.getByLabel('报告与附件',{exact:true}).setInputFiles(cfg.release+'/inputs/summary.json');await page.getByRole('button',{name:'导入并查看'}).click();await page.getByTestId('total').waitFor();bundleId=await page.locator('.bundle.active').getAttribute('data-bundle-id');
 for(const [index,q] of questions.entries()){
  await page.getByLabel('分析问题',{exact:true}).fill(q);await chapter('第 '+(index+1)+' 轮：提交问题，由模型选择工具');
  const response=page.waitForResponse(r=>r.url().endsWith('/messages')&&r.request().method()==='POST');await page.getByRole('button',{name:live?'提交真实分析':'提交离线分析',exact:true}).click();const rr=await response;assert.equal(rr.status(),201);const t0=await rr.json();const id=t0.id;
  conversationId=await page.getByLabel('会话',{exact:true}).inputValue();await save('submitted-'+(index+1)+'.json',{id,conversationId,question:q,mode:cfg.provider,utc:new Date().toISOString()});console.log('submitted '+id);
  let t,reloaded=false;
  for(;;){t=await get('/api/tasks/'+id);await save('latest-'+(index+1)+'.json',t);
   if(!toolFrame&&t.events.some(e=>e.type==='tool.started'&&e.toolName==='analyze_python')){await chapter('实际工具活动已出现；等待执行与验证',{taskId:id});await page.getByTestId('latest-activity').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/tool-running.png'});toolFrame=true}
   if(!reloaded&&index===0&&t.events.some(e=>e.type==='model.turn_started')){const before=t.events.filter(e=>e.type==='provider.send').length;await page.reload();await page.locator(`[data-bundle-id="${bundleId}"]`).click();await page.getByLabel('会话',{exact:true}).selectOption(conversationId);await page.locator(`[data-task-id="${id}"]`).click();await save('reconnect.json',{taskId:id,beforeSends:before,action:'browser reload and GET only; no new submission'});reloaded=true}
   if(['completed','failed','interrupted','cancelled','blocked'].includes(t.state)&&t.cleanupConfirmed)break;
   await new Promise(r=>setTimeout(r,1000));
  }
  tasks.push(t);await save('task-'+(index+1)+'.json',t);console.log('terminal '+id+' '+t.state);
  await page.locator(`[data-task-id="${id}"]`).click();await chapter('执行终态 '+t.state+'；产物有效性与答案分别展示',{taskId:id,attemptId:t.ownership?.attemptId});await page.getByTestId('task-state').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/terminal-'+(index+1)+'.png'});
  if(t.state!=='completed')throw Error('task did not complete; retained terminal '+id);
  if(live)assert.equal(t.result.artifactValidation?.status,'valid');
  for(const name of ['analysis.json','details.csv']){const r=await context.request.get(origin+`/api/tasks/${id}/files/${name}`);assert.equal(r.status(),200);const b=await r.body();assert.equal(sha(b),t.result.artifacts[name].sha256);await writeFile(out+`/round${index+1}-`+name,b)}
  await page.getByTestId('analysis-answer').scrollIntoViewIfNeeded();await page.waitForTimeout(1000);
  const source=page.getByTestId('analysis-answer').getByRole('button').first();if(await source.count()){await source.click();await page.getByTestId('source-value').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/source-'+(index+1)+'.png'});await page.getByRole('button',{name:'关闭来源'}).click()}
 }
 assert.equal(JSON.parse(tasks[1].contextText).turns[0].answer,tasks[0].result.result.finalText);
 const history=await get('/api/conversations/'+conversationId);await save('history.json',history);
 await save('journey.json',{completed:true,mode:cfg.provider,toolFrame,bundleId,conversationId,questions,tasks:tasks.map(t=>({id:t.id,attemptId:t.ownership?.attemptId,providerSends:t.result.providerSends,state:t.state})),inputSHA256:sha(await readFile(cfg.release+'/inputs/summary.json')),note:'Uncut real browser recording. No benchmark tasks run. Answer correctness checked separately.'});
 await chapter('两轮结果、来源与下载已留存；等待独立复核');await page.waitForTimeout(1200);
}catch(e){await save('failure.json',{message:String(e.message),tasks:tasks.map(t=>t.id)});throw e}finally{await save('chapters.json',chapters);await context.close();await rename(await video.path(),out+'/demo.webm');await browser.close()}
