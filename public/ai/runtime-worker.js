import {MLCEngine} from '../vendor/webllm.js';
import {Tokenizer} from '../vendor/tokenizers.js';
import {createModelTransport} from './transport.js';
import {checkAiCapabilities} from './capabilities.js';
import {responseFormat} from './schema.js';
let engine=null,tokenizer=null,manifest=null,busy=false;
const nativeFetch=globalThis.fetch.bind(globalThis),nativeOpen=caches.open.bind(caches);
async function load(offline,progress) {
 await engine?.unload();engine=null;tokenizer=null;
 manifest||=await(await nativeFetch(new URL('./model.json',import.meta.url))).json();
 const caps=await checkAiCapabilities(navigator,{secureContext:globalThis.isSecureContext,model:manifest});if(!caps.supported)throw new Error(caps.reason);
 const transport=createModelTransport({manifest,offline,fetcher:nativeFetch,onProgress:progress,cacheLookup:async url=>(await nativeOpen(transport.specs.get(url).scope)).match(url),cacheStore:async(url,response)=>(await nativeOpen(transport.specs.get(url).scope)).put(url,response)});
 await transport.prepareArtifacts();
 // Cache.add bypasses JavaScript fetch in this pinned runtime. Refuse it after
 // explicit preparation, so a missing entry cannot cause an unnoticed fetch.
 caches.open=async scope=>{const cache=await nativeOpen(scope);if(!['webllm/model','webllm/config','webllm/wasm'].includes(scope))return cache;
  return new Proxy(cache,{get(target,key){if(key==='add'||key==='addAll')return async()=>{throw new Error('Prepared model cache is incomplete. Prepare local AI again.');};const value=target[key];return typeof value==='function'?value.bind(target):value;}});};
 globalThis.fetch=transport.fetch;
 const model={model_id:manifest.modelId,model:manifest.modelBase,model_lib:manifest.library.url,required_features:['shader-f16'],overrides:{context_window_size:4096}};
 engine=new MLCEngine({appConfig:{model_list:[model],cacheBackend:'cache'},initProgressCallback:p=>progress({stage:p.text,progress:p.progress}),logLevel:'ERROR'});
 await engine.reload(manifest.modelId,{context_window_size:4096});
 tokenizer=new Tokenizer(await(await transport.fetch(manifest.modelBase+'tokenizer.json')).json(),await(await transport.fetch(manifest.modelBase+'tokenizer_config.json')).json());
 const response=await engine.chat.completions.create({messages:[{role:'user',content:'Reply with the JSON object {"ok":true} only.'}],temperature:0,max_tokens:32,response_format:responseFormat('warmup')});
 if(JSON.parse(response.choices[0].message.content).ok!==true)throw new Error('Model warmup did not produce the expected JSON.');await engine.resetChat();
 return {ready:true,offlineVerified:offline,modelId:manifest.modelId,bytes:manifest.totalBytes,capabilities:caps};
}
self.onmessage=async({data})=>{
 if(data?.v!==1||busy)return;busy=true;const reply=(value)=>self.postMessage({v:1,id:data.id,revision:data.revision,...value});
 try {
  let result;
  if(data.type==='prepare'||data.type==='verifyOffline')result=await load(data.type==='verifyOffline',progress=>reply({type:'progress',progress}));
  else if(data.type==='generate'){
   if(!engine||!tokenizer)throw new Error('Prepare or load local AI first.');
   const {buildPrompt}=await import('./prompts.js');const prompt=buildPrompt(data.payload,tokenizer);
   await engine.resetChat();const response=await engine.chat.completions.create({messages:prompt.messages,temperature:0,max_tokens:512,response_format:responseFormat(data.payload.kind,data.payload.entry?.id),seed:0});
   if(response.usage?.prompt_tokens!==prompt.promptTokens)throw new Error(`Tokenizer/runtime token counts differ (${prompt.promptTokens}/${response.usage?.prompt_tokens}).`);
   result={raw:response.choices[0].message.content,truncated:prompt.truncated,usage:response.usage};await engine.resetChat();
  }else if(data.type==='unload'){await engine?.unload();engine=null;tokenizer=null;result={unloaded:true};}
  else throw new Error('Unknown local AI request.');
  reply({result});
 }catch(error){reply({error:error.message});}finally{busy=false;}
};
