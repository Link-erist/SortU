import test from 'node:test';import assert from 'node:assert/strict';
const load=()=>import('../public/transfer/protocol.js');
const file=()=>({id:crypto.randomUUID(),name:'photo.jpg',path:'trip/photo.jpg',size:0});
test('manifest accepts empty files and rejects dangerous paths and repeated identities',async()=>{
 const {validateManifest}=await load();const f=file();const m={transferId:crypto.randomUUID(),files:[f]};
 assert.deepEqual(validateManifest(m),m);
 for(const path of ['../secret','C:/secret','/secret','folder/../secret','folder\\secret','a\u0000b'])assert.throws(()=>validateManifest({...m,files:[{...f,path}]}));
 assert.throws(()=>validateManifest({...m,files:[f,f]}));assert.throws(()=>validateManifest({...m,files:[{...f,size:-1}]}));
 assert.throws(()=>validateManifest({...m,files:Array.from({length:101},file)}));
});
test('binary chunk framing preserves exact bytes and rejects truncation or invalid offsets',async()=>{
 const {encodeChunk,decodeChunk}=await load();const meta={transferId:crypto.randomUUID(),fileId:crypto.randomUUID(),offset:17};const bytes=new Uint8Array([0,255,10]);
 const decoded=decodeChunk(encodeChunk(meta,bytes));assert.equal(decoded.offset,17);assert.equal(decoded.fileId,meta.fileId);assert.deepEqual(decoded.bytes,bytes);
 assert.throws(()=>decodeChunk(new ArrayBuffer(3)));assert.throws(()=>encodeChunk({...meta,offset:-1},bytes));
});
test('control messages reject unknown versions, oversized messages and impossible acknowledgments',async()=>{
 const {parseControl}=await load();const id=crypto.randomUUID();
 assert.throws(()=>parseControl(JSON.stringify({v:2,type:'ack',transferId:id,fileId:id,offset:0})));
 assert.throws(()=>parseControl(JSON.stringify({v:1,type:'ack',transferId:id,fileId:id,offset:-1})));
 assert.throws(()=>parseControl(' '.repeat(131073)));
 assert.throws(()=>parseControl(JSON.stringify({v:1,type:'execute'})));
 assert.equal(parseControl(JSON.stringify({v:1,type:'ack',transferId:id,fileId:id,offset:2})).offset,2);
});
