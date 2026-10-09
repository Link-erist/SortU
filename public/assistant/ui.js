import {askAssistant,directionFrom} from './ask.js';
import {applyPreview} from './core.js';
import {clearHistory,loadHistory,saveHistory} from './history.js';
import {createLocalRuntime} from '../ai/runtime.js';
import {acquireExportLock} from '../transfer/resources.js';
const IDLE_UNLOAD=120000;
// The chat in the description box. Before a proposal it sets the direction for Organize; afterwards it explains and
// proposes changes that appear as a preview in the Proposed changes panel and change nothing until Apply.
export function mountAssistant(root,{session,aiReady,isBusy,onDirection,onApplied,onBusy}) {
 const $=selector=>root.querySelector(selector),removers=[],storage=(()=>{try{return window.localStorage;}catch{return undefined;}})();
 let history=loadHistory(storage),preview=null,controller=null,runtime=null,release=null,idle=null,closed=false;
 const listen=(selector,event,fn)=>{const element=$(selector);element.addEventListener(event,fn);removers.push(()=>element.removeEventListener(event,fn));};
 function renderLog() {
  $('#assistant-log').replaceChildren(...history.map(entry=>{const item=document.createElement('li');item.className=`chat-${entry.role}`;item.textContent=entry.text;return item;}));
  $('#assistant-empty').hidden=history.length>0;$('#assistant-log').scrollTop=$('#assistant-log').scrollHeight;
 }
 const say=(role,text)=>{history=saveHistory(storage,[...history,{role,text}]);renderLog();};
 function renderPreview() {
  const box=$('#assistant-preview');box.hidden=!preview;if(!preview)return;
  $('#assistant-preview-summary').replaceChildren(...preview.accepted.map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
  $('#assistant-preview-list').replaceChildren(...preview.changes.map(change=>{const item=document.createElement('li');item.textContent=`${change.from} → ${change.to}`;return item;}));
  $('#assistant-preview-rejected').textContent=preview.rejected.length?`Not included: ${preview.rejected.map(entry=>entry.reason).join(' ')}`:'';
  $('#assistant-apply').disabled=!preview.changes.length||isBusy()||!!controller;
 }
 function buttons() {
  const busy=!!controller;$('#assistant-send').textContent=busy?'Stop':'Send';$('#assistant-input').disabled=busy;$('#assistant-clear').disabled=busy;
  $('#assistant-send').disabled=!busy&&isBusy();renderPreview();
 }
 async function unloadModel() {
  clearTimeout(idle);idle=null;const current=runtime,done=release;runtime=null;release=null;
  try{await current?.unload();}catch{}current?.dispose();done?.();
 }
 // Loads Local AI only when a request needs it, and keeps it briefly for follow-up questions.
 async function getRuntime() {
  if(!aiReady())return null;clearTimeout(idle);if(runtime)return runtime;
  say('assistant','Loading Local AI for this question. The first answer can take a minute.');
  release=await acquireExportLock('organizer-ai',controller.signal);
  runtime=createLocalRuntime({signal:controller.signal});await runtime.verifyOffline();return runtime;
 }
 async function send() {
  if(controller){controller.abort();return;}
  const message=$('#assistant-input').value;if(!message.trim())return;$('#assistant-input').value='';say('user',message.trim());
  if(!session.proposal){const direction=directionFrom(message);say('assistant',direction.reply||onDirection(direction));return;}
  controller=new AbortController();onBusy?.(true);buttons();
  try{const result=await askAssistant({getRuntime,proposal:session.proposal,message});if(closed)return;
   if(result.preview&&!result.preview.changes.length)say('assistant',`I couldn't make that change: ${result.preview.rejected.map(entry=>entry.reason).join(' ')||'nothing would change.'}`);
   else {say('assistant',result.reply);if(result.preview)preview=result.preview;}}
  catch(error){if(closed)return;say('assistant',controller?.signal.aborted?'Stopped. Nothing was changed.':`The assistant could not answer: ${error.message} Nothing was changed.`);await unloadModel();}
  finally{if(!closed){controller=null;onBusy?.(false);buttons();if(runtime){clearTimeout(idle);idle=setTimeout(()=>void unloadModel(),IDLE_UNLOAD);}}}
 }
 listen('#assistant-send','click',()=>void send());
 listen('#assistant-input','keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}});
 listen('#assistant-clear','click',()=>{history=clearHistory(storage);renderLog();});
 listen('#assistant-discard','click',()=>{preview=null;say('assistant','Discarded. Nothing was changed.');renderPreview();});
 listen('#assistant-apply','click',()=>{
  if(!preview||isBusy())return;
  try{applyPreview(session,preview);const count=preview.changes.length;preview=null;onApplied();say('assistant',`Applied. ${count} file${count===1?'':'s'} moved in the proposal. Review it and approve again before saving.`);}
  catch(error){preview=null;say('assistant',`${error.message} Nothing was changed.`);}
  renderPreview();
 });
 renderLog();buttons();
 return {
  // Called whenever the organizer redraws: a preview for an older proposal is dropped.
  sync(){if(preview&&preview.revision!==session.proposal?.revision)preview=null;buttons();},
  // Frees the graphics chip before Organize runs its own analysis.
  releaseModel:()=>unloadModel(),
  dispose(){closed=true;controller?.abort();void unloadModel();removers.forEach(remove=>remove());}
 };
}
