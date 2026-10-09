import {chromium} from '../web/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:8106',out=process.env.EVIDENCE_DIR;
assert(out,'EVIDENCE_DIR required');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1080}});const page=await context.newPage();let dialogs=0;page.on('dialog',async d=>{dialogs++;await d.dismiss()});
const payload='<script>window.__importExecuted=true;alert("executed")</script><img src=x onerror="window.__importExecuted=true">';
const source=await readFile(new URL('../../../docs/evidence/terminal-bench-full-live-97-summary.json',import.meta.url));
const h=b=>createHash('sha256').update(b).digest('hex');const log=Buffer.from(payload);const manifest=Buffer.from(JSON.stringify({version:1,title:'Browser private import',summary:'summary.json',files:{'summary.json':h(source),'notes.txt':h(log)}}));
try{
 await page.goto(origin);await page.getByLabel('邮箱').fill('a@web106.test');await page.getByLabel('密码',{exact:true}).fill(process.env.ACCOUNT_A_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'导入证据包'}).waitFor();
 if(process.env.CHECK_BUNDLE_ID){
  await page.locator(`[data-bundle-id="${process.env.CHECK_BUNDLE_ID}"]`).click();await page.getByTestId('total').waitFor();assert.match(await page.getByTestId('total').innerText(),/89.*23/);await page.getByRole('button',{name:'adaptive-rejection-sampler',exact:true}).click();await page.getByTestId('source-value').waitFor();assert.match(await page.getByTestId('source-value').innerText(),/"validScore": null/);await page.screenshot({path:out+'/browser-after-restart.png',fullPage:true});await writeFile(out+'/browser-after-restart.json',JSON.stringify({passed:true,bundle:process.env.CHECK_BUNDLE_ID,checks:['fresh login','persisted bundle opens','89/23 counts','null source row']},null,2));
 }else{
 await page.getByLabel('Manifest',{exact:true}).setInputFiles({name:'manifest.json',mimeType:'application/json',buffer:manifest});await page.getByLabel('报告与附件',{exact:true}).setInputFiles([{name:'summary.json',mimeType:'application/json',buffer:source},{name:'notes.txt',mimeType:'text/plain',buffer:log}]);
 await page.getByRole('button',{name:'导入并查看'}).click();await page.getByTestId('total').waitFor();assert.match(await page.getByTestId('total').innerText(),/89.*23/);assert.equal(await page.getByTestId('usage-known').innerText(),'1');assert.equal(await page.getByTestId('usage-unknown').innerText(),'1');assert.equal(await page.getByTestId('usage-input').innerText(),'470');assert.equal(await page.getByTestId('usage-output').innerText(),'161');
 await page.getByRole('button',{name:'查看用量来源'}).click();await page.getByTestId('source-value').waitFor();assert.match(await page.getByLabel('来源记录',{exact:true}).innerText(),/\/segment7Final\/tasks\/0\/accounting\/usage/);await page.getByRole('button',{name:'关闭来源'}).click();
 await page.getByRole('button',{name:'adaptive-rejection-sampler',exact:true}).click();await page.getByTestId('source-value').waitFor();assert.match(await page.getByTestId('source-value').innerText(),/"validScore": null/);await page.getByRole('button',{name:'关闭来源'}).click();
 const note=page.locator('.file').filter({hasText:'notes.txt'});await note.getByRole('button',{name:'查看文本'}).click();await page.getByTestId('source-value').waitFor();assert.equal(await page.getByTestId('source-value').innerText(),payload);assert.equal(await page.evaluate(()=>window.__importExecuted),undefined);assert.equal(dialogs,0);
 await page.screenshot({path:out+'/browser-a.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await note.getByRole('link',{name:'下载'}).click();const download=await downloadPromise;await download.saveAs(out+'/downloaded-notes.txt');assert.equal((await readFile(out+'/downloaded-notes.txt')).toString(),payload);
 await page.getByRole('button',{name:'退出登录'}).click();await page.getByLabel('邮箱').fill('b@web106.test');await page.getByLabel('密码',{exact:true}).fill(process.env.ACCOUNT_B_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'导入证据包'}).waitFor();assert.equal(await page.getByRole('button',{name:/Browser private import/}).count(),0);await page.screenshot({path:out+'/browser-b.png',fullPage:true});
 await writeFile(out+'/browser.json',JSON.stringify({checks:['page login A','file input upload','89/23 and segment7 values','usage pointer','row pointer/null','script text inert','authenticated download exact bytes','B list isolation'],passed:true,dialogs},null,2));
 }
}finally{await browser.close()}
