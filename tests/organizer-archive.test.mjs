import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readStoredZip} from './helpers/stored-zip.mjs';
test('streaming ZIP keeps binary, Unicode paths and empty files intact',async()=>{
 const {createArchive,estimateArchiveBytes}=await import('../public/organizer/archive.js');const chunks=[];const archive=createArchive({onChunk:bytes=>chunks.push(bytes)});const payload=new Uint8Array([0,255,10]);
 await archive.addEntry({path:'Images/café.bin',size:3});await archive.write(payload);const result=await archive.endEntry();assert.equal(result.digest,createHash('sha256').update(payload).digest('hex'));
 await archive.addEntry({path:'empty.txt',size:0});await archive.endEntry();await archive.finish();const bytes=Buffer.concat(chunks.map(c=>Buffer.from(c)));const entries=readStoredZip(bytes);
 assert.deepEqual(Array.from(entries['Images/café.bin']),[0,255,10]);assert.equal(entries['empty.txt'].length,0);assert.ok(estimateArchiveBytes([{targetPath:'Images/café.bin',size:3},{targetPath:'empty.txt',size:0}],0)>=bytes.length);
});
test('archive ceiling and cancellation prevent successful completion',async()=>{
 const {createArchive}=await import('../public/organizer/archive.js');const archive=createArchive({maxBytes:10,onChunk:()=>{}});await assert.rejects(()=>archive.addEntry({path:'x',size:0}),/limit/i);
 const canceled=createArchive({onChunk:()=>{}});canceled.cancel();await assert.rejects(()=>canceled.addEntry({path:'x',size:0}),/cancel|closed/i);
});
