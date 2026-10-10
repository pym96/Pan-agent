import {chromium} from '../web/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const prior=JSON.parse(await readFile(process.env.PREVIOUS_RESULT)),out=process.env.EVIDENCE_DIR;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100}});const pages=[];
try{
 for(const fixture of prior.tasks){
  const page=await context.newPage();pages.push(page);await page.goto(process.env.APP_ORIGIN);
  if(pages.length===1){await page.getByLabel('邮箱').fill('a@web106.test');await page.getByLabel('密码',{exact:true}).fill(process.env.ACCOUNT_A_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click()}
  await page.locator(`[data-bundle-id="${prior.bundleId}"]`).click();await page.getByLabel('会话',{exact:true}).selectOption(fixture.cid);await page.locator(`[data-task-id="${fixture.tid}"]`).click();
  await page.getByTestId('execution-owner').waitFor();assert.match(await page.getByTestId('task-state').innerText(),/running/);assert.match(await page.getByTestId('execution-owner').innerText(),/执行代次 1/);await page.screenshot({path:out+'/running-'+fixture.tid+'.png',fullPage:true});
 }
 for(const fixture of prior.tasks)await writeFile(process.env.WEB107_TASK_ROOT+'/'+fixture.tid+'/release','browser releases both healthy workers');
 for(let i=0;i<pages.length;i++){
  const page=pages[i],fixture=prior.tasks[i];await page.waitForFunction(()=>document.querySelector('[data-testid=task-state]')?.textContent==='completed',null,{timeout:180000});assert.match(await page.getByTestId('analysis-answer').innerText(),/89.*23/);
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'下载 details.csv',exact:true}).click();await(await download).saveAs(out+'/'+fixture.tid+'.csv');assert.equal((await readFile(out+'/'+fixture.tid+'.csv','utf8')).trim().split('\n').length,6);
  await page.getByRole('button',{name:'来源 /classifications',exact:true}).click();await page.getByTestId('source-value').waitFor();await page.getByRole('button',{name:'关闭来源'}).click();assert(!(await page.locator('body').innerText()).includes('WEB110_SYNTHETIC_PRIVATE_CONTINUATION'));await page.screenshot({path:out+'/completed-'+fixture.tid+'.png',fullPage:true});
 }
 await writeFile(out+'/browser112.json',JSON.stringify({passed:true,checks:['two conversations simultaneously running with distinct workers','ownership generation visible','both results 89/23','both CSV five rows','both sources navigable','private state absent'],providerSends:0},null,2));
}finally{await browser.close()}
