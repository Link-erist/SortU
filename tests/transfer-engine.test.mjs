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

test('re-pairing preserves the verified save gate and continues after export',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');let [a,b]=pair();const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true});const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});await wait(()=>sender.ready&&receiver.ready);
 const manifest=await sender.offer([new File(['a'],'first.txt'),new File(['b'],'second.txt')]);await wait(()=>events.some(e=>e.type==='manifest'));
 const sinks=new Map();for(const entry of manifest.files){const sink=await prepareSink(entry,{mode:'memory'});sink.export=async()=>({state:'export-requested',name:entry.name});sinks.set(entry.id,sink);}
 await receiver.accept(manifest.files.map(f=>f.id),sinks);await wait(()=>events.some(e=>e.type==='verified'));
 a.close();b.close();[a,b]=pair();sender.reconnect(a,true);receiver.reconnect(b,true);await wait(()=>sender.ready&&receiver.ready);
 await assert.rejects(()=>receiver.resume(),/save.*verif/i);
 await receiver.exportFile(manifest.files[0].id);await wait(()=>events.filter(e=>e.type==='verified').length===2);
 assert.equal(await (await sinks.get(manifest.files[1].id).getBlob()).text(),'b');sender.close();await receiver.close();
});

test('inactivity pauses without discarding accepted receiver storage',async()=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();const events=[];let now=0;
 const originalClose=a.close.bind(a);a.close=()=>{originalClose();b.close();};
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true,clock:()=>{now+=10000;return now;},onEvent:e=>events.push(e)});
 const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});await wait(()=>sender.ready&&receiver.ready);
 const manifest=await sender.offer([new File(['a'],'one.txt')]);await wait(()=>events.some(e=>e.type==='manifest'));const sink=await prepareSink(manifest.files[0],{mode:'memory'});
 a.bufferedAmount=1048576;await receiver.accept([manifest.files[0].id],new Map([[manifest.files[0].id,sink]]));await wait(()=>events.some(e=>e.type==='paused'));
 assert.equal((await sink.getBlob()).size,0);assert.equal(events.some(e=>e.type==='error'),false);sender.close();await receiver.close();
});

test('sender respects negotiated chunk limits and a bounded unacknowledged window',async t=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();a.maxMessageSize=8192;const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true});const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});t.after(async()=>{sender.close();await receiver.close();});
 await wait(()=>sender.ready&&receiver.ready);const manifest=await sender.offer([new File([new Uint8Array(2*1048576)],'window.bin')]);await wait(()=>events.some(e=>e.type==='manifest'));
 const sink=await prepareSink(manifest.files[0],{mode:'memory'});let release;const gate=new Promise(resolve=>{release=resolve;});const original=sink.write.bind(sink);sink.write=async(...args)=>{await gate;return original(...args);};
 await receiver.accept([manifest.files[0].id],new Map([[manifest.files[0].id,sink]]));
 const bytes=()=>a.sent.filter(v=>v instanceof ArrayBuffer).reduce((n,v)=>n+v.byteLength-49,0);
 await wait(()=>bytes()>1048576-8192);await new Promise(resolve=>setTimeout(resolve,80));
 assert.ok(bytes()<=1048576);assert.ok(a.sent.filter(v=>v instanceof ArrayBuffer).every(v=>v.byteLength<=8192));
 await receiver.cancel();release();
});

test('receiver never acknowledges a failed storage write',async t=>{
 const {createTransferEngine}=await import('../public/transfer/engine.js');const [a,b]=pair();const events=[];
 const sender=createTransferEngine({role:'send',channel:a,pairingVerified:true});const receiver=createTransferEngine({role:'receive',channel:b,pairingVerified:true,onEvent:e=>events.push(e)});t.after(async()=>{sender.close();await receiver.close();});
 await wait(()=>sender.ready&&receiver.ready);const manifest=await sender.offer([new File(['a'],'quota.txt')]);await wait(()=>events.some(e=>e.type==='manifest'));
 const sink=await prepareSink(manifest.files[0],{mode:'custom',adapters:{writer:{write:async()=>{throw new Error('quota exhausted');},abort:async()=>{}}}});
 await receiver.accept([manifest.files[0].id],new Map([[manifest.files[0].id,sink]]));await wait(()=>events.some(e=>e.type==='error'));
 assert.equal(b.sent.filter(v=>typeof v==='string').some(v=>JSON.parse(v).type==='ack'),false);assert.equal(events.some(e=>e.type==='verified'),false);
});
