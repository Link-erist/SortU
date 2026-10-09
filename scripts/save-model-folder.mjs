// Saves a model prepared in a browser test profile to a folder on disk, using the app's own save code
// (via browser private storage, because the native folder picker cannot be automated).
// Usage: node scripts/save-model-folder.mjs <manifest path, e.g. ai/model.json or transcribe/model.json> <output folder>
// (no leading slash: Git Bash rewrites /paths into Windows paths)
// Needs the preview server and a profile where that model is prepared (default work/ai-browser-profile).
import {createRequire} from 'node:module';import {appendFile,mkdir,rm,writeFile} from 'node:fs/promises';import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [manifestArg,output]=process.argv.slice(2),manifestPath='/'+String(manifestArg||'').replace(/^\/+/,'');if(!manifestArg||!output)throw new Error('Usage: save-model-folder.mjs <manifest path> <output folder>');
const context=await chromium.launchPersistentContext(process.env.AI_BROWSER_PROFILE||'work/ai-browser-profile',{channel:process.env.AI_BROWSER_CHANNEL||'msedge',headless:true}),page=await context.newPage();
try {
 await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline',{},{timeout:60000});
 const saved=await page.evaluate(async manifestPath=>{const {saveModelFolder,filesFromDirectory}=await import('/ai/model-folder.js');const manifest=await(await fetch(manifestPath)).json();
  const root=await navigator.storage.getDirectory();await root.removeEntry('model-export',{recursive:true}).catch(()=>{});const dir=await root.getDirectoryHandle('model-export',{create:true});
  const result=await saveModelFolder(dir,{manifest});globalThis.savedFiles=await filesFromDirectory(dir);return {...result,paths:[...globalThis.savedFiles.keys()]};},manifestPath);
 await rm(output,{recursive:true,force:true});
 for(const relative of saved.paths) {
  const target=path.join(output,...relative.split('/'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,new Uint8Array());
  for(let offset=0;;offset+=8*1024*1024){const chunk=await page.evaluate(async([name,start])=>{const bytes=new Uint8Array(await globalThis.savedFiles.get(name).slice(start,start+8*1024*1024).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);},[relative,offset]);
   if(!chunk)break;await appendFile(target,Buffer.from(chunk,'base64'));}
 }
 await page.evaluate(async()=>{await(await navigator.storage.getDirectory()).removeEntry('model-export',{recursive:true});});
 console.log(JSON.stringify({output,files:saved.files,bytes:saved.bytes}));
} finally {await context.close();}
