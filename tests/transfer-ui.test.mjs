import test from 'node:test';import assert from 'node:assert/strict';
test('UI describes export requests honestly and detects capabilities individually',async()=>{
 const {describeCompletion,detectCapabilities}=await import('../public/transfer/ui.js');
 assert.match(describeCompletion('export-requested'),/requested|check/i);assert.doesNotMatch(describeCompletion('export-requested'),/^Saved/);
 assert.match(describeCompletion('verified'),/verif/i);assert.match(describeCompletion('saved'),/saved/i);
 const basic=detectCapabilities({isSecureContext:true,RTCPeerConnection:()=>{},Worker:()=>{},crypto:{subtle:{}},navigator:{}});
 assert.equal(basic.transfer,true);assert.equal(basic.camera,false);assert.equal(basic.streaming,false);assert.equal(basic.fileLimit,67108864);
 assert.equal(detectCapabilities({isSecureContext:false}).transfer,false);
 assert.equal(detectCapabilities({isSecureContext:true,RTCPeerConnection:()=>{},Worker:()=>{},navigator:{}}).transfer,false);
});
