import {createLocalRuntime} from './runtime.js';
import {createAiOrganizer} from './organize.js';
import {browserSupport,checkAiCapabilities} from './capabilities.js';
import {acquireExportLock} from '../transfer/resources.js';
import {wildcardMatch} from '../organizer/inventory.js';
import {filesFromDirectory,filesFromInput,isModelPrepared,modelFolderEntries,saveModelFolder} from './model-folder.js';
import {loadCategories,resetCategories,saveCategories} from '../organizer/categories.js';
export function mountAiControls(root,{settingsRoot,onModeChange,onBusy,onStatus}={}) {
 const $=selector=>root.querySelector(selector)||settingsRoot?.querySelector(selector),removers=[];let active=null,disposed=false;
 const status=(message,error=false)=>{if(disposed)return;$('#ai-status').textContent=message;$('#ai-status').dataset.state=error?'error':'ready';};
 const progress=p=>{const message=p.bytes!==undefined?`${p.stage}: ${(p.bytes/1000000).toFixed(1)} MB / ${(p.total/1000000).toFixed(1)} MB`:p.path?`${p.stage}: ${p.path}`:p.summary||p.stage;status(message);onStatus?.(message);};
 const listen=(selector,event,fn)=>{const el=$(selector);el.addEventListener(event,fn);removers.push(()=>el.removeEventListener(event,fn));};
 async function prepare(files) {
  if(active)return;active=new AbortController();onBusy?.(active);let release,runtime;
  try {progress({stage:'Waiting for preparation resources'});release=await acquireExportLock('organizer-ai',active.signal);// Ask the browser to keep the large model cache; without this a plain tab's storage can be evicted under disk pressure.
   const persisted=await Promise.resolve(navigator.storage?.persist?.()).catch(()=>false);
   runtime=createLocalRuntime({signal:active.signal,onProgress:progress});const result=await runtime.prepare(files?{files}:{});void refreshState();status(`${files?'Loaded':'Prepared'} ${result.modelId}${files?' from the folder':''}. Offline readiness will be checked when analyzing files.${persisted?'':' This browser may remove the prepared model when storage is low; installing the app makes that less likely.'}`);}
  catch(error){status(error.message,true);onStatus?.(error.message,true);}
  finally{try{await runtime?.unload();}catch{}runtime?.dispose();release?.();active=null;onBusy?.(null);}
 }
 // Reading localStorage itself can throw when site data is blocked; categories then use defaults for this visit.
 const storage=(()=>{try{return window.localStorage;}catch{return undefined;}})();
 let categories=loadCategories(storage);
 const showCategories=message=>{$('#category-list').value=categories.filter(name=>name!=='Other').join('\n');$('#category-status').textContent=message;};
 showCategories('');
 listen('#save-categories','click',()=>{try{categories=saveCategories(storage,$('#category-list').value);showCategories(`Saved ${categories.length} categories.`);}catch(error){$('#category-status').textContent=error.message;}});
 listen('#reset-categories','click',()=>{categories=resetCategories(storage);showCategories('Restored the default categories.');});
 async function saveFolder() {
  if(active)return;if(!window.showDirectoryPicker){status('This browser cannot write folders. Use Chrome or Edge to save the model.',true);return;}
  let root;try{root=await window.showDirectoryPicker({id:'ai-organizer-model',mode:'readwrite'});}catch{return;}
  active=new AbortController();onBusy?.(active);let release;
  try{release=await acquireExportLock('organizer-ai',active.signal);const manifest=await(await fetch(new URL('./model.json',import.meta.url))).json();
   const result=await saveModelFolder(root,{manifest,signal:active.signal,onProgress:p=>progress({stage:`${p.stage} (${p.completed+1}/${p.total})`,path:p.file})});
   status(`Saved the model to "${root.name}" (${(result.bytes/1000000).toFixed(0)} MB). In another browser or profile, choose Load model from folder and pick this folder.`);}
  catch(error){status(error.message,true);}finally{release?.();active=null;onBusy?.(null);}
 }
 async function loadFolder() {
  if(active)return;
  if(window.showDirectoryPicker){let root;try{root=await window.showDirectoryPicker({id:'ai-organizer-model'});}catch{return;}status('Reading the model folder');try{await prepare(await filesFromDirectory(root));}catch(error){status(error.message,true);}}
  else $('#load-ai-folder-input').click();
 }
 // The app chooses the mode: Local AI when this device can run it, basic organization only as a labelled fallback.
 let manifestRequest;const manifest=()=>manifestRequest||=fetch(new URL('./model.json',import.meta.url)).then(response=>response.json());
 function setState(state,message) {
  if(disposed)return;root.dataset.aiState=state;$('#ai-setup-message').textContent=message;$('#organizer-gate-message').textContent=message;
  const mode=state==='ready'?'local':'rules';if($('#ai-mode').value!==mode){$('#ai-mode').value=mode;onModeChange?.();}
  $('#prepare-ai').hidden=$('#load-ai-folder').hidden=state!=='setup';$('#save-ai-folder').hidden=$('#remove-ai').hidden=state!=='ready';
 }
 async function refreshState() {
  const support=browserSupport(navigator),tested='Local AI is tested on Chrome and Edge on computers, and Chrome on Android.';
  if(support.level==='rejected'){setState('unsupported',`${support.name} is not supported for the organizer. ${tested} File transfer still works in this browser.`);return;}
  const caps=await checkAiCapabilities(navigator,{secureContext:window.isSecureContext});
  if(!caps.supported){
   if(support.level==='untested')setState('unsupported',`${caps.reason} ${tested} File transfer still works in this browser.`);
   else setState('basic',`This device cannot run Local AI: ${caps.reason} Basic organization (names and metadata only) is available instead.`);
   return;
  }
  const note=support.level==='untested'?` This browser has not been tested. ${tested}`:'';
  if(await isModelPrepared(await manifest()))setState('ready',`Local AI is ready and works offline.${note}`);
  else setState('setup',`Set up Local AI to organize by content: download it once (about 885 MB), or load it from a saved model folder. Your files are never uploaded.${note}`);
 }
 root.dataset.aiState='checking';void refreshState().catch(error=>setState('basic',`Local AI check failed: ${error.message} Basic organization is available instead.`));
 listen('#save-ai-folder','click',()=>void saveFolder());listen('#load-ai-folder','click',()=>void loadFolder());
 listen('#load-ai-folder-input','change',event=>{const files=event.target.files;if(files?.length)void prepare(filesFromInput(files));event.target.value='';});
 listen('#prepare-ai','click',()=>void prepare());listen('#cancel-ai','click',()=>active?.abort());listen('#cancel-ai-setup','click',()=>active?.abort());
 listen('#remove-ai','click',()=>void removeModel());
 // Deletes the prepared model from this browser's storage; it can be prepared or loaded from a folder again.
 async function removeModel() {
  if(active||!window.confirm('Remove the Local AI model from this browser? You can prepare it again or load it from a saved folder.'))return;
  try{for(const scope of new Set(modelFolderEntries(await manifest()).map(entry=>entry.scope)))await caches.delete(scope);status('Removed the Local AI model from this browser.');}
  catch(error){status(error.message,true);}
  await refreshState();
 }
 function guideReview(guidance,inputs,signal) {
  return new Promise(resolve=>{
   const dialog=$('#guide-review'),list=$('#guide-review-files');list.replaceChildren();$('#guide-review-summary').textContent=`${guidance.summary} Review exclusions by filename before any file is analyzed. Content-based exclusion cannot be determined without reading files; select the files to skip yourself.`;
   const ids=new Set(inputs.exclusions?.excludedIds||[]),patterns=[...inputs.rules.patterns,...guidance.exclusionPatterns];
   for(const entry of inputs.inventory.entries){const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');box.type='checkbox';box.dataset.fileId=entry.id;
    const excluded=ids.has(entry.id)||patterns.some(pattern=>wildcardMatch(pattern,entry.name)||wildcardMatch(pattern,entry.sourcePath));box.checked=!excluded;box.disabled=excluded;text.textContent=entry.sourcePath+(excluded?' (excluded)':'');label.append(box,text);list.append(label);}
   let done=false;const finish=confirmed=>{if(done)return;done=true;dialog.close();signal.removeEventListener('abort',cancel);$('#confirm-guide').removeEventListener('click',confirm);$('#cancel-guide').removeEventListener('click',cancel);dialog.removeEventListener('cancel',cancel);resolve({confirmed,excludedIds:Array.from(list.querySelectorAll('input')).filter(box=>!box.checked).map(box=>box.dataset.fileId)});};
   const confirm=()=>finish(true),cancel=event=>{event?.preventDefault?.();finish(false);};$('#confirm-guide').addEventListener('click',confirm);$('#cancel-guide').addEventListener('click',cancel);dialog.addEventListener('cancel',cancel);signal.addEventListener('abort',cancel,{once:true});dialog.showModal();if(signal.aborted)cancel();
  });
 }
 return {
  getMode:()=>$('#ai-mode').value,
  isBusy:()=>!!active,
  async analyze(inputs) {
   if(active)throw new Error('Local AI is already running.');active=new AbortController();onBusy?.(active);const controller=active,organizer=createAiOrganizer();
   try{const result=await organizer.analyze({...inputs,categories},{signal:controller.signal,onProgress:progress,onGuideReview:guidance=>guideReview(guidance,inputs,controller.signal)});status('AI proposal ready. Review it before approving.');return result;}
   catch(error){status(error.message,true);throw error;}
   finally{organizer.dispose();active=null;onBusy?.(null);}
  },
  cancel(){active?.abort();},
  dispose(){disposed=true;active?.abort();removers.forEach(remove=>remove());}
 };
}
