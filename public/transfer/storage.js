import {LIMITS} from './protocol.js';
import {createHasher,hashPrefix} from './hash.js';
import {downloadBudget,acquireExportLock} from './resources.js';

export async function prepareSink(entry,{mode='auto',destination,adapters={}}={}) {
  const usePrivate=mode!=='memory'&&mode!=='custom'&&!!globalThis.navigator?.storage?.getDirectory;
  if(!Number.isSafeInteger(entry.size)||entry.size<0)throw new Error('Invalid file size.');
  if(!destination&&entry.size>LIMITS.blob)throw new Error('This save method has a 64 MiB file limit. Choose a streaming save destination.');
  if(!usePrivate&&destination&&entry.size>LIMITS.blob)throw new Error('Large files need browser private storage for safe staging.');
  let root,handle,writer=adapters.writer;let chunks=[];let offset=0;let closed=false;let verified=false;let exported=null;
  const hash=createHasher();const controller=new AbortController();
  try{
    if(usePrivate){const estimate=await navigator.storage.estimate();if(Number.isFinite(estimate.quota)&&entry.size>Math.max(0,estimate.quota-(estimate.usage||0)))throw new Error('Insufficient browser storage.');root=await navigator.storage.getDirectory();handle=await root.getFileHandle(`transfer-${entry.id}-${crypto.randomUUID()}`,{create:true});writer=await handle.createWritable();}
  }catch(error){hash.dispose();if(root&&handle)await root.removeEntry(handle.name).catch(()=>{});throw error;}
  let finalBlob=null;
  const ensure=()=>{if(closed)throw new Error('Transfer canceled or closed.');};
  const remove=async()=>{if(root&&handle)await root.removeEntry(handle.name).catch(()=>{});};
  const getBlob=async()=>{ensure();if(finalBlob)return finalBlob;if(handle){if(writer) {await writer.close();writer=null;}return handle.getFile();}return new Blob(chunks,{type:'application/octet-stream'});};
  const sink={
    get confirmedOffset(){return offset;},
    async write(position,bytes){ensure();if(verified)throw new Error('File already verified.');if(position!==offset)throw new Error('Chunk offset does not match.');if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>LIMITS.chunk||offset+bytes.length>entry.size)throw new Error('Invalid chunk length.');if(writer)await writer.write({type:'write',position:offset,data:bytes});else chunks.push(bytes.slice());ensure();await hash.update(bytes);offset+=bytes.length;},
    async hashPrefix(length){ensure();if(length!==offset)throw new Error('Invalid stored prefix.');if(handle&&writer){await writer.close();writer=null;const blob=await handle.getFile();const result=await hashPrefix(blob,length);writer=await handle.createWritable({keepExistingData:true});return result;}return hashPrefix(await getBlob(),length);},
    async finish(expectedDigest){ensure();if(verified)return {state:'verified',size:offset};if(offset!==entry.size)throw new Error('File incomplete.');if(await hash.digest()!==expectedDigest){await sink.abort();throw new Error('File integrity check failed.');}if(writer){await writer.close();writer=null;}verified=true;hash.dispose();return {state:'verified',size:offset};},
    getBlob,
    async export(){ensure();if(!verified)throw new Error('Verify the file before export.');if(exported)return exported;const release=await acquireExportLock('transfer',controller.signal);try{ensure();const blob=await getBlob();
      if(destination){const output=await destination.createWritable();try{for(let position=0;position<blob.size;position+=262144){ensure();await output.write(await blob.slice(position,position+262144).arrayBuffer());}ensure();await output.close();exported={state:'saved',name:entry.name};}catch(error){await output.abort().catch(()=>{});throw error;}}
      else {if(blob.size>LIMITS.blob)throw new Error('Download export exceeds the 64 MiB limit.');if(!globalThis.document)throw new Error('Download requires a browser.');
        // OPFS File objects depend on their backing entry. Materialize only the
        // bounded download fallback before deleting staging, so it stays valid.
        const lease=await downloadBudget.reserve(blob.size,controller.signal,'transfer');
        try{ensure();const downloadBlob=handle?new Blob([await blob.arrayBuffer()],{type:'application/octet-stream'}):blob;ensure();
          const url=URL.createObjectURL(downloadBlob);lease.url=url;const link=document.createElement('a');link.href=url;link.download=entry.name;link.rel='noopener';document.body.append(link);link.click();link.remove();lease.timer=setTimeout(()=>lease.release(),60000);exported={state:'export-requested',name:entry.name};
        }catch(error){lease.release();throw error;}}
      await remove();chunks=[];finalBlob=null;return exported;}finally{release();}
    },
    async abort(){if(closed)return;closed=true;controller.abort();hash.dispose();if(writer)await writer.abort().catch(()=>{});writer=null;chunks=[];finalBlob=null;await remove();}
  };
  return sink;
}
