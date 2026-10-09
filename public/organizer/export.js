import {createArchive, estimateArchiveBytes, ZIP_LIMIT} from './archive.js';
import {REPORT_PATH} from './paths.js';
import {acquireExportLock, downloadBudget} from '../transfer/resources.js';
import {createHasher} from '../transfer/hash.js';

const check = signal => {if (signal?.aborted) throw new Error('Export canceled.');};
export function buildReport(snapshot, checksums) {
  const bytes = new TextEncoder().encode(JSON.stringify({version:1, revision:snapshot.revision, rules:snapshot.rules, rows:snapshot.rows,analysis:snapshot.analysis||null, checksums}, null, 2));
  if (bytes.length > 524288) throw new Error('Organization report exceeds 512 KiB.');
  return bytes;
}
async function chunks(file, signal, consume) {
  for (let offset=0; offset<file.size; offset+=32768) {
    check(signal);
    const bytes=new Uint8Array(await file.slice(offset, Math.min(file.size,offset+32768)).arrayBuffer());
    check(signal); if (bytes.length !== Math.min(32768,file.size-offset)) throw new Error('Source file changed while reading.');
    await consume(bytes);
  }
}
async function verifiedCopy(file, handle, signal) {
  const hash=createHasher(); let writer;
  try {
    writer=await handle.createWritable();
    await chunks(file,signal,async bytes=>{await hash.update(bytes); await writer.write(bytes);});
    check(signal); await writer.close(); writer=null;
    const expected=await hash.digest(); hash.dispose();
    const saved=await handle.getFile(); if(saved.size!==file.size) throw new Error('Saved file size differs from source.');
    const reread=createHasher();
    try {await chunks(saved,signal,bytes=>reread.update(bytes)); if(await reread.digest()!==expected) throw new Error('Saved file checksum differs from source.');}
    finally {reread.dispose();}
    return expected;
  } finally {if(writer) await writer.abort().catch(()=>{}); hash.dispose();}
}
async function newFolder(parent) {
  for(let attempt=0;attempt<5;attempt++) {
    const today=new Date(),localDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const name=`Organized-${localDate}-${crypto.randomUUID()}`;
    try {await parent.getDirectoryHandle(name,{create:false}); continue;} catch(error) {if(error.name!=='NotFoundError') throw error;}
    return {name,handle:await parent.getDirectoryHandle(name,{create:true})};
  }
  throw new Error('Could not create a unique output folder.');
}
async function fileDestination(root,path) {
  const parts=path.split('/');let directory=root;
  for(const part of parts.slice(0,-1)) directory=await directory.getDirectoryHandle(part,{create:true});
  return directory.getFileHandle(parts.at(-1),{create:true});
}
export async function exportApproved(session, permit, {mode='zip',parentHandle,signal,onProgress=()=>{},adapters={}}={}) {
  const snapshot=session.resolveApproval(permit); check(signal);
  if(!['zip','folder'].includes(mode)) throw new Error('Choose ZIP or folder export.');
  if(mode==='folder'&&!parentHandle?.getDirectoryHandle) throw new Error('Choose an output parent folder first.');
  const entries=snapshot.entries.map(entry=>({...entry,targetPath:snapshot.rows.find(row=>row.fileId===entry.id).targetPath}));
  const placeholders=Object.fromEntries(entries.map(e=>[e.targetPath,'0'.repeat(64)]));
  const reportSize=buildReport(snapshot,placeholders).length;
  const estimate=estimateArchiveBytes(entries,reportSize);
  if(mode==='zip'&&estimate>ZIP_LIMIT) throw new Error('ZIP export exceeds the 64 MiB archive limit. Choose folder export or fewer files.');
  onProgress({stage:'Waiting for export resources',path:'',completed:0,total:entries.length});
  const release=await acquireExportLock('organizer',signal); let lease,archive,outputName; const output=[],checksums=Object.create(null),completedPaths=[];
  try {
    check(signal); session.resolveApproval(permit);
    if(mode==='zip') {
      onProgress({stage:'Waiting for earlier download buffers to release',path:'',completed:0,total:entries.length});
      lease=await downloadBudget.reserve(estimate,signal,'organizer'); check(signal); session.resolveApproval(permit);
      archive=createArchive({maxBytes:estimate,onChunk:bytes=>{check(signal);output.push(bytes);}});
      for(const entry of entries) {
        check(signal); onProgress({path:entry.targetPath,completed:completedPaths.length,total:entries.length,stage:'copying'});
        await archive.addEntry({path:entry.targetPath,size:entry.size,date:entry.lastModified});
        await chunks(entry.file,signal,bytes=>archive.write(bytes));
        checksums[entry.targetPath]=(await archive.endEntry()).digest; completedPaths.push(entry.targetPath);
      }
      const report=buildReport(snapshot,checksums);
      await archive.addEntry({path:REPORT_PATH,size:report.length});
      for(let offset=0;offset<report.length;offset+=32768) await archive.write(report.subarray(offset,offset+32768));
      await archive.endEntry(); await archive.finish(); archive=null; check(signal); session.resolveApproval(permit);
      const blob=new Blob(output,{type:'application/zip'}); output.length=0;
      if(adapters.download) {await adapters.download(blob);lease.release();lease=null;}
      else {
        lease.url=URL.createObjectURL(blob); const anchor=document.createElement('a');anchor.href=lease.url;anchor.download='organized-files.zip';
        document.body.append(anchor);anchor.click();anchor.remove(); const retained=lease;lease=null;
        retained.timer=setTimeout(()=>retained.release(),60000);
      }
      return {state:'download-requested',checksums,completedPaths};
    }
    const folder=await newFolder(parentHandle); outputName=folder.name;
    for(const entry of entries) {
      check(signal); session.resolveApproval(permit);onProgress({path:entry.targetPath,completed:completedPaths.length,total:entries.length,stage:'copying and verifying'});
      checksums[entry.targetPath]=await verifiedCopy(entry.file,await fileDestination(folder.handle,entry.targetPath),signal);
      completedPaths.push(entry.targetPath);
    }
    check(signal);session.resolveApproval(permit);
    const report=new Blob([buildReport(snapshot,checksums)]);await verifiedCopy(report,await fileDestination(folder.handle,REPORT_PATH),signal);
    return {state:'saved',outputName,checksums,completedPaths};
  } catch(error) {
    if(mode==='folder'&&outputName) return {state:signal?.aborted?'canceled':'partial',outputName,checksums,completedPaths,error:error.message};
    throw error;
  } finally {archive?.cancel(); output.length=0;lease?.release();release();}
}
