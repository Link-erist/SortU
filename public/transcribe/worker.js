// Transcription worker: runs Whisper Small locally with transformers.js on WebGPU.
// Same message protocol as ../ai/runtime-worker.js, so ../ai/runtime.js handles cancel, timeouts and stale replies.
// All model bytes come through the pinned, hash-verifying transport; nothing else may be fetched.
import {pipeline,env} from '../vendor/transformers.js';
import {createModelTransport} from '../ai/transport.js';
import {checkAiCapabilities} from '../ai/capabilities.js';
import {checkFolderMarker,folderFetcher} from '../ai/model-folder.js';
import {CHUNK_SECONDS,SAMPLE_RATE,STRIDE_SECONDS,chunkCount} from './core.js';
const nativeFetch=globalThis.fetch.bind(globalThis),nativeOpen=caches.open.bind(caches);
let transcriber=null,manifest=null,busy=false;
async function load(offline,progress,files) {
 transcriber=null;
 manifest||=await(await nativeFetch(new URL('./model.json',import.meta.url))).json();
 const caps=await checkAiCapabilities(navigator,{secureContext:globalThis.isSecureContext,model:manifest});if(!caps.supported)throw new Error(caps.reason);
 if(files)await checkFolderMarker(files,manifest);
 const transport=createModelTransport({manifest,offline,fetcher:files?folderFetcher(manifest,files):nativeFetch,transferStage:files?'Loading transcription model from folder':'Downloading transcription model',onProgress:progress,
  cacheLookup:async url=>(await nativeOpen(transport.specs.get(url).scope)).match(url),cacheStore:async(url,response)=>(await nativeOpen(transport.specs.get(url).scope)).put(url,response)});
 const preparation=await transport.prepareArtifacts();
 // transformers.js asks for some optional files that are not pinned; answer those with 404 instead of using the network.
 const pinnedFetch=async input=>{const url=typeof input==='string'?input:input.url;return transport.specs.has(url)?transport.fetch(url):new Response(null,{status:404});};
 env.allowLocalModels=false;env.allowRemoteModels=true;env.useBrowserCache=false;env.fetch=pinnedFetch;globalThis.fetch=pinnedFetch;
 // The library does not apply the revision option to every file, so the pinned revision is written into the URL template.
 env.remotePathTemplate=`{model}/resolve/${manifest.modelRevision}/`;
 // Never let onnxruntime load its engine from a CDN: local loader, verified engine bytes.
 env.backends.onnx.wasm.wasmPaths={mjs:new URL('../vendor/ort/ort-wasm-simd-threaded.asyncify.js',import.meta.url).href};
 env.backends.onnx.wasm.wasmBinary=await(await transport.fetch(manifest.library.url)).arrayBuffer();
 progress({stage:'Starting transcription model'});
 transcriber=await pipeline('automatic-speech-recognition',manifest.modelId,{device:'webgpu',dtype:manifest.dtype,revision:manifest.modelRevision});
 await transcriber(new Float32Array(SAMPLE_RATE),{return_timestamps:true});
 return {ready:true,offlineVerified:offline,modelId:manifest.modelId,bytes:manifest.totalBytes,downloadedBytes:preparation.bytes,capabilities:caps};
}
async function transcribe({audio,language},progress) {
 if(!transcriber)throw new Error('Prepare transcription first.');
 if(!(audio instanceof Float32Array)||!audio.length)throw new Error('No audio to transcribe.');
 const total=chunkCount(audio.length);let done=0,last=0;
 // The streamer is called for every generated token; it reports progress and keeps the runtime's timeout alive.
 const streamer={put(){const now=Date.now();if(now-last>2000){last=now;progress({stage:'Transcribing',completed:done,total});}},end(){done++;last=Date.now();progress({stage:'Transcribing',completed:done,total});}};
 const result=await transcriber(audio,{return_timestamps:true,chunk_length_s:CHUNK_SECONDS,stride_length_s:STRIDE_SECONDS,task:'transcribe',...(language?{language}:{}),streamer});
 return {text:result.text,chunks:(result.chunks||[]).map(chunk=>({start:chunk.timestamp[0],end:chunk.timestamp[1],text:chunk.text}))};
}
self.onmessage=async({data})=>{
 if(data?.v!==1||busy)return;busy=true;const reply=value=>self.postMessage({v:1,id:data.id,revision:data.revision,...value});
 try {
  let result;const progress=value=>reply({type:'progress',progress:value});
  if(data.type==='prepare'||data.type==='verifyOffline')result=await load(data.type==='verifyOffline',progress,data.type==='prepare'?data.payload?.files:undefined);
  else if(data.type==='generate')result=await transcribe(data.payload,progress);
  else if(data.type==='unload'){await transcriber?.dispose?.();transcriber=null;result={unloaded:true};}
  else throw new Error('Unknown transcription request.');
  reply({result});
 }catch(error){reply({error:error.message});}finally{busy=false;}
};
