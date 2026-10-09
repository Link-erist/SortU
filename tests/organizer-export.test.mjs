import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createInventory} from '../public/organizer/inventory.js';import {defaultRules} from '../public/organizer/rules.js';import {createOrganizerSession} from '../public/organizer/proposal.js';import {readStoredZip} from './helpers/stored-zip.mjs';
const setup=(files,exclusions={})=>{const session=createOrganizerSession(),inventory=createInventory(files);session.setInputs({inventory,rules:defaultRules(),exclusions,guideResolved:true});session.generate();return {session,inventory,permit:session.approve()};};
class Directory {
 constructor(name='parent'){this.name=name;this.dirs=new Map();this.files=new Map();}
 async getDirectoryHandle(name,{create=false}={}){if(!this.dirs.has(name)){if(!create)throw Object.assign(new Error('missing'),{name:'NotFoundError'});this.dirs.set(name,new Directory(name));}return this.dirs.get(name);}
 async getFileHandle(name,{create=false}={}){if(!this.files.has(name)){if(!create)throw new Error('missing');let saved=new Blob();this.files.set(name,{createWritable:async()=>{const chunks=[];return {write:async data=>chunks.push(new Uint8Array(data).slice()),close:async()=>{saved=new Blob(chunks);},abort:async()=>{}};},getFile:async()=>saved});}return this.files.get(name);}
}
test('ZIP export requires current approval, never reads exclusions, and preserves source bytes',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js');const source=new File(['abc'],'Annual Report.txt'),excluded=new File(['secret'],'private.tmp');excluded.slice=()=>{throw new Error('Excluded content read');};
 const {session,permit}=setup([source,excluded]);session.setInputs({inventory:createInventory([source,excluded]),rules:{...defaultRules(),patterns:['*.tmp']},guideResolved:true});session.generate();const approved=session.approve();
 await assert.rejects(()=>exportApproved(session,permit,{mode:'zip'}),/approval|stale/i);
 let blob;const result=await exportApproved(session,approved,{mode:'zip',adapters:{download:async value=>{blob=value;}}});assert.equal(result.state,'download-requested');
 const entries=readStoredZip(await blob.arrayBuffer());assert.equal(new TextDecoder().decode(entries['Documents/annual-report.txt']),'abc');assert.equal(Object.keys(entries).length,2);assert.equal(await source.text(),'abc');
 const report=JSON.parse(new TextDecoder().decode(entries['organization-report.json']));assert.equal(report.checksums['Documents/annual-report.txt'],createHash('sha256').update('abc').digest('hex'));
});
test('folder export creates a fresh subfolder, verifies bytes and reports partial write failures',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js');const {session,permit}=setup([new File(['abc'],'notes.txt')]);const parent=new Directory();parent.files.set('unrelated.txt',{keep:true});
 const result=await exportApproved(session,permit,{mode:'folder',parentHandle:parent});assert.equal(result.state,'saved');assert.equal(parent.files.get('unrelated.txt').keep,true);const folder=parent.dirs.get(result.outputName);assert.equal(await (await (await folder.dirs.get('Documents').getFileHandle('notes.txt')).getFile()).text(),'abc');
 const failing={getDirectoryHandle:async(name,options)=>{if(!options.create)throw Object.assign(new Error('missing'),{name:'NotFoundError'});return {getDirectoryHandle:async()=>{throw new Error('permission revoked');}};}};
 const partial=await exportApproved(session,permit,{mode:'folder',parentHandle:failing});assert.equal(partial.state,'partial');assert.match(partial.error,/permission/);assert.ok(partial.outputName);
});
test('cancel and oversized ZIP stop before downloading',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js');const {session,permit}=setup([new File(['a'],'one.txt')]);const controller=new AbortController();controller.abort();await assert.rejects(()=>exportApproved(session,permit,{mode:'zip',signal:controller.signal}),/cancel/i);
 const big={name:'large.bin',size:67108864,lastModified:0,type:'',slice(){throw new Error('Should reject before reading');}};const oversized=setup([big]);await assert.rejects(()=>exportApproved(oversized.session,oversized.permit,{mode:'zip'}),/64|limit/i);
});
test('source read failures, cancellation and corrupted folder writes cannot claim saved',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js');
 const broken=new File(['abc'],'broken.txt');broken.slice=()=>{throw new Error('source unavailable');};const failed=setup([broken]);
 const parent=new Directory();const partial=await exportApproved(failed.session,failed.permit,{mode:'folder',parentHandle:parent});assert.equal(partial.state,'partial');assert.deepEqual(partial.completedPaths,[]);assert.match(partial.error,/source unavailable/);
 const source=new File(['abc'],'notes.txt'),approved=setup([source]);const controller=new AbortController();const sliced=source.slice.bind(source);source.slice=(...args)=>{controller.abort();return sliced(...args);};
 const canceled=await exportApproved(approved.session,approved.permit,{mode:'folder',parentHandle:new Directory(),signal:controller.signal});assert.equal(canceled.state,'canceled');assert.deepEqual(canceled.completedPaths,[]);
 const clean=setup([new File(['abc'],'notes.txt')]);const corruptParent=new Directory();const original=corruptParent.getDirectoryHandle.bind(corruptParent);
 corruptParent.getDirectoryHandle=async(...args)=>{const root=await original(...args);root.getDirectoryHandle=async()=>({getFileHandle:async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{},abort:async()=>{}}),getFile:async()=>new Blob(['bad'])})});return root;};
 const corrupt=await exportApproved(clean.session,clean.permit,{mode:'folder',parentHandle:corruptParent});assert.equal(corrupt.state,'partial');assert.match(corrupt.error,/checksum/);assert.deepEqual(corrupt.completedPaths,[]);
});
test('a valid prototype-like manual filename receives a checksum in the report',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js');const {session}=setup([new File(['abc'],'a.txt')]);session.editTarget(session.proposal.rows[0].fileId,'__proto__');const permit=session.approve();let blob;
 await exportApproved(session,permit,{mode:'zip',adapters:{download:async value=>{blob=value;}}});const report=JSON.parse(new TextDecoder().decode(readStoredZip(await blob.arrayBuffer())['organization-report.json']));
 assert.equal(report.checksums.__proto__,createHash('sha256').update('abc').digest('hex'));
});
test('cancellation during ZIP reading releases buffers without downloading',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js'),{downloadBudget}=await import('../public/transfer/resources.js');const controller=new AbortController(),file=new File([new Uint8Array(65536)],'a.bin'),slice=file.slice.bind(file);file.slice=(...args)=>{controller.abort();return slice(...args);};
 const {session,permit}=setup([file]);let downloads=0;await assert.rejects(()=>exportApproved(session,permit,{mode:'zip',signal:controller.signal,adapters:{download:async()=>downloads++}}),/cancel/i);assert.equal(downloads,0);assert.equal(downloadBudget.used,0);
});
test('folder naming retries collisions and quota failures retain accurate completed paths',async()=>{
 const {exportApproved}=await import('../public/organizer/export.js');const {session,permit}=setup([new File(['a'],'first.txt'),new File(['b'],'second.txt')]);const parent=new Directory(),original=parent.getDirectoryHandle.bind(parent);let probes=0;
 parent.getDirectoryHandle=async(name,options={})=>{if(!options.create&&probes++===0)return new Directory('preexisting');const root=await original(name,options);const getDir=root.getDirectoryHandle.bind(root);root.getDirectoryHandle=async(...args)=>{const directory=await getDir(...args),getFile=directory.getFileHandle.bind(directory);directory.getFileHandle=async(name,opts)=>name==='second.txt'?{createWritable:async()=>({write:async()=>{throw new Error('Quota exceeded');},close:async()=>{},abort:async()=>{}})}:getFile(name,opts);return directory;};return root;};
 const result=await exportApproved(session,permit,{mode:'folder',parentHandle:parent});assert.ok(probes>=2);assert.equal(result.state,'partial');assert.deepEqual(result.completedPaths,['Documents/first.txt']);assert.match(result.error,/Quota/);assert.ok(parent.dirs.has(result.outputName));
});
