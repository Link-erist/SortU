import {createLocalRuntime} from './runtime.js';
import {createAiOrganizer} from './organize.js';
import {checkAiCapabilities} from './capabilities.js';
import {acquireExportLock} from '../transfer/resources.js';
import {wildcardMatch} from '../organizer/inventory.js';
export function mountAiControls(root,{onModeChange,onBusy,onStatus}={}) {
 const $=selector=>root.querySelector(selector),removers=[];let active=null,disposed=false;
 const status=(message,error=false)=>{if(disposed)return;$('#ai-status').textContent=message;$('#ai-status').dataset.state=error?'error':'ready';};
 const progress=p=>{const message=p.bytes!==undefined?`${p.stage}: ${(p.bytes/1000000).toFixed(1)} MB / ${(p.total/1000000).toFixed(1)} MB`:p.path?`${p.stage}: ${p.path}`:p.summary||p.stage;status(message);onStatus?.(message);};
 const listen=(selector,event,fn)=>{const el=$(selector);el.addEventListener(event,fn);removers.push(()=>el.removeEventListener(event,fn));};
 async function prepare() {
  if(active)return;active=new AbortController();onBusy?.(active);let release,runtime;
  try {progress({stage:'Waiting for preparation resources'});release=await acquireExportLock('organizer-ai',active.signal);runtime=createLocalRuntime({signal:active.signal,onProgress:progress});const result=await runtime.prepare();status(`Prepared ${result.modelId}. Offline readiness will be checked when analyzing files.`);}
  catch(error){status(error.message,true);onStatus?.(error.message,true);}
  finally{try{await runtime?.unload();}catch{}runtime?.dispose();release?.();active=null;onBusy?.(null);}
 }
 listen('#ai-mode','change',()=>{onModeChange?.();$('#prepare-ai').hidden=$('#ai-mode').value!=='local';});
 listen('#prepare-ai','click',()=>void prepare());listen('#cancel-ai','click',()=>active?.abort());
 void checkAiCapabilities(navigator,{secureContext:window.isSecureContext}).then(caps=>{if(!active)status(caps.reason);});
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
   try{const result=await organizer.analyze(inputs,{signal:controller.signal,onProgress:progress,onGuideReview:guidance=>guideReview(guidance,inputs,controller.signal)});status('AI proposal ready. Review it before approving.');return result;}
   catch(error){status(error.message,true);throw error;}
   finally{organizer.dispose();active=null;onBusy?.(null);}
  },
  cancel(){active?.abort();},
  dispose(){disposed=true;active?.abort();removers.forEach(remove=>remove());}
 };
}
