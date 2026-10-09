// Transcribe workspace: prepare the Whisper model once, then transcribe selected audio/video files locally.
// Recordings are only read. Transcripts are new files the user downloads.
import {checkAiCapabilities} from '../ai/capabilities.js';
import {filesFromDirectory,filesFromInput,isModelPrepared,saveModelFolder} from '../ai/model-folder.js';
import {createArchiveCore} from '../organizer/archive-core.js';
import {acquireExportLock} from '../transfer/resources.js';
import {decodeAudio} from './audio.js';
import {FORMATS,WRITERS,outputNames} from './core.js';
import {createTranscribeRuntime} from './runtime.js';
const MEDIA=/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba|webm|mp4|m4v|mov)$/i;
// Two recordings can share a name stem (talk.mp3, talk.wav); later outputs get a number instead of overwriting.
export function uniqueNames(names) {
 const used=new Set();
 return names.map(name=>{let candidate=name,count=2;const dot=name.lastIndexOf('.');while(used.has(candidate.toLowerCase()))candidate=`${name.slice(0,dot)} (${count++})${name.slice(dot)}`;used.add(candidate.toLowerCase());return candidate;});
}
export function zipTexts(files) {
 const chunks=[],archive=createArchiveCore({onChunk:chunk=>chunks.push(chunk)}),encoder=new TextEncoder();
 for(const file of files){const bytes=encoder.encode(file.text);archive.addEntry({path:file.name,size:bytes.length});for(let at=0;at<bytes.length;at+=32768)archive.write(bytes.subarray(at,at+32768));archive.endEntry();}
 archive.finish();return new Blob(chunks,{type:'application/zip'});
}
export function mountTranscribe(root) {
 const $=selector=>root.querySelector(selector),removers=[],urls=[];let manifest,files=[],results=[],active=null,disposed=false;
 const listen=(selector,event,fn)=>{const element=$(selector);element.addEventListener(event,fn);removers.push(()=>element.removeEventListener(event,fn));};
 const status=(message,error=false)=>{if(disposed)return;$('#transcribe-status').textContent=message;$('#transcribe-status').dataset.state=error?'error':'ready';};
 const loadManifest=async()=>manifest||=await(await fetch(new URL('./model.json',import.meta.url))).json();
 function buttons() {
  const busy=!!active,ready=root.dataset.transcribeState==='ready';
  for(const element of root.querySelectorAll('[data-transcribe-setting]'))element.disabled=busy;
  $('#start-transcribe').disabled=busy||!ready||!files.length;$('#cancel-transcribe').hidden=!busy;$('#download-transcripts').disabled=busy||!results.length;
 }
 function setState(state,message) {
  if(disposed)return;root.dataset.transcribeState=state;$('#transcribe-setup-message').textContent=message;
  $('#prepare-transcribe').hidden=$('#load-transcribe-folder').hidden=state!=='setup';$('#save-transcribe-folder').hidden=state!=='ready';buttons();
 }
 async function refreshState() {
  const caps=await checkAiCapabilities(navigator,{secureContext:window.isSecureContext,model:await loadManifest()});
  if(!caps.supported){setState('unsupported',`Transcription cannot run on this device: ${caps.reason} It is tested on Chrome and Edge on computers.`);return;}
  if(await isModelPrepared(manifest))setState('ready','Transcription is ready and works offline.');
  else setState('setup','Set up transcription: download the Whisper Small model once (about 440 MB), or load it from a saved model folder. Recordings are never uploaded.');
 }
 // One job at a time, sharing the organizer's lock so two models never load on the GPU together.
 async function run(task) {
  if(active)return;active=new AbortController();buttons();let release;
  try{status('Waiting for other AI work to finish');release=await acquireExportLock('organizer-ai',active.signal);await task(active.signal);}
  catch(error){status(active?.signal.aborted?'Canceled. Recordings were not changed.':error.message,!active?.signal.aborted);}
  finally{release?.();active=null;buttons();}
 }
 const progress=p=>status(p.bytes!==undefined?`${p.stage}: ${(p.bytes/1e6).toFixed(1)} MB / ${(p.total/1e6).toFixed(1)} MB`:p.total?`${p.stage} (${p.completed}/${p.total})`:p.stage);
 const prepare=folderFiles=>run(async signal=>{
  const runtime=createTranscribeRuntime({signal,onProgress:progress});
  try{const result=await runtime.prepare(folderFiles?{files:folderFiles}:{});status(`${folderFiles?'Loaded':'Prepared'} ${result.modelId}.`);await refreshState();}
  finally{try{await runtime.unload();}catch{}runtime.dispose();}
 });
 function showFiles() {
  $('#transcribe-file-list').replaceChildren(...files.map(file=>{const item=document.createElement('li');item.textContent=`${file.name} · ${(file.size/1e6).toFixed(1)} MB`;return item;}));
  $('#transcribe-count').textContent=files.length?`${files.length} recording${files.length===1?'':'s'} selected.`:'Choose audio or video files.';buttons();
 }
 function showResults() {
  for(const url of urls.splice(0))URL.revokeObjectURL(url);
  $('#transcribe-results').replaceChildren(...results.map(result=>{
   const item=document.createElement('article'),title=document.createElement('h3'),preview=document.createElement('pre'),links=document.createElement('p');item.className='transcript';
   title.textContent=result.source;preview.textContent=result.preview;
   for(const output of result.outputs){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([output.text],{type:'text/plain;charset=utf-8'}));urls.push(url);link.href=url;link.download=output.name;link.textContent=`Download ${output.name}`;links.append(link,' ');}
   item.append(title,preview,links);return item;}));
  $('#transcribe-results-area').hidden=!results.length;buttons();
 }
 const transcribe=()=>run(async signal=>{
  const formats=[...root.querySelectorAll('input[name="transcript-format"]:checked')].map(box=>box.value),language=$('#transcribe-language').value||undefined;
  outputNames('check.wav',formats);results=[];showResults();
  const runtime=createTranscribeRuntime({signal,onProgress:progress});
  try {
   status('Starting the transcription model');await runtime.verifyOffline();
   for(const [index,file] of files.entries()) {
    status(`Decoding ${file.name} (${index+1}/${files.length})`);const decoded=await decodeAudio(file,{signal});
    const transcript=await runtime.generate({audio:decoded.audio,language,revision:`file-${index}`});
    const names=outputNames(file.name,formats);
    results.push({source:file.name,preview:WRITERS.txt(transcript.chunks,{duration:decoded.duration}).slice(0,600),outputs:formats.map((format,i)=>({name:names[i],text:WRITERS[format](transcript.chunks,{duration:decoded.duration})}))});
    showResults();
   }
   const used=uniqueNames(results.flatMap(result=>result.outputs.map(output=>output.name)));let at=0;for(const result of results)for(const output of result.outputs)output.name=used[at++];showResults();
   status(`Transcribed ${results.length} recording${results.length===1?'':'s'}. Review and download the transcripts below.`);
  }finally{try{await runtime.unload();}catch{}runtime.dispose();}
 });
 listen('#transcribe-files','change',event=>{const chosen=[...event.target.files],skipped=chosen.filter(file=>!MEDIA.test(file.name));files=chosen.filter(file=>MEDIA.test(file.name));results=[];showResults();showFiles();if(skipped.length)status(`Skipped ${skipped.length} file(s) that are not audio or video.`);});
 listen('#prepare-transcribe','click',()=>void prepare());
 listen('#load-transcribe-folder','click',async()=>{if(window.showDirectoryPicker){let folder;try{folder=await window.showDirectoryPicker({id:'ai-organizer-transcribe-model'});}catch{return;}status('Reading the model folder');void prepare(await filesFromDirectory(folder));}else $('#load-transcribe-folder-input').click();});
 listen('#load-transcribe-folder-input','change',event=>{if(event.target.files?.length)void prepare(filesFromInput(event.target.files));event.target.value='';});
 listen('#save-transcribe-folder','click',async()=>{if(!window.showDirectoryPicker){status('This browser cannot write folders. Use Chrome or Edge to save the model.',true);return;}let folder;try{folder=await window.showDirectoryPicker({id:'ai-organizer-transcribe-model',mode:'readwrite'});}catch{return;}
  void run(async signal=>{const result=await saveModelFolder(folder,{manifest:await loadManifest(),signal,onProgress:p=>status(`${p.stage} (${p.completed+1}/${p.total})`)});status(`Saved the transcription model to "${folder.name}" (${(result.bytes/1e6).toFixed(0)} MB).`);});});
 listen('#start-transcribe','click',()=>void transcribe());
 listen('#cancel-transcribe','click',()=>active?.abort());
 listen('#download-transcripts','click',()=>{const url=URL.createObjectURL(zipTexts(results.flatMap(result=>result.outputs)));const link=document.createElement('a');link.href=url;link.download='transcripts.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
 $('#transcribe-formats').replaceChildren(...Object.entries(FORMATS).map(([value,label])=>{const wrapper=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.name='transcript-format';box.value=value;box.checked=value==='srt';box.dataset.transcribeSetting='';wrapper.append(box,` ${label}`);return wrapper;}));
 root.dataset.transcribeState='checking';showFiles();void refreshState().catch(error=>setState('unsupported',`Transcription check failed: ${error.message}`));
 return ()=>{disposed=true;active?.abort();removers.forEach(remove=>remove());for(const url of urls)URL.revokeObjectURL(url);};
}
