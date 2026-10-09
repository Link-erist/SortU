// Real-browser check of the AI-first organizer screens: setup (capable, model not prepared), unsupported browser,
// and basic organization on a device that cannot run the model. The "ready" state is covered by check-ai-organizer-browser.mjs.
// Test-only overrides (an init script) simulate Firefox or missing WebGPU; the app itself has no test hooks.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),evidence={};
async function open(initScript) {
 const context=await browser.newContext(),page=await context.newPage(),errors=[],remote=[];
 if(initScript)await page.addInitScript(initScript);
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173/'))remote.push(request.url());});
 await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>!['checking',undefined].includes(document.getElementById('organizer-root').dataset.aiState));
 return {context,page,errors,remote,state:await page.evaluate(()=>document.getElementById('organizer-root').dataset.aiState)};
}
const stepsVisible=page=>page.locator('#organizer-files').isVisible();
try {
 // 1. A capable browser without a prepared model sees only the setup card, and nothing is downloaded on load.
 {const {context,page,errors,remote,state}=await open();
  assert.equal(state,'setup');assert.equal(await stepsVisible(page),false);assert.equal(await page.locator('#prepare-ai').isVisible(),true);assert.equal(await page.locator('#load-ai-folder').isVisible(),true);assert.equal(await page.locator('#save-ai-folder').isVisible(),false);
  assert.match(await page.locator('#ai-setup-message').textContent(),/885 MB/);await page.waitForTimeout(1500);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  evidence.setup={state,stepsHidden:true,noDownloadsOnLoad:true};await context.close();}
 // 2. Firefox is told the organizer is unsupported; organizer steps stay hidden.
 {const {context,page,errors,state}=await open(()=>{Object.defineProperty(Navigator.prototype,'userAgent',{get:()=>'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'});Object.defineProperty(Navigator.prototype,'userAgentData',{get:()=>undefined});});
  assert.equal(state,'unsupported');assert.equal(await stepsVisible(page),false);assert.match(await page.locator('#ai-setup-message').textContent(),/Firefox is not supported.*Chrome and Edge.*transfer/s);assert.deepEqual(errors,[]);
  evidence.unsupported={state,stepsHidden:true};await context.close();}
 // 3. A supported browser on a device without WebGPU gets labelled basic organization, which works end to end and offline.
 {const {context,page,errors,state}=await open(()=>{Object.defineProperty(Navigator.prototype,'gpu',{get:()=>undefined});});
  assert.equal(state,'basic');assert.equal(await stepsVisible(page),true);assert.match(await page.locator('#ai-setup-message').textContent(),/cannot run Local AI.*Basic organization/s);assert.equal(await page.locator('#prepare-ai').isVisible(),false);
  await page.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');
  await page.locator('#organizer-files').setInputFiles({name:'one.txt',mimeType:'text/plain',buffer:Buffer.from('Invoice for office supplies')});assert.equal(await page.locator('#generate-proposal').textContent(),'Generate proposal');
  await page.locator('#generate-proposal').click();await page.locator('#approve-proposal').click();assert.equal(await page.locator('#export-zip').isEnabled(),true);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.getElementById('organizer-root').dataset.aiState==='basic');assert.deepEqual(errors,[]);
  evidence.basic={state,proposalAndExportEnabled:true,offlineReload:true};await context.close();}
 console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
