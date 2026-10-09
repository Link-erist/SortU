import test from 'node:test';import assert from 'node:assert/strict';
const entry=size=>({id:crypto.randomUUID(),name:'test.bin',path:'test.bin',size});
test('storage refuses above-limit memory transfers before allocating',async()=>{
 const {prepareSink}=await import('../public/transfer/storage.js');
 await assert.rejects(()=>prepareSink(entry(67108865),{mode:'memory'}),/64|limit/i);
 const sink=await prepareSink(entry(67108864),{mode:'memory'});assert.equal(sink.confirmedOffset,0);await sink.abort();
});
test('staged bytes verify before export and canceled writes are refused',async()=>{
 const {prepareSink}=await import('../public/transfer/storage.js');
 const sink=await prepareSink(entry(3),{mode:'memory'});
 await assert.rejects(()=>sink.export(),/verif/i);
 await sink.write(0,new TextEncoder().encode('abc'));
 await assert.rejects(()=>sink.write(0,new Uint8Array([1])),/offset/i);
 assert.equal(sink.confirmedOffset,3);
 await sink.finish('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(await (await sink.getBlob()).text(),'abc');
 await sink.abort();await assert.rejects(()=>sink.write(3,new Uint8Array([1])),/cancel|closed/i);
});
test('digest mismatch and failed storage write do not acknowledge or publish',async()=>{
 const {prepareSink}=await import('../public/transfer/storage.js');
 const sink=await prepareSink(entry(1),{mode:'memory'});await sink.write(0,new Uint8Array([1]));
 await assert.rejects(()=>sink.finish('0'.repeat(64)),/integrity/i);
 const failed=await prepareSink(entry(1),{mode:'custom',adapters:{writer:{write:async()=>{throw new Error('quota');},abort:async()=>{}}}});
 await assert.rejects(()=>failed.write(0,new Uint8Array([1])),/quota/);assert.equal(failed.confirmedOffset,0);
});
