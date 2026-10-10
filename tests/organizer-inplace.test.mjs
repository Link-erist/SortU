import test from 'node:test';import assert from 'node:assert/strict';
import {createInventory} from '../public/organizer/inventory.js';import {defaultRules} from '../public/organizer/rules.js';import {createOrganizerSession} from '../public/organizer/proposal.js';
import {planInPlace,applyInPlace,readRestoreLog,planRestore,restoreInPlace,RESTORE_LOG} from '../public/organizer/inplace.js';

const fail=name=>Object.assign(new Error(name),{name});
class FileEntry {
 constructor(name,blob=new Blob(),lastModified=1){this.name=name;this.blob=blob;this.lastModified=lastModified;}
 async getFile(){return new File([this.blob],this.name,{lastModified:this.lastModified});}
 async createWritable(){const chunks=[];return {write:async data=>chunks.push(new Uint8Array(data).slice()),close:async()=>{this.blob=new Blob(chunks);this.lastModified=Date.now();},abort:async()=>{}};}
}
class Folder {
 constructor(name){this.name=name;this.entries=new Map();}
 async getDirectoryHandle(name,{create=false}={}){const found=this.entries.get(name);if(found instanceof Folder)return found;if(found)throw fail('TypeMismatchError');if(!create)throw fail('NotFoundError');const made=new Folder(name);this.entries.set(name,made);return made;}
 async getFileHandle(name,{create=false}={}){const found=this.entries.get(name);if(found instanceof FileEntry)return found;if(found)throw fail('TypeMismatchError');if(!create)throw fail('NotFoundError');const made=new FileEntry(name);this.entries.set(name,made);return made;}
 async removeEntry(name){const found=this.entries.get(name);if(!found)throw fail('NotFoundError');if(found instanceof Folder&&found.entries.size)throw fail('InvalidModificationError');this.entries.delete(name);}
}
// Puts a file in the fake folder and returns the matching File as a folder selection would give it.
function put(root,path,text,lastModified=1000) {
 const parts=path.split('/'),name=parts.pop();let dir=root;
 for(const part of parts){if(!dir.entries.has(part))dir.entries.set(part,new Folder(part));dir=dir.entries.get(part);}
 dir.entries.set(name,new FileEntry(name,new Blob([text]),lastModified));
 const file=new File([text],name,{lastModified});Object.defineProperty(file,'webkitRelativePath',{value:`${root.name}/${path}`});return file;
}
const listing=(dir,prefix='')=>[...dir.entries].flatMap(([name,entry])=>entry instanceof Folder?listing(entry,`${prefix}${name}/`):[`${prefix}${name}`]).sort();
async function text(root,path){const parts=path.split('/'),name=parts.pop();let dir=root;for(const part of parts)dir=await dir.getDirectoryHandle(part);return (await (await dir.getFileHandle(name)).getFile()).text();}
function approve(files,rules={}) {
 const session=createOrganizerSession();session.setInputs({inventory:createInventory(files),rules:{...defaultRules(),...rules},guideResolved:true});session.generate();return {session,permit:session.approve()};
}

