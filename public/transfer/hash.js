import {sha256} from '../vendor/sha256.js';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export function createHasher() {
  let closed=false;let nextId=0;let pending=null;
  const worker=typeof Worker==='function'?new Worker(new URL('./hash-worker.js',import.meta.url),{type:'module'}):null;
  const local=worker?null:sha256.create();
  if(worker){worker.onmessage=({data})=>{if(pending?.id===data.id){const p=pending;pending=null;data.error?p.reject(new Error(data.error)):p.resolve(data.result);}};worker.onerror=()=>{closed=true;pending?.reject(new Error('Hash worker failed.'));pending=null;worker.terminate();};}
  const request=async(type,bytes)=>{
    if(closed)throw new Error('Hasher disposed.');if(pending)throw new Error('Wait for the previous hash operation.');
    if(!worker){if(type==='update'){local.update(bytes);return;}return hex(local.clone().digest());}
    return new Promise((resolve,reject)=>{const id=++nextId;pending={id,resolve,reject};if(bytes){const copy=bytes.slice();worker.postMessage({id,type,bytes:copy.buffer},[copy.buffer]);}else worker.postMessage({id,type});});
  };
  return {update:bytes=>request('update',bytes),digest:()=>request('digest'),dispose(){closed=true;worker?.terminate();pending?.reject(new Error('Hasher disposed.'));pending=null;local?.destroy();}};
}
export async function hashPrefix(blob,length=blob.size) {
  if(!Number.isSafeInteger(length)||length<0||length>blob.size)throw new Error('Invalid prefix length.');
  const hash=createHasher();try{for(let offset=0;offset<length;offset+=32768)await hash.update(new Uint8Array(await blob.slice(offset,Math.min(length,offset+32768)).arrayBuffer()));return await hash.digest();}finally{hash.dispose();}
}
