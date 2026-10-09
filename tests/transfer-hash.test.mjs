import test from 'node:test';import assert from 'node:assert/strict';
test('incremental hash handles independent chunks and known vectors',async()=>{
 const {createHasher,hashPrefix}=await import('../public/transfer/hash.js');
 const h=createHasher();await h.update(new TextEncoder().encode('a'));await h.update(new TextEncoder().encode('bc'));
 assert.equal(await h.digest(),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');h.dispose();
 assert.equal(await hashPrefix(new Blob(['abcXYZ']),3),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 const empty=createHasher();assert.equal(await empty.digest(),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');empty.dispose();
 await assert.rejects(()=>h.update(new Uint8Array([1])),/disposed|closed/);
});
