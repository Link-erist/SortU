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
test('runtime-required GPU limits are checked before model download',async()=>{
 const {checkAiCapabilities}=await import('../public/ai/capabilities.js');const adapter={features:new Set(['shader-f16']),limits:{maxComputeWorkgroupStorageSize:16384,maxStorageBuffersPerShaderStage:8}};const caps=await checkAiCapabilities({gpu:{requestAdapter:async()=>adapter}},{secureContext:true});assert.equal(caps.supported,false);assert.match(caps.reason,/limit|storage/i);
});
test('blocked downloads and storage quota errors fail preparation without claiming readiness',async()=>{
 const {createModelTransport}=await import('../public/ai/transport.js');const manifest={modelBase:'https://example.test/pinned/',library:{url:'https://example.test/library.wasm',bytes:3},artifacts:[{path:'one.bin',bytes:3}],totalBytes:6};let stored=0;
 const blocked=createModelTransport({manifest,fetcher:async()=>{throw new TypeError('Failed to fetch');},cacheLookup:async()=>undefined,cacheStore:async()=>{stored++;}});await assert.rejects(()=>blocked.prepareArtifacts(),/Failed to fetch/);assert.equal(stored,0);
 const full=createModelTransport({manifest,fetcher:async()=>new Response('abc'),cacheLookup:async()=>undefined,cacheStore:async(url,response)=>{await response.arrayBuffer();throw new DOMException('Storage is full.','QuotaExceededError');}});await assert.rejects(()=>full.prepareArtifacts(),error=>error.name==='QuotaExceededError');
});
test('browser support: Chrome and Edge are supported, Firefox rejected, other browsers untested',async()=>{
 const {browserSupport}=await import('../public/ai/capabilities.js');const ua=userAgent=>({userAgent});
 const chrome='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
 assert.equal(browserSupport(ua(chrome)).level,'supported');assert.equal(browserSupport(ua(chrome)).name,'Chrome');
 assert.equal(browserSupport(ua(chrome+' Edg/155.0.0.0')).name,'Edge');assert.equal(browserSupport(ua(chrome+' Edg/155.0.0.0')).level,'supported');
 assert.equal(browserSupport(ua('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36')).level,'supported');
 assert.equal(browserSupport(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0')).level,'rejected');
 assert.equal(browserSupport(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15')).level,'rejected');
 assert.equal(browserSupport(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).level,'untested');
 assert.equal(browserSupport(ua(chrome+' OPR/120.0.0.0')).level,'untested');assert.equal(browserSupport(ua(chrome.replace('Chrome','SamsungBrowser/27.0 Chrome'))).level,'untested');
 assert.equal(browserSupport({userAgent:chrome,userAgentData:{brands:[{brand:'Brave',version:'155'},{brand:'Chromium',version:'155'}]}}).level,'untested');
});
test('GPU limits come from the model manifest; transcription does not inherit the organizer engine limits',async()=>{
 const {checkAiCapabilities}=await import('../public/ai/capabilities.js');const adapter={features:new Set(['shader-f16']),limits:{maxComputeWorkgroupStorageSize:16384,maxStorageBuffersPerShaderStage:8}};const nav={gpu:{requestAdapter:async()=>adapter}};
 assert.equal((await checkAiCapabilities(nav,{secureContext:true})).supported,false);
 assert.equal((await checkAiCapabilities(nav,{secureContext:true,model:{requiredFeatures:['shader-f16'],requiredLimits:{}}})).supported,true);
 assert.equal((await checkAiCapabilities({gpu:{requestAdapter:async()=>({features:new Set(),limits:{}})}},{secureContext:true,model:{requiredFeatures:['shader-f16'],requiredLimits:{}}})).supported,false);
});
