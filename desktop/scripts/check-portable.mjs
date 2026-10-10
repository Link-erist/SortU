// Real check of the portable ZIP: unzip, launch, install the bundled model, generate offline, then confirm a clean delete.
// Usage: node desktop/scripts/check-portable.mjs <zip> <emptyWorkDir>   (run from the repo root; uses work/evidence/transcribe-fixtures/meeting.wav)   (needs PLAYWRIGHT_MODULE or local playwright)
import {createRequire} from 'node:module';import {spawn,execFileSync} from 'node:child_process';import {mkdir,readdir,readFile,rm,stat} from 'node:fs/promises';import {existsSync} from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [zip,work]=process.argv.slice(2).map(value=>path.resolve(value));const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
const evidence={};const appDataMatches=async()=>{const found=[];for(const base of [process.env.LOCALAPPDATA,process.env.APPDATA])for(const name of await readdir(base))if(/aiorganizer|ai organizer|ai-organizer|sortu/i.test(name))found.push(path.join(base,name));return found;};
await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});execFileSync(tar,['-x','-f',zip,'-C',work]);
const folder=path.join(work,(await readdir(work))[0]),exe=path.join(folder,'SortU.exe');assert.ok(existsSync(exe));
const before=await appDataMatches();
const app=spawn(exe,[],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9333'},stdio:'ignore'});
let browser;
try {
 for(let attempt=0;attempt<60&&!browser;attempt++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9333');}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
 assert.ok(browser,'Could not attach to the app window.');
 let page;for(let attempt=0;attempt<40&&!page;attempt++){page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith('http://tauri.localhost'));if(!page)await new Promise(resolve=>setTimeout(resolve,500));}
 assert.ok(page,'App page not found.');const external=[],errors=[];
 page.on('request',request=>{const url=new URL(request.url());if(!['tauri.localhost','model.localhost'].includes(url.hostname))external.push(request.url());});page.on('pageerror',error=>errors.push(error.message));
 const started=Date.now();
 // First launch installs the bundled model and reloads into the ready state; poll so the reload does not break the wait.
 let state;for(const deadline=Date.now()+900000;Date.now()<deadline;await new Promise(resolve=>setTimeout(resolve,1000))){state=await page.evaluate(()=>({ai:document.getElementById('organizer-root')?.dataset.aiState,status:document.getElementById('ai-status')?.textContent,error:document.getElementById('ai-status')?.dataset.state==='error'})).catch(()=>null);if(state?.ai==='ready'||state?.error)break;}
 evidence.installState=state;evidence.installMilliseconds=Date.now()-started;assert.equal(state?.ai,'ready',JSON.stringify(state));
 evidence.generation=await page.evaluate(async()=>{const {createLocalRuntime}=await import('/ai/runtime.js');const runtime=createLocalRuntime();try{await runtime.verifyOffline();
  return JSON.parse((await runtime.generate({kind:'file',entry:{id:'f1',name:'f1.txt'},guide:'',text:'Invoice INV-2026-013 from Acme Supplies for office paper and pens. Total PHP 1500, due October 30 2026.',rules:{},revision:'portable'})).raw);}finally{runtime.dispose();}});
 assert.match(evidence.generation.category,/invoice|financ|bill/i);
 // The bundled transcription model must also work offline inside the portable app.
 const wav=[...await readFile(path.resolve('work/evidence/transcribe-fixtures/meeting.wav'))];
 evidence.transcription=await page.evaluate(async bytes=>{const {createTranscribeRuntime}=await import('/transcribe/runtime.js');const {decodeAudio}=await import('/transcribe/audio.js');
  const decoded=await decodeAudio(new File([new Uint8Array(bytes)],'meeting.wav'));const runtime=createTranscribeRuntime();try{await runtime.verifyOffline();return (await runtime.generate({audio:decoded.audio,revision:'portable'})).text;}finally{runtime.dispose();}},wav);
 assert.match(evidence.transcription,/Atlas/i);
 evidence.externalRequests=external;evidence.pageErrors=errors;assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
} finally {await browser?.close().catch(()=>{});app.kill();try{execFileSync('taskkill',['/F','/T','/IM','SortU.exe'],{stdio:'ignore'});}catch{}}
await new Promise(resolve=>setTimeout(resolve,3000));
evidence.dataFolderCreated=existsSync(path.join(folder,'data'));
let dataBytes=0;for(const entry of await readdir(path.join(folder,'data'),{recursive:true,withFileTypes:true}))if(entry.isFile())dataBytes+=(await stat(path.join(entry.parentPath,entry.name))).size;evidence.dataBytes=dataBytes;
const after=await appDataMatches();evidence.newAppDataEntries=after.filter(item=>!before.includes(item));
await rm(work,{recursive:true,force:true});evidence.deletedCleanly=!existsSync(work);
console.log(JSON.stringify(evidence,null,2));assert.deepEqual(evidence.newAppDataEntries,[]);assert.ok(evidence.dataFolderCreated);
