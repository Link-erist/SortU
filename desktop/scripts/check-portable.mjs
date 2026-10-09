// Real check of the portable ZIP: unzip, launch, install the bundled model, generate offline, then confirm a clean delete.
// Usage: node desktop/scripts/check-portable.mjs <zip> <emptyWorkDir>   (needs PLAYWRIGHT_MODULE or local playwright)
import {createRequire} from 'node:module';import {spawn,execFileSync} from 'node:child_process';import {mkdir,readdir,rm,stat} from 'node:fs/promises';import {existsSync} from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [zip,work]=process.argv.slice(2).map(value=>path.resolve(value));const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
const evidence={};const appDataMatches=async()=>{const found=[];for(const base of [process.env.LOCALAPPDATA,process.env.APPDATA])for(const name of await readdir(base))if(/aiorganizer|ai organizer|ai-organizer/i.test(name))found.push(path.join(base,name));return found;};
await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});execFileSync(tar,['-x','-f',zip,'-C',work]);
const folder=path.join(work,(await readdir(work))[0]),exe=path.join(folder,'AI Organizer.exe');assert.ok(existsSync(exe));
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
 await page.waitForFunction(()=>{const status=document.getElementById('ai-status');return /installed from the bundled model/.test(status?.textContent)||status?.dataset.state==='error';},{},{timeout:900000});
 evidence.installStatus=await page.locator('#ai-status').textContent();evidence.installMilliseconds=Date.now()-started;assert.match(evidence.installStatus,/installed from the bundled model/);
 evidence.generation=await page.evaluate(async()=>{const {createLocalRuntime}=await import('/ai/runtime.js');const runtime=createLocalRuntime();try{await runtime.verifyOffline();
  return JSON.parse((await runtime.generate({kind:'file',entry:{id:'f1',name:'f1.txt'},guide:'',text:'Invoice INV-2026-013 from Acme Supplies for office paper and pens. Total PHP 1500, due October 30 2026.',rules:{},revision:'portable'})).raw);}finally{runtime.dispose();}});
 assert.match(evidence.generation.category,/invoice|financ|bill/i);
 evidence.externalRequests=external;evidence.pageErrors=errors;assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
} finally {await browser?.close().catch(()=>{});app.kill();try{execFileSync('taskkill',['/F','/T','/IM','AI Organizer.exe'],{stdio:'ignore'});}catch{}}
await new Promise(resolve=>setTimeout(resolve,3000));
evidence.dataFolderCreated=existsSync(path.join(folder,'data'));
let dataBytes=0;for(const entry of await readdir(path.join(folder,'data'),{recursive:true,withFileTypes:true}))if(entry.isFile())dataBytes+=(await stat(path.join(entry.parentPath,entry.name))).size;evidence.dataBytes=dataBytes;
const after=await appDataMatches();evidence.newAppDataEntries=after.filter(item=>!before.includes(item));
await rm(work,{recursive:true,force:true});evidence.deletedCleanly=!existsSync(work);
console.log(JSON.stringify(evidence,null,2));assert.deepEqual(evidence.newAppDataEntries,[]);assert.ok(evidence.dataFolderCreated);
