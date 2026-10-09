// Real-browser check: save the prepared model from Edge to a folder, then load it into a fresh Chrome profile with the network blocked.
// Needs a prepared model in the Edge profile (work/ai-browser-profile) and the preview server on 127.0.0.1:4173.
import {createRequire} from 'node:module';import {mkdir,rm,writeFile,appendFile,readdir,stat} from 'node:fs/promises';import assert from 'node:assert/strict';import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const folder='work/model-folder',evidence={};
async function openApp(profile,channel) {
 const context=await chromium.launchPersistentContext(profile,{channel,headless:true}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const name of await caches.keys())if(name.startsWith('appbuildershackathon-'))await caches.delete(name);});
 await page.goto('about:blank');await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');
 await context.setOffline(true);return {context,page,errors};
}
// Part 1: Edge saves its prepared model with the production save code into private storage, then the bytes are copied to disk.
{
 const {context,page,errors}=await openApp('work/ai-browser-profile','msedge');
 try {
  const started=Date.now();
  evidence.save=await page.evaluate(async()=>{const {saveModelFolder,filesFromDirectory}=await import('/ai/model-folder.js');const manifest=await(await fetch('/ai/model.json')).json();
   const root=await navigator.storage.getDirectory();await root.removeEntry('model-export',{recursive:true}).catch(()=>{});const dir=await root.getDirectoryHandle('model-export',{create:true});
   const result=await saveModelFolder(dir,{manifest});const files=await filesFromDirectory(dir);globalThis.savedFiles=files;return {...result,paths:[...files.keys()]};});
  evidence.saveMilliseconds=Date.now()-started;
  await rm(folder,{recursive:true,force:true});
  for(const relative of evidence.save.paths) {
   const target=path.join(folder,...relative.split('/'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,new Uint8Array());
   for(let offset=0;;offset+=8*1024*1024){const chunk=await page.evaluate(async([name,start])=>{const file=globalThis.savedFiles.get(name),bytes=new Uint8Array(await file.slice(start,start+8*1024*1024).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);},[relative,offset]);
    if(!chunk)break;await appendFile(target,Buffer.from(chunk,'base64'));}
  }
  await page.evaluate(async()=>{await(await navigator.storage.getDirectory()).removeEntry('model-export',{recursive:true});});
  assert.deepEqual(errors,[]);
 } finally {await context.close();}
}
let diskBytes=0;for(const entry of await readdir(folder,{recursive:true,withFileTypes:true}))if(entry.isFile())diskBytes+=(await stat(path.join(entry.parentPath,entry.name))).size;
evidence.diskBytes=diskBytes;assert.equal(diskBytes,evidence.save.bytes+(await stat(path.join(folder,'ai-organizer-model.json'))).size);
// Part 2: a fresh Chrome profile loads the folder offline, then cold-loads and runs the model from its own cache.
{
 const profile=process.env.AI_CHROME_PROFILE||'work/ai-chrome-profile';await rm(profile,{recursive:true,force:true});
 const {context,page,errors}=await openApp(profile,process.env.AI_BROWSER_CHANNEL||'chrome');const requests=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173/'))requests.push(request.url());});
 try {
  await page.waitForFunction(()=>document.getElementById('organizer-root').dataset.aiState==='setup');const started=Date.now();
  await page.locator('#load-ai-folder-input').setInputFiles(folder);
  await page.waitForFunction(()=>{const status=document.getElementById('ai-status');return /^Loaded /.test(status.textContent)||status.dataset.state==='error';},{},{timeout:900000});
  evidence.loadStatus=await page.locator('#ai-status').textContent();evidence.loadMilliseconds=Date.now()-started;assert.match(evidence.loadStatus,/^Loaded /);
  evidence.offlineGeneration=await page.evaluate(async()=>{const {createLocalRuntime}=await import('/ai/runtime.js');const runtime=createLocalRuntime();try{await runtime.verifyOffline();
   return JSON.parse((await runtime.generate({kind:'file',entry:{id:'f1',name:'f1.txt'},guide:'',text:'Chicken adobo recipe. Chicken, soy sauce, vinegar and garlic. Simmer until tender and serve with rice.',rules:{},revision:'folder'})).raw);}finally{runtime.dispose();}});
  assert.match(evidence.offlineGeneration.category,/recipe|food|cook/i);
  // Wrong-version and incomplete folders are covered by tests/ai-model-folder.test.mjs.
  evidence.externalRequests=requests;assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 } finally {await context.close();}
}
await writeFile('work/evidence/ai-model-folder.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,save:{...evidence.save,paths:evidence.save.paths.length}},null,2));