test('moves the original files, keeps their bytes, removes emptied folders, and restores the original layout',async()=>{
 const root=new Folder('Shoot');const files=[put(root,'Annual Report.txt','report'),put(root,'old/photo.png','pixels')];put(root,'keep.me','untouched');
 const {session,permit}=approve(files);const plan=await planInPlace(session,permit,root);
 assert.deepEqual(plan.problems,[]);assert.deepEqual(plan.moves.map(m=>[m.from,m.to]),[['Annual Report.txt','Documents/annual-report.txt'],['old/photo.png','Images/photo.png']]);
 const result=await applyInPlace(session,permit,root,plan);assert.equal(result.state,'done');
 assert.deepEqual(listing(root),['Documents/annual-report.txt','Images/photo.png',RESTORE_LOG,'keep.me']);
 assert.equal(await text(root,'Documents/annual-report.txt'),'report');assert.equal(await text(root,'Images/photo.png'),'pixels');
 const log=await readRestoreLog(root);assert.ok(log.moves.every(move=>move.done&&/^[0-9a-f]{64}$/.test(move.sha256)));
 const back=await planRestore(root,log);assert.deepEqual(back.skipped,[]);
 assert.equal((await restoreInPlace(root,log,back)).state,'done');
 assert.deepEqual(listing(root),['Annual Report.txt','keep.me','old/photo.png']);assert.equal(await text(root,'old/photo.png'),'pixels');
});
test('blocks the wrong folder, changed files, and paths that are already taken, without touching anything',async()=>{
 const root=new Folder('Shoot');const file=put(root,'notes.txt','a');const {session,permit}=approve([file]);
 const wrong=new Folder('Other');assert.match((await planInPlace(session,permit,wrong)).problems[0],/Choose that folder/);
 put(root,'Documents/notes.txt','someone else');const taken=await planInPlace(session,permit,root);assert.match(taken.problems.join(),/already exists/);
 await assert.rejects(()=>applyInPlace(session,permit,root,taken),/problems/);assert.equal(await text(root,'notes.txt'),'a');
 const changed=new Folder('Shoot');const stale=put(changed,'notes.txt','a',1000);changed.entries.get('notes.txt').lastModified=2000;
 const second=approve([stale]);assert.match((await planInPlace(second.session,second.permit,changed)).problems.join(),/changed after/);
});
test('a failed copy keeps both files where they were, and the finished moves can still be restored',async()=>{
 const root=new Folder('Shoot');const files=[put(root,'a.txt','first'),put(root,'b.txt','second')];const {session,permit}=approve(files);const plan=await planInPlace(session,permit,root);
 const documents=await root.getDirectoryHandle('Documents',{create:true}),original=documents.getFileHandle.bind(documents);
 documents.getFileHandle=async(name,options)=>{const handle=await original(name,options);if(name==='b.txt')handle.createWritable=async()=>({write:async()=>{throw new Error('Disk full');},close:async()=>{},abort:async()=>{}});return handle;};
 const result=await applyInPlace(session,permit,root,plan);assert.equal(result.state,'partial');assert.match(result.error,/Disk full/);
 assert.deepEqual(listing(root),['Documents/a.txt',RESTORE_LOG,'b.txt']);
 const log=await readRestoreLog(root);assert.deepEqual(log.moves.map(m=>m.done),[true,false]);
 await restoreInPlace(root,log,await planRestore(root,log));assert.deepEqual(listing(root),['a.txt','b.txt']);
});
test('a stale approval stops before anything moves, and files already in place are skipped',async()=>{
 const root=new Folder('Shoot');const file=put(root,'Documents/notes.txt','a');const {session,permit}=approve([file],{groupBy:'folders'});
 const plan=await planInPlace(session,permit,root);assert.deepEqual(plan.moves,[]);assert.deepEqual(plan.unchanged,['Documents/notes.txt']);
 session.editTarget(session.proposal.rows[0].fileId,'Shoot/Elsewhere/notes.txt');
 await assert.rejects(()=>planInPlace(session,permit,root),/approval/i);
 const fresh=session.approve(),moved=await planInPlace(session,fresh,root);assert.deepEqual(moved.moves.map(m=>m.to),['Elsewhere/notes.txt']);
});
test('the restore log is never moved, and a missing log is reported',async()=>{
 const root=new Folder('Shoot');const files=[put(root,RESTORE_LOG,'{}'),put(root,'a.txt','a')];const {session,permit}=approve(files);
 assert.match((await planInPlace(session,permit,root)).problems.join(),/Uncheck SortU-restore-log.json/);
 await assert.rejects(()=>readRestoreLog(new Folder('Empty')),/has no SortU-restore-log.json/);
});
