import {sha256} from '../vendor/sha256.js';
import {sha1} from '../vendor/ai-hashes.js';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export function createModelTransport({manifest,offline=false,onProgress=()=>{},signal,fetcher=globalThis.fetch.bind(globalThis),cacheLookup,cacheStore}={}) {
 const specs=new Map(manifest.artifacts.map(file=>[manifest.modelBase+file.path,{...file,scope:file.path==='mlc-chat-config.json'?'webllm/config':'webllm/model'}]));
 specs.set(manifest.library.url,{...manifest.library,scope:'webllm/wasm'});let transferred=0;
 const check=()=>{if(signal?.aborted)throw new Error('Model preparation canceled.');};
 async function cacheFor(url){return caches.open(specs.get(url).scope);}
 async function verify(response,spec,{network=false}={}) {
  check();if(!response?.ok)throw new Error('Model artifact response failed.');const hash=spec.sha256?sha256.create():spec.gitOid?sha1.create():null;
  if(hash&&!spec.sha256)hash.update(new TextEncoder().encode(`blob ${spec.bytes}\0`));let bytes=0;
  const reader=response.body.getReader();const stream=new ReadableStream({async pull(controller){try {check();const next=await reader.read();check();
   if(next.done){if(bytes!==spec.bytes)throw new Error('Model artifact size mismatch.');if(hash&&hex(hash.digest())!==(spec.sha256||spec.gitOid))throw new Error('Model artifact integrity mismatch.');controller.close();return;}
   bytes+=next.value.length;if(bytes>spec.bytes)throw new Error('Model artifact exceeds pinned size.');hash?.update(next.value);
   if(network){transferred+=next.value.length;onProgress({stage:'Downloading model',bytes:transferred,total:manifest.totalBytes});}controller.enqueue(next.value);
  }catch(error){hash?.destroy();await reader.cancel().catch(()=>{});controller.error(error);}},cancel(reason){hash?.destroy();return reader.cancel(reason);}});
  return new Response(stream,{status:200,headers:response.headers});
 }
 const lookup=cacheLookup|| (async url=>(await cacheFor(url)).match(url));
 const store=cacheStore|| (async(url,response)=>(await cacheFor(url)).put(url,response));
 async function fetchArtifact(input,options={}) {
  check();const url=typeof input==='string'?input:input.url;if((options.method||input.method||'GET')!=='GET')throw new Error('Only GET model requests are allowed.');
  const spec=specs.get(url);if(!spec)throw new Error('URL is not a pinned model artifact.');const cached=await lookup(url);
  if(cached)return verify(cached,spec);
  if(offline)throw new Error('Offline AI requires all prepared model cache entries.');
  return verify(await fetcher(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'}),spec,{network:true});
 }
 async function prepareArtifacts(){for(const [url,spec]of specs){check();onProgress({stage:offline?'Verifying prepared model':'Preparing model assets',file:spec.path||'model library',bytes:transferred,total:manifest.totalBytes});
   const present=await lookup(url),response=await fetchArtifact(url);try {if(present){const reader=response.body.getReader();while(!(await reader.read()).done)check();}else await store(url,response);}catch(error){if(typeof caches!=='undefined')await(await cacheFor(url)).delete(url);throw error;}
  }return {bytes:transferred};}
 return {fetch:fetchArtifact,prepareArtifacts,verifyCachedArtifacts:prepareArtifacts,dispose(){},specs};
}
