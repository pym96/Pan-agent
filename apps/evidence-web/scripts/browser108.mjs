import {chromium} from '../web/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const origin=process.env.APP_ORIGIN,out=process.env.EVIDENCE_DIR,prior=JSON.parse(await readFile(process.env.PREVIOUS_RESULT));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1100}}),page=await ctx.newPage();let dialogs=0;page.on('dialog',async d=>{dialogs++;await d.dismiss()});
try{
 await page.goto(origin);await page.getByLabel('邮箱').fill('a@web106.test');await page.getByLabel('密码',{exact:true}).fill(process.env.ACCOUNT_A_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator(`[data-bundle-id="${prior.bundleId}"]`).click();
 await page.getByRole('button',{name:'提交离线分析',exact:true}).click();await page.getByTestId('task-state').waitFor();const first=await page.locator('.analysis code').first().innerText();
 await page.waitForFunction(async id=>{const t=await (await fetch('/api/tasks/'+id)).json();return t.events.some(e=>e.type==='fixture.waiting')},first,{timeout:30000});
 const follow='只列出刚才统计中的有效失败任务并导出CSV <script>window.__pwned=true</script>';
 await page.getByLabel('分析问题',{exact:true}).fill(follow);await page.getByRole('button',{name:'提交离线分析',exact:true}).click();await page.waitForFunction(id=>document.querySelector('.analysis code')?.textContent!==id&&document.querySelector('[data-testid=task-state]')?.textContent==='queued',first);const second=await page.locator('.analysis code').first().innerText();assert.notEqual(first,second);const cid=await page.getByLabel('会话',{exact:true}).inputValue();assert(cid);
 await page.screenshot({path:out+'/queued-followup.png',fullPage:true});await writeFile(join(process.env.WEB107_TASK_ROOT,first,'release'),'browser controlled release\n');
 await page.waitForFunction(()=>document.querySelector('[data-testid=task-state]')?.textContent==='completed',null,{timeout:300000});assert.match(await page.getByTestId('analysis-answer').innerText(),/共 5 行/);await page.getByText('执行时公共上下文',{exact:true}).click();assert.match(await page.locator('.analysis').innerText(),new RegExp(first));assert.equal(await page.evaluate(()=>window.__pwned),undefined);assert.equal(dialogs,0);
 await page.getByRole('button',{name:'来源 /classifications',exact:true}).click();await page.getByTestId('source-value').waitFor();await page.getByRole('button',{name:'关闭来源'}).click();
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'下载 details.csv',exact:true}).click();await (await download).saveAs(out+'/followup.csv');assert.equal((await readFile(out+'/followup.csv','utf8')).trim().split('\n').length,6);await page.screenshot({path:out+'/followup-complete.png',fullPage:true});
 await page.reload();await page.locator(`[data-bundle-id="${prior.bundleId}"]`).click();await page.getByLabel('会话',{exact:true}).selectOption(cid);await page.locator(`[data-task-id="${second}"]`).click();await page.getByTestId('analysis-answer').waitFor();assert.match(await page.getByTestId('analysis-answer').innerText(),/共 5 行/);
 await writeFile(out+'/browser108.json',JSON.stringify({passed:true,first,second,conversationId:cid,checks:['page append while first held running','queued until controlled release','computed5 CSV rows','source citation','execution context visible','inert question text','history after reload'],providerSends:0},null,2));
}finally{await browser.close()}
