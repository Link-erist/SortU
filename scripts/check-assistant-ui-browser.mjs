// End-to-end check of the assistant through the page with Local AI: organize by Content, ask a vague question
// (answered by the model), apply a rule-based change, and confirm approval resets. Then checks every page at
// 390 px in both themes for sideways scrolling. Needs the preview server and a profile with Local AI prepared.
// Usage: AI_BROWSER_CHANNEL=chrome AI_BROWSER_PROFILE=work/ai-chrome-profile node scripts/check-assistant-ui-browser.mjs
import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const context=await chromium.launchPersistentContext(process.env.AI_BROWSER_PROFILE||'work/ai-browser-profile',{channel:process.env.AI_BROWSER_CHANNEL||'msedge',headless:true}),page=await context.newPage();
const errors=[],external=[],evidence={};
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!/^(http:\/\/127\.0\.0\.1:4173\/|blob:|data:)/.test(request.url()))external.push(request.url());});
const log=()=>page.locator('#assistant-log li').allTextContents();
async function send(text,timeout=240000) {
 const before=(await log()).length;await page.locator('#assistant-input').fill(text);await page.locator('#assistant-send').click();
 // Wait for the final reply (the send button returns from Stop to Send).
 await page.waitForFunction(count=>document.querySelectorAll('#assistant-log li').length>count+1&&document.getElementById('assistant-send').textContent==='Send',before,{timeout});
 return (await log()).slice(before+1);
}
try {
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const name of await caches.keys())if(name.startsWith('appbuildershackathon-'))await caches.delete(name);localStorage.removeItem('organizer-assistant-history');});
 await page.reload();await page.locator('#tab-organize').click();
 await page.waitForFunction(()=>document.getElementById('organizer-root').dataset.aiState==='ready',{},{timeout:120000});
 assert.equal(await page.locator('input[name="organize-by"][value="content"]').isChecked(),true);
 // 1. Before a proposal, a description becomes the direction for Organize.
 evidence.direction=await send('Keep recipes and invoices apart, by subject');
 assert.match(evidence.direction.at(-1),/Local AI will follow this/);assert.match(await page.locator('#organizer-instructions').inputValue(),/recipes and invoices apart/);
 await page.locator('#organizer-files').setInputFiles(['work/evidence/ai-fixtures/f01.txt','work/evidence/ai-fixtures/f07.md','work/evidence/ai-fixtures/f05.txt']);
 const started=Date.now();await page.locator('#generate-proposal').click();
 // A description may open the guide confirmation dialog, which the user confirms.
 for(const deadline=Date.now()+480000;Date.now()<deadline;await page.waitForTimeout(2000)) {
  const state=await page.evaluate(()=>({done:!document.getElementById('proposal-area').hidden||document.getElementById('organizer-status').dataset.state==='error',dialog:document.getElementById('guide-review').open,status:document.getElementById('organizer-status').textContent}));
  if(state.done)break;if(state.dialog){evidence.guideDialog=true;await page.locator('#confirm-guide').click();}
  if(Date.now()%30000<2000)console.log(state.status);
 }
 assert.equal(await page.locator('#proposal-area').isVisible(),true,await page.locator('#organizer-status').textContent());evidence.analysisSeconds=Math.round((Date.now()-started)/1000);
 evidence.tree=await page.locator('#proposal-tree').innerText();await page.locator('#approve-proposal').click();assert.equal(await page.locator('#export-zip').isEnabled(),true);
 // 2. A vague request reaches the model; whatever it answers, nothing changes without Apply.
 const vagueStart=Date.now();evidence.vague=await send('Can you tidy these up a bit more?');evidence.vagueSeconds=Math.round((Date.now()-vagueStart)/1000);
 evidence.vaguePreview=await page.locator('#assistant-preview').isVisible();assert.equal(await page.locator('#export-zip').isEnabled(),true,'A reply alone must not change the approved proposal');
 if(evidence.vaguePreview){await page.locator('#assistant-discard').click();}
 // 3. Off-topic and forbidden requests are refused.
 evidence.offTopic=await send('Tell me a joke');assert.match(evidence.offTopic.at(-1),/only help with organizing/);
 evidence.approve=await send('approve and export it');assert.match(evidence.approve.at(-1),/can't approve/);
 // 4. A clear command previews, Apply changes the tree and revokes approval.
 const folder=(await page.locator('#proposal-tree summary').first().textContent()).replace(/ \(\d+\)$/,'');
 evidence.rename=await send(`rename ${folder} to Checked Files`);assert.equal(await page.locator('#assistant-preview').isVisible(),true,evidence.rename.join(' | '));
 await page.locator('#assistant-apply').click();assert.match(await page.locator('#proposal-tree').innerText(),/Checked Files/);assert.equal(await page.locator('#export-zip').isEnabled(),false);
 evidence.historyAfterReload=(await (async()=>{await page.reload();await page.locator('#tab-organize').click();return (await log()).length;})())>0;
 // 5. Every page at 390 px in both themes, without sideways scrolling.
 await page.setViewportSize({width:390,height:844});evidence.mobile=[];
 for(const theme of ['dark','light']) {
  await page.evaluate(theme=>{const select=document.getElementById('theme-select');select.value=theme;select.dispatchEvent(new Event('change'));},theme);
  for(const tab of ['home','organize','transcribe','transfer','settings']) {
   await page.evaluate(tab=>document.getElementById(`tab-${tab}`).click(),tab);await page.waitForTimeout(200);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);evidence.mobile.push({theme,tab,overflow});
   await mkdir('work/evidence/shell',{recursive:true});await page.screenshot({path:`work/evidence/shell/${theme}-${tab}-390.png`,fullPage:true});
  }
 }
 await page.evaluate(()=>{const select=document.getElementById('theme-select');select.value='dark';select.dispatchEvent(new Event('change'));});
 assert.deepEqual(evidence.mobile.filter(entry=>entry.overflow),[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 evidence.errors=errors;evidence.externalRequests=external.length;
} finally {
 await mkdir('work/evidence',{recursive:true});await writeFile('work/evidence/assistant-ui-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await context.close();
}
