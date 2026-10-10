import {MLCEngine} from '../vendor/webllm.js';
import {Tokenizer} from '../vendor/tokenizers.js';
import {createModelTransport} from './transport.js';
import {checkAiCapabilities} from './capabilities.js';
import {responseFormat} from './schema.js';
import {checkFolderMarker,folderFetcher} from './model-folder.js';
import {completeWithRecovery} from './recover.js';
let engine=null,tokenizer=null,manifest=null,busy=false;
const nativeFetch=globalThis.fetch.bind(globalThis),nativeOpen=caches.open.bind(caches);
async function load(offline,progress,files) {
 try{await engine?.unload();}catch{/* A lost GPU device leaves an engine that cannot unload. */}engine=null;tokenizer=null;
 manifest||=await(await nativeFetch(new URL('./model.json',import.meta.url))).json();
 const caps=await checkAiCapabilities(navigator,{secureContext:globalThis.isSecureContext,model:manifest});if(!caps.supported)throw new Error(caps.reason);
 // A saved model folder replaces the network as the byte source; verification is unchanged.
 if(files)await checkFolderMarker(files,manifest);
 const transport=createModelTransport({manifest,offline,fetcher:files?folderFetcher(manifest,files):nativeFetch,transferStage:files?'Loading model from folder':'Downloading model',onProgress:progress,cacheLookup:async url=>(await nativeOpen(transport.specs.get(url).scope)).match(url),cacheStore:async(url,response)=>(await nativeOpen(transport.specs.get(url).scope)).put(url,response)});
 const preparation=await transport.prepareArtifacts();
 // Cache.add bypasses JavaScript fetch in this pinned runtime. Refuse it after
 // explicit preparation, so a missing entry cannot cause an unnoticed fetch.
 caches.open=async scope=>{const cache=await nativeOpen(scope);if(!['webllm/model','webllm/config','webllm/wasm'].includes(scope))return cache;
  return new Proxy(cache,{get(target,key){if(key==='add'||key==='addAll')return async()=>{throw new Error('Prepared model cache is incomplete. Prepare local AI again.');};const value=target[key];return typeof value==='function'?value.bind(target):value;}});};
 globalThis.fetch=transport.fetch;
 const model={model_id:manifest.modelId,model:manifest.modelBase,model_lib:manifest.library.url,required_features:['shader-f16'],overrides:{context_window_size:4096}};
 engine=new MLCEngine({appConfig:{model_list:[model],cacheBackend:'cache'},initProgressCallback:p=>progress({stage:p.text,progress:p.progress}),logLevel:'ERROR'});
 await engine.reload(manifest.modelId,{context_window_size:4096});
 tokenizer=new Tokenizer(await(await transport.fetch(manifest.modelBase+'tokenizer.json')).json(),await(await transport.fetch(manifest.modelBase+'tokenizer_config.json')).json());
 const response=await complete({messages:[{role:'user',content:'Reply with the JSON object {"ok":true} only.'}],temperature:0,max_tokens:32,response_format:responseFormat('warmup')});
 if(JSON.parse(response.choices[0].message.content).ok!==true)throw new Error('Model warmup did not produce the expected JSON.');await engine.resetChat();
 return {ready:true,offlineVerified:offline,modelId:manifest.modelId,bytes:manifest.totalBytes,downloadedBytes:preparation.bytes,capabilities:caps};
}
// After a lost GPU device, wait briefly so the graphics chip can recover, then start a fresh engine.
const restart=async()=>{await new Promise(resolve=>setTimeout(resolve,2000));await load(true,()=>{});};
const complete=request=>completeWithRecovery(()=>engine,restart,request);
// A request after a failed restart loads the model again instead of failing straight away.
const ensureEngine=async()=>{if(engine&&tokenizer)return;if(!manifest)throw new Error('Prepare or load local AI first.');await restart();};
self.onmessage=async({data})=>{
 if(data?.v!==1||busy)return;busy=true;const reply=(value)=>self.postMessage({v:1,id:data.id,revision:data.revision,...value});
 try {
  let result;
  if(data.type==='prepare'||data.type==='verifyOffline')result=await load(data.type==='verifyOffline',progress=>reply({type:'progress',progress}),data.type==='prepare'?data.payload?.files:undefined);
  else if(data.type==='generate'&&data.payload?.kind==='assistant'){
   await ensureEngine();
   // The master prompt and schema are built here from the assistant core; the page only sends data and the request.
   const core=await import('../assistant/core.js'),{renderPrompt}=await import('./prompts.js');
   const aliases=Array.isArray(data.payload.aliases)?data.payload.aliases.filter(alias=>/^f\d{1,3}$/.test(alias)):[];
   const context={text:String(data.payload.contextText||'').slice(0,20000),aliases:new Map(aliases.map(alias=>[alias,alias]))},messages=core.buildMessages(context,String(data.payload.request||'').slice(0,core.MAX_MESSAGE));
   const promptTokens=renderPrompt(messages).reduce((sum,part)=>sum+tokenizer.encode(part).ids.length,0);if(promptTokens>3456)throw new Error('This proposal is too large for the assistant. Ask about one folder at a time.');
   const response=await complete({messages,temperature:0,max_tokens:256,response_format:core.responseFormat(context),seed:0});
   result={raw:response.choices[0].message.content,usage:response.usage};await engine.resetChat();
  }
  else if(data.type==='generate'){
   await ensureEngine();
   const {buildPrompt}=await import('./prompts.js');const prompt=buildPrompt(data.payload,tokenizer);
   const response=await complete({messages:prompt.messages,temperature:0,max_tokens:512,response_format:responseFormat(data.payload.kind,data.payload.kind==='merge'?data.payload.groups.map(group=>group.id):data.payload.entry?.id),seed:0});
   if(response.usage?.prompt_tokens!==prompt.promptTokens)throw new Error(`Tokenizer/runtime token counts differ (${prompt.promptTokens}/${response.usage?.prompt_tokens}).`);
   result={raw:response.choices[0].message.content,truncated:prompt.truncated,usage:response.usage};await engine.resetChat();
  }else if(data.type==='unload'){await engine?.unload();engine=null;tokenizer=null;result={unloaded:true};}
  else throw new Error('Unknown local AI request.');
  reply({result});
 }catch(error){reply({error:error.message});}finally{busy=false;}
};
