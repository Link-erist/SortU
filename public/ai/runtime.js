export function createLocalRuntime({signal,onProgress=()=>{},workerFactory}={}) {
 let worker=null,pending=null,closed=false,nextId=0,timer;
 const fail=error=>{if(closed)return;closed=true;clearTimeout(timer);worker?.terminate();pending?.reject(error);pending=null;signal?.removeEventListener('abort',abort);};
 const abort=()=>fail(new Error('Local AI canceled.'));
 function arm(delay){clearTimeout(timer);timer=setTimeout(()=>fail(new Error('Local AI timed out. Rules mode remains available.')),delay);}
 async function request(type,payload={},revision='') {
  if(closed||signal?.aborted)throw new Error('Local AI canceled or disposed.');if(pending)throw new Error('Wait for the current AI operation.');
  if(!worker){worker=workerFactory?workerFactory():new Worker(new URL('./runtime-worker.js',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(closed||data?.v!==1||data.id!==pending?.id||data.revision!==pending?.revision)return;
    if(data.type==='progress'){onProgress(data.progress);arm(pending.type==='prepare'?90000:120000);return;}
    const current=pending;pending=null;clearTimeout(timer);data.error?current.reject(new Error(data.error)):current.resolve(data.result);};
   worker.onerror=()=>fail(new Error('Local AI worker failed. Rules mode remains available.'));
  }
  return new Promise((resolve,reject)=>{const id=++nextId;pending={id,revision,type,resolve,reject};arm(type==='prepare'?90000:120000);worker.postMessage({v:1,id,revision,type,payload});});
 }
 signal?.addEventListener('abort',abort,{once:true});
 return {prepare:({files}={})=>request('prepare',files?{files}:{}),verifyOffline:()=>request('verifyOffline'),generate:({revision,...payload})=>request('generate',payload,revision),unload:()=>request('unload'),dispose:()=>fail(new Error('Local AI disposed.'))};
}
