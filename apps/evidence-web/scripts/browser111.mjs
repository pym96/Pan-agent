import {chromium} from '../web/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const prior=JSON.parse(await readFile(process.env.PREVIOUS_RESULT)),out=process.env.EVIDENCE_DIR;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
try{
 await page.goto(process.env.APP_ORIGIN);await page.getByLabel('邮箱').fill('a@web106.test');await page.getByLabel('密码',{exact:true}).fill(process.env.ACCOUNT_A_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator(`[data-bundle-id="${prior.bundleId}"]`).click();
 await page.getByLabel('会话',{exact:true}).selectOption(prior.conversationId);await page.locator(`[data-task-id="${prior.taskId}"]`).click();await page.getByRole('button',{name:'核对并恢复 · 重建环境',exact:true}).waitFor();assert.match(await page.getByTestId('recoverability').innerText(),/待核对/);await page.screenshot({path:out+'/recoverable.png',fullPage:true});
 const response=page.waitForResponse(r=>r.url().endsWith('/resume'));await page.getByRole('button',{name:'核对并恢复 · 重建环境',exact:true}).click();assert.equal((await (await response).json()).decision,'resuming');
 await page.waitForFunction(()=>document.querySelector('[data-testid=task-state]')?.textContent==='completed',null,{timeout:180000});assert.match(await page.getByTestId('analysis-answer').innerText(),/89.*23/);assert.match(await page.getByTestId('recoverability').innerText(),/completed · 接续已完成/);assert.match(await page.locator('[aria-label="检查点恢复"]').innerText(),/真实 Kimi 恢复暂不支持/);
 const text=await page.locator('body').innerText();assert(!text.includes('WEB110_SYNTHETIC_PRIVATE_CONTINUATION'));const t=await (await page.request.get(process.env.APP_ORIGIN+'/api/tasks/'+prior.taskId)).json();assert.equal(t.recovery.attempts.length,2);assert.equal(t.recovery.accounting.known,3);assert.equal(t.recovery.accounting.unknown,0);assert.equal(t.recovery.accounting.totalTokens,6);assert.equal(t.recovery.accounting.observedToolExecutions,2);assert.equal(t.recovery.accounting.dispatchedWithoutObservedResult,0);assert(t.result.operationReconciled);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'下载 details.csv',exact:true}).click();await (await download).saveAs(out+'/resumed.csv');assert.equal((await readFile(out+'/resumed.csv','utf8')).trim().split('\n').length,6);
 await page.getByRole('button',{name:'来源 /classifications',exact:true}).click();await page.getByTestId('source-value').waitFor();await page.getByRole('button',{name:'关闭来源'}).click();await page.screenshot({path:out+'/resumed-complete.png',fullPage:true});
 await writeFile(out+'/browser111.json',JSON.stringify({passed:true,taskId:prior.taskId,checks:['recoverable displayed','explicit resume button/API','same task completed','two attempts','known/unknown aggregate','Faux/Kimi limitation visible','five row download','source navigation','private canary absent'],providerSends:0},null,2));
}finally{await browser.close()}
