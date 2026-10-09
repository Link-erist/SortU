import test from 'node:test';import assert from 'node:assert/strict';
import {prepareSink} from '../public/transfer/storage.js';
import {hashPrefix} from '../public/transfer/hash.js';

class Channel extends EventTarget {readyState='open';bufferedAmount=0;maxMessageSize=65536;send(value){this.sent.push(value);queueMicrotask(()=>this.other.dispatchEvent(new MessageEvent('message',{data:value})));}sent=[];close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
function pair(){const a=new Channel(),b=new Channel();a.other=b;b.other=a;return[a,b];}
const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Timed out waiting for transfer');};
test('engine sends no bytes before consent and verifies the exact received bytes',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true,onEvent:e=>events.push(e)});
 const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});
 await wait(()=>sender.ready&&receiver.ready);
 const source=new File(['abc'], 'demo.txt');const manifest=await sender.offer([source]);await wait(()=>events.some(e=>e.type==='manifest'));
 assert.equal(a.sent.some(v=>v instanceof ArrayBuffer),false);
 const sink=await prepareSink(manifest.files[0],{mode:'memory'});
 await receiver.accept([manifest.files[0].id],new Map([[manifest.files[0].id,sink]]));
 await wait(()=>events.some(e=>e.type==='verified'));
 assert.equal(await (await sink.getBlob()).text(),'abc');
 const chunks=a.sent.filter(v=>v instanceof ArrayBuffer);assert.equal(chunks.length,1);
 sender.close();await receiver.close();
});
test('engine rejects a changed source on same-page resume',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true,onEvent:e=>events.push(e)});
 const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});await wait(()=>sender.ready&&receiver.ready);
 const manifest=await sender.offer([new File(['abc'],'demo.txt')]);await wait(()=>events.some(e=>e.type==='manifest'));
 b.send(JSON.stringify({v:1,type:'resume',transferId:manifest.transferId,fileId:manifest.files[0].id,offset:3,digest:await hashPrefix(new Blob(['xyz']),3)}));
 await wait(()=>events.some(e=>e.type==='error'));
 assert.equal(a.sent.some(v=>v instanceof ArrayBuffer),false);
 sender.close();await receiver.close();
});
test('engine does not accept unknown file IDs',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();let error;
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true,onEvent:e=>{if(e.type==='error')error=e;}});
 const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true});await wait(()=>sender.ready&&receiver.ready);
 const manifest=await sender.offer([new File(['a'],'one.txt')]);
 b.send(JSON.stringify({v:1,type:'accept',transferId:manifest.transferId,fileIds:[crypto.randomUUID()]}));await wait(()=>error);
 assert.equal(a.sent.some(v=>v instanceof ArrayBuffer),false);sender.close();await receiver.close();
});

test('cancel leaves the verified connection usable for a new transfer',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true});
 const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});await wait(()=>sender.ready&&receiver.ready);
 await sender.offer([new File(['a'],'first.txt')]);await wait(()=>events.some(e=>e.type==='manifest'));await sender.cancel();await wait(()=>events.some(e=>e.type==='canceled'));
 await sender.offer([new File(['b'],'second.txt')]);await wait(()=>events.filter(e=>e.type==='manifest').length===2);
 sender.close();await receiver.close();
});

test('same-page resume verifies retained prefix and completes after re-pairing',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');let [a,b]=pair();const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true,onEvent:e=>events.push(e)});
 const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});await wait(()=>sender.ready&&receiver.ready);
 const bytes=new Uint8Array(100000).fill(7);const manifest=await sender.offer([new File([bytes],'resume.bin')]);await wait(()=>events.some(e=>e.type==='manifest'));
 const sink=await prepareSink(manifest.files[0],{mode:'memory'});const original=sink.write.bind(sink);let cut=false;
 sink.write=async(...args)=>{await original(...args);if(!cut){cut=true;a.close();b.close();}};
 await receiver.accept([manifest.files[0].id],new Map([[manifest.files[0].id,sink]]));await wait(()=>events.some(e=>e.type==='paused'));
 assert.ok(sink.confirmedOffset>0&&sink.confirmedOffset<bytes.length);
 [a,b]=pair();sender.reconnect(a,true);receiver.reconnect(b,true);await wait(()=>sender.ready&&receiver.ready);await receiver.resume();
 await wait(()=>events.some(e=>e.type==='verified'));
 assert.equal(await hashPrefix(await sink.getBlob()),await hashPrefix(new Blob([bytes])));
 sender.close();await receiver.close();
});
