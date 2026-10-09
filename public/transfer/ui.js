import {createPairing,createFrameCollector,encodePairing} from './pairing.js';
import {renderQr,scanPairing} from './qr.js';
import {createTransferEngine} from './engine.js';
import {prepareSink} from './storage.js';
import {LIMITS} from './protocol.js';
import {releaseDownloadResources} from './resources.js';

export function detectCapabilities(env=globalThis){return {transfer:!!(env.isSecureContext&&env.RTCPeerConnection&&env.Worker&&env.crypto?.subtle),camera:!!env.navigator?.mediaDevices?.getUserMedia,streaming:typeof env.showSaveFilePicker==='function'&&!!env.navigator?.storage?.getDirectory,fileLimit:LIMITS.blob};}
export function describeCompletion(state){return {verified:'Verified. Ready to save.',saved:'Saved to your selected destination.','export-requested':'Download requested. Check your browser downloads.'}[state]||'Transferring';}
const sizeLabel=n=>n>=1048576?`${(n/1048576).toFixed(1)} MiB`:`${n.toLocaleString()} bytes`;

export function mountTransfer(root,{pairingFactory=createPairing,engineFactory=createTransferEngine,storageFactory=prepareSink}={}) {
  const $=selector=>root.querySelector(selector);const caps=detectCapabilities();
  let role=null,session=null,engine=null,stopScan=null,cycle=null,frames=[],frameIndex=0,epoch=0,chosen=[],incoming=null,started=0;
  const progressRows=new Map();const cleanupEvents=[];
  const status=(text,bad=false)=>{ $('#transfer-status').textContent=text;$('#transfer-status').dataset.state=bad?'error':'info';};
  const action=(selector,fn)=>{const element=$(selector);const listener=async event=>{element.disabled=true;try{await fn(event);}catch(error){status(error.message,true);}finally{element.disabled=['choose-send','choose-receive'].includes(element.id)?!!role:element.id==='verify-pairing'?!!engine?.ready:false;}};element.addEventListener('click',listener);cleanupEvents.push(()=>element.removeEventListener('click',listener));};
  const on=(selector,type,fn)=>{const element=$(selector);element.addEventListener(type,fn);cleanupEvents.push(()=>element.removeEventListener(type,fn));};
  const clearQr=()=>{clearInterval(cycle);cycle=null;frames=[];$('#qr-area').hidden=true;};
  const paint=()=>{if(!frames.length)return;renderQr($('#pairing-qr'),frames[frameIndex]);$('#qr-frame').textContent=`Frame ${frameIndex+1} of ${frames.length}. Scan every frame.`;};
  async function showPayload(payload){clearQr();$('#pairing-output').value=JSON.stringify(payload);frames=await encodePairing(payload);frameIndex=0;$('#qr-area').hidden=false;paint();if(frames.length>1)cycle=setInterval(()=>{frameIndex=(frameIndex+1)%frames.length;paint();},1100);}
  function row(entry){let r=progressRows.get(entry.id);if(r)return r;const item=document.createElement('li');const name=document.createElement('strong');name.textContent=entry.name;const meta=document.createElement('span');meta.textContent=sizeLabel(entry.size);const progress=document.createElement('progress');progress.max=entry.size||1;progress.value=0;progress.setAttribute('aria-label',`Transfer ${entry.name}`);const state=document.createElement('p');state.textContent='Waiting for approval';const save=document.createElement('button');save.type='button';save.textContent='Save verified file';save.hidden=true;save.addEventListener('click',async()=>{save.disabled=true;state.textContent='Preparing download. Large batches may wait for earlier download buffers to be released.';try{const result=await engine.exportFile(entry.id);state.textContent=describeCompletion(result.state);save.hidden=true;}catch(error){status(error.message,true);save.disabled=false;}});item.append(name,meta,progress,state,save);$('#progress-list').append(item);r={item,progress,state,save,entry};progressRows.set(entry.id,r);return r;}
  function resetProgress(){progressRows.clear();$('#progress-list').replaceChildren();$('#transfer-progress').hidden=false;started=performance.now();}
  function renderIncoming(manifest){incoming=manifest;$('#incoming-files').replaceChildren();for(const entry of manifest.files){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.value=entry.id;check.checked=true;const span=document.createElement('span');span.textContent=`${entry.path} (${sizeLabel(entry.size)})`;label.append(check,span);$('#incoming-files').append(label);}$('#incoming-review').hidden=false;$('#save-mode').hidden=!caps.streaming;status('Incoming files. Review and choose what to accept.');}
  function handleEvent(event){
    if(event.type==='ready'){clearQr();$('#scanner').hidden=true;stopScan?.();stopScan=null;$('#file-workspace').hidden=false;$('#send-workspace').hidden=role!=='send';$('#receive-workspace').hidden=role!=='receive';$('#verify-pairing').disabled=true;status('Both devices confirmed. Ready for local transfer.');}
    else if(event.type==='manifest')renderIncoming(event.manifest);
    else if(event.type==='accepted'){status(role==='send'?'Receiver approved. Sending files.':'Approved. Receiving files.');$('#incoming-review').hidden=true;}
    else if(event.type==='offered'){resetProgress();for(const entry of event.manifest.files)row(entry);status('Waiting for receiver approval.');}
    else if(event.type==='progress'){const r=progressRows.get(event.fileId);if(r){r.progress.value=event.offset;r.state.textContent=`${sizeLabel(event.offset)} of ${sizeLabel(event.size)}`;}const total=Array.from(progressRows.values()).reduce((n,r)=>n+r.progress.value,0);const seconds=Math.max(0.1,(performance.now()-started)/1000);$('#speed-label').textContent=`${(total/1000000/seconds).toFixed(2)} MB/s average (confirmed bytes)`;}
    else if(['verified','saved','export-requested'].includes(event.type)){const r=progressRows.get(event.fileId);if(r){r.progress.value=r.entry.size||1;r.state.textContent=event.remote?`Receiver: ${describeCompletion(event.type)}`:describeCompletion(event.type);r.save.hidden=event.remote||event.type!=='verified';}status(event.type==='verified'?'File verified. Receiver must save it before the next file starts.':describeCompletion(event.type));}
    else if(event.type==='paused'){stopScan?.();clearQr();$('#re-pair').hidden=false;$('#resume-transfer').hidden=role!=='receive';status(event.message,true);}
    else if(event.type==='resuming')status('Stored prefix verified. Continuing transfer.');
    else if(event.type==='canceled'){incoming=null;$('#incoming-review').hidden=true;$('#transfer-progress').hidden=true;status('Transfer canceled. You can select another file.');}
    else if(event.type==='error'){status(event.message,true);$('#re-pair').hidden=false;}
  }
  async function attach(newSession,token){
    const channel=await newSession.channelReady;if(token!==epoch)return;channel.maxMessageSize=newSession.peer.sctp?.maxMessageSize||65536;
    if(engine)engine.reconnect(channel,false);else engine=engineFactory({role,channel,pairingVerified:false,onEvent:handleEvent});
    $('#verification-code').textContent=await newSession.verificationCode();$('#verification-area').hidden=false;$('#verify-pairing').disabled=false;status('Compare the code on both screens, then confirm on BOTH devices.');
  }
  async function newSession(mode,payload){const token=++epoch;session?.close();stopScan?.();stopScan=null;clearQr();$('#verification-area').hidden=true;session=await pairingFactory({role:mode,payload});if(token!==epoch){session.close();return;}await showPayload(session.payload);void attach(session,token).catch(error=>{if(token===epoch)status(error.message,true);});}
  async function acceptPayload(payload){if(!role)throw new Error('Choose Send or Receive first.');if(role==='receive'){if(payload.role!=='offer')throw new Error('Scan the sender pairing QR.');await newSession('answer',payload);status('Reply QR ready. Let the sender scan it.');}else{if(!session)throw new Error('Create a sender pairing code first.');await session.applyAnswer(payload);status('Reply accepted. Connecting locally.');}}
  async function chooseRole(next){if(role&&role!==next&&engine)throw new Error('End this session before changing roles.');role=next;$('#choose-send').disabled=true;$('#choose-receive').disabled=true;$('#pairing-workspace').hidden=false;$('#role-label').textContent=role==='send'?'Send from this device':'Receive on this device';$('#pairing-input').value='';$('#pairing-output').value='';$('#re-pair').hidden=true;if(role==='send'){status('Preparing your pairing QR.');await newSession('offer');status('Have the receiver scan your QR, then scan their reply.');}else{status('Scan the sender QR to prepare your reply.');$('#qr-area').hidden=true;}}
  $('#capability-note').textContent=caps.transfer?`Files stay between your devices. ${caps.streaming?'Streaming save available; ordinary downloads are limited to 64 MiB per file.':'Downloads limited to 64 MiB per file on this browser.'} Keep both apps open.`:'This browser needs a secure connection, WebRTC, and Web Workers. Try current Chrome or Edge.';
  if(!caps.transfer){$('#choose-send').disabled=true;$('#choose-receive').disabled=true;}
  if(!caps.camera)$('#scan-qr').disabled=true;
  action('#choose-send',()=>chooseRole('send'));action('#choose-receive',()=>chooseRole('receive'));
  action('#previous-frame',()=>{frameIndex=(frameIndex-1+frames.length)%frames.length;paint();});action('#next-frame',()=>{frameIndex=(frameIndex+1)%frames.length;paint();});
  action('#scan-qr',async()=>{stopScan?.();$('#scanner').hidden=false;const token=epoch;const stop=await scanPairing($('#camera'),payload=>{if(token===epoch)return acceptPayload(payload);},p=>status(`Scanned ${p.received} of ${p.total} QR frames.`),error=>status(error.message,true));if(token!==epoch){stop();return;}stopScan=stop;});
  action('#stop-scan',()=>{stopScan?.();stopScan=null;$('#scanner').hidden=true;});
  action('#use-pairing-text',async()=>{const payload=await createFrameCollector().add($('#pairing-input').value.trim());if(!payload)throw new Error('Paste the complete pairing JSON, not one QR frame.');await acceptPayload(payload);});
  action('#copy-pairing',async()=>{try{await navigator.clipboard.writeText($('#pairing-output').value);status('Pairing text copied. It expires after five minutes.');}catch{$('#pairing-output').focus();$('#pairing-output').select();status('Select and copy the pairing text manually.');}});
  on('#import-pairing','change',async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>131072)throw new Error('Pairing file too large.');$('#pairing-input').value=await file.text();const payload=await createFrameCollector().add($('#pairing-input').value);await acceptPayload(payload);}catch(error){status(error.message,true);}finally{event.target.value='';}});
  action('#verify-pairing',()=>{engine.confirmPairing();status(engine.ready?'Both devices confirmed. Ready for local transfer.':'Confirmed here. Waiting for confirmation on the other device.');});
  on('#select-files','change',event=>{chosen=Array.from(event.target.files);$('#selected-files').replaceChildren();for(let i=0;i<chosen.length;i++){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=true;check.value=String(i);const span=document.createElement('span');span.textContent=`${chosen[i].name} (${sizeLabel(chosen[i].size)})`;label.append(check,span);$('#selected-files').append(label);}});
  action('#offer-files',async()=>{const selected=Array.from($('#selected-files').querySelectorAll('input:checked'),el=>chosen[Number(el.value)]);await engine.offer(selected);});
  action('#accept-files',async()=>{
    const ids=Array.from($('#incoming-files').querySelectorAll('input:checked'),el=>el.value);if(!ids.length)throw new Error('Select at least one file or reject the transfer.');const entries=incoming.files.filter(e=>ids.includes(e.id));const sinks=new Map();const streaming=caps.streaming&&$('#stream-save').checked;
    try{const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&entries.reduce((n,e)=>n+e.size,0)>estimate.quota-(estimate.usage||0))throw new Error('Not enough browser storage for the selected files.');
      for(const entry of entries){let destination;if(streaming)destination=await showSaveFilePicker({suggestedName:entry.name});sinks.set(entry.id,await storageFactory(entry,{destination}));}
      resetProgress();entries.forEach(row);await engine.accept(ids,sinks);
    }catch(error){await Promise.allSettled(Array.from(sinks.values(),sink=>sink.abort()));throw error;}
  });
  action('#reject-files',()=>engine.reject());action('#cancel-transfer',()=>engine.cancel());
  action('#re-pair',()=>chooseRole(role));action('#resume-transfer',()=>engine.resume());
  action('#end-session',async()=>{epoch++;session?.close();await engine?.close();releaseDownloadResources();engine=null;session=null;role=null;stopScan?.();stopScan=null;clearQr();$('#choose-send').disabled=!caps.transfer;$('#choose-receive').disabled=!caps.transfer;$('#pairing-workspace').hidden=true;$('#file-workspace').hidden=true;$('#verification-area').hidden=true;$('#transfer-progress').hidden=true;$('#incoming-review').hidden=true;status('Session ended. Choose Send or Receive.');});
  const lifecycle=()=>{stopScan?.();stopScan=null;if(engine&&!engine.ready)status('Connection interrupted. Keep both pages open and re-pair.',true);};document.addEventListener('visibilitychange',lifecycle);
  return ()=>{epoch++;session?.close();void engine?.close();releaseDownloadResources();stopScan?.();clearQr();cleanupEvents.forEach(remove=>remove());document.removeEventListener('visibilitychange',lifecycle);};
}
