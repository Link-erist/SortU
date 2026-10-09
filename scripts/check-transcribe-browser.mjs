// Real-browser check of the Transcribe workspace (offline): setup state on a fresh profile, then transcription of
// fictional synthetic speech in a prepared profile, all three formats, cancellation, and no network use.
// Needs the preview server, Whisper prepared in work/ai-browser-profile, and work/evidence/transcribe-fixtures/meeting.wav
// (Windows text-to-speech of SCRIPT below) and a notes.txt non-media file.
import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
export const SCRIPT='Good morning everyone. This is the weekly planning meeting for the Atlas inventory project. First, Maria will finish the supplier report by Thursday. Second, the barcode search feature is ready for testing. Finally, our next review is scheduled for Friday afternoon. Thank you.';
const words=text=>text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
const evidence={},channel=process.env.AI_BROWSER_CHANNEL||'msedge';
async function openApp(context) {
 const page=await context.newPage(),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{const url=request.url();if(!url.startsWith('http://127.0.0.1:4173/')&&!url.startsWith('blob:')&&!url.startsWith('data:'))external.push(url);});
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const name of await caches.keys())if(name.startsWith('appbuildershackathon-'))await caches.delete(name);});
 await page.goto('about:blank');await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');
 await context.setOffline(true);await page.reload();await page.locator('#tab-transcribe').click();
 await page.waitForFunction(()=>!['checking',undefined].includes(document.getElementById('transcribe-root').dataset.transcribeState));
 return {page,errors,external,state:await page.evaluate(()=>document.getElementById('transcribe-root').dataset.transcribeState)};
}
// 1. A fresh profile sees only the setup card and downloads nothing.
{const browser=await chromium.launch({channel,headless:true}),context=await browser.newContext();
 try{const {page,errors,external,state}=await openApp(context);assert.equal(state,'setup');assert.equal(await page.locator('#transcribe-files').isVisible(),false);await page.locator('#tab-settings').click();assert.equal(await page.locator('#prepare-transcribe').isVisible(),true);await page.locator('#tab-transcribe').click();assert.match(await page.locator('#transcribe-gate-message').textContent(),/440 MB/);assert.match(await page.locator('#transcribe-setup-message').textContent(),/440 MB/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);evidence.setup={state,stepsHidden:true};}
 finally{await browser.close();}}
// 2. The prepared profile transcribes offline.
const context=await chromium.launchPersistentContext(process.env.AI_BROWSER_PROFILE||'work/ai-browser-profile',{channel,headless:true});
try {
 const {page,errors,external,state}=await openApp(context);assert.equal(state,'ready');
 await page.locator('#transcribe-files').setInputFiles(['work/evidence/transcribe-fixtures/meeting.wav','work/evidence/transcribe-fixtures/notes.txt']);
 assert.match(await page.locator('#transcribe-status').textContent(),/Skipped 1/);
 for(const format of ['srt','vtt','txt'])await page.locator(`input[name="transcript-format"][value="${format}"]`).check();await page.locator('#transcribe-language').selectOption('en');
 const started=Date.now();await page.locator('#start-transcribe').click();
 await page.waitForFunction(()=>!document.getElementById('transcribe-results-area').hidden&&/Transcribed/.test(document.getElementById('transcribe-status').textContent)||document.getElementById('transcribe-status').dataset.state==='error',{},{timeout:600000});
 evidence.status=await page.locator('#transcribe-status').textContent();assert.match(evidence.status,/Transcribed 1 recording/);evidence.totalMilliseconds=Date.now()-started;
 const outputs=await page.evaluate(async()=>Object.fromEntries(await Promise.all([...document.querySelectorAll('#transcribe-results a[download]')].map(async link=>[link.download,await(await fetch(link.href)).text()]))));
 assert.deepEqual(Object.keys(outputs).sort(),['meeting.srt','meeting.txt','meeting.vtt']);
 assert.ok(outputs['meeting.vtt'].startsWith('WEBVTT\n\n'));assert.match(outputs['meeting.srt'],/^1\n00:00:00,\d{3} --> 00:00:\d{2},\d{3}\n/);
 const times=[...outputs['meeting.srt'].matchAll(/(\d\d):(\d\d):(\d\d),(\d{3}) --> /g)].map(([,h,m,s,ms])=>h*3600+m*60+ +s+ms/1000);assert.ok(times.every((time,index)=>index===0||time>=times[index-1]),'timestamps in order');
 const heard=new Set(words(outputs['meeting.txt'].replace(/\[\d\d:\d\d:\d\d\]/g,''))),expected=words(SCRIPT);evidence.wordRecall=expected.filter(word=>heard.has(word)).length/expected.length;
 assert.ok(evidence.wordRecall>=0.9,`word recall ${evidence.wordRecall}`);evidence.txt=outputs['meeting.txt'];
 // Cancellation: start again, cancel, and the workspace must be usable afterwards.
 await page.locator('#start-transcribe').click();await page.waitForTimeout(3000);await page.locator('#cancel-transcribe').click();
 await page.waitForFunction(()=>/Canceled/.test(document.getElementById('transcribe-status').textContent),{},{timeout:60000});assert.equal(await page.locator('#start-transcribe').isEnabled(),true);evidence.cancel='ok';
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);evidence.externalRequests=0;
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'work/evidence/transcribe-mobile.png',fullPage:true});
 await writeFile('work/evidence/transcribe-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {await context.close();}
