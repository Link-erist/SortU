import test from 'node:test';import assert from 'node:assert/strict';
test('unsupported devices fail capability checks without requesting a device',async()=>{
 const {checkAiCapabilities}=await import('../public/ai/capabilities.js');assert.equal((await checkAiCapabilities({},{secureContext:true})).supported,false);
 let requests=0;const gpu={requestAdapter:async()=>({features:new Set(),limits:{},requestDevice(){requests++;}})};
 const result=await checkAiCapabilities({gpu},{secureContext:true});assert.equal(result.supported,false);assert.match(result.reason,/f16/);assert.equal(requests,0);
});
test('transport allows only pinned GET artifacts and forbids offline network fallback',async()=>{
 const {createModelTransport}=await import('../public/ai/transport.js');let calls=0;const manifest={modelBase:'https://example.test/pinned/',library:{url:'https://example.test/library.wasm'},artifacts:[{path:'tokenizer.json',bytes:3}],libraryBytes:2};
 const transport=createModelTransport({manifest,offline:true,fetcher:async()=>{calls++;return new Response('abc');},cacheLookup:async()=>undefined});
 await assert.rejects(()=>transport.fetch('https://example.test/pinned/tokenizer.json'),/prepared|offline|cache/i);assert.equal(calls,0);
 await assert.rejects(()=>transport.fetch('https://evil.test/'),/allow|artifact|pinned/i);
 await assert.rejects(()=>transport.fetch('https://example.test/pinned/tokenizer.json',{method:'POST'}),/GET/);
});
test('cancel terminates runtime worker, rejects pending requests and ignores stale replies',async()=>{
 const {createLocalRuntime}=await import('../public/ai/runtime.js');const controller=new AbortController();let terminated=0;
 const worker={postMessage(){},terminate(){terminated++;},onmessage:null,onerror:null};const runtime=createLocalRuntime({signal:controller.signal,workerFactory:()=>worker});
 const pending=runtime.prepare();controller.abort();await assert.rejects(()=>pending,/cancel/i);assert.equal(terminated,1);runtime.dispose();assert.equal(terminated,1);
});
test('cached size or hash corruption cannot pass offline verification',async()=>{
 const {createModelTransport}=await import('../public/ai/transport.js');const manifest={modelBase:'https://example.test/pinned/',library:{url:'https://example.test/library.wasm',bytes:0},artifacts:[{path:'one.bin',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}]};
 const transport=createModelTransport({manifest,offline:true,cacheLookup:async()=>new Response('bad')});const response=await transport.fetch(manifest.modelBase+'one.bin');await assert.rejects(()=>response.arrayBuffer(),/integrity/);
 const short=createModelTransport({manifest,offline:true,cacheLookup:async()=>new Response('ab')});await assert.rejects(async()=>{await(await short.fetch(manifest.modelBase+'one.bin')).arrayBuffer();},/size/);
});
