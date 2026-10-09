import {LIMITS} from './protocol.js';

export function createDownloadBudget(limit) {
  let used=0;const waiting=new Set();const leases=new Set();
  const wake=()=>{for(const callback of Array.from(waiting))callback();};
  return {
    get used(){return used;},
    async reserve(bytes,signal,owner){
      if(!Number.isSafeInteger(bytes)||bytes<0||bytes>limit)throw new Error('Download memory limit exceeded.');
      while(used+bytes>limit){
        if(signal?.aborted)throw new Error('Download canceled.');
        await new Promise((resolve,reject)=>{const done=()=>{waiting.delete(done);signal?.removeEventListener('abort',abort);resolve();};const abort=()=>{waiting.delete(done);signal?.removeEventListener('abort',abort);reject(new Error('Download canceled.'));};waiting.add(done);signal?.addEventListener('abort',abort,{once:true});});
      }
      if(signal?.aborted)throw new Error('Download canceled.');used+=bytes;let released=false;
      const lease={owner,url:null,timer:null,release(){if(released)return;released=true;clearTimeout(lease.timer);if(lease.url)URL.revokeObjectURL(lease.url);used-=bytes;leases.delete(lease);wake();}};leases.add(lease);return lease;
    },
    releaseOwner(owner){for(const lease of Array.from(leases))if(lease.owner===owner)lease.release();},
    releaseAll(){for(const lease of Array.from(leases))lease.release();}
  };
}
export const downloadBudget=createDownloadBudget(LIMITS.blob);
export const releaseDownloadResources=owner=>owner===undefined?downloadBudget.releaseAll():downloadBudget.releaseOwner(owner);

let busy=false;const exportQueue=[];
function grantNext(){
  if(busy)return;const next=exportQueue.shift();if(!next)return;
  next.signal?.removeEventListener('abort',next.abort);if(next.signal?.aborted){next.reject(new Error('Export canceled.'));grantNext();return;}
  busy=true;let released=false;next.resolve(()=>{if(released)return;released=true;busy=false;grantNext();});
}
export function acquireExportLock(owner,signal){
  if(signal?.aborted)return Promise.reject(new Error('Export canceled.'));
  return new Promise((resolve,reject)=>{const entry={owner,signal,resolve,reject,abort(){const index=exportQueue.indexOf(entry);if(index>=0)exportQueue.splice(index,1);signal?.removeEventListener('abort',entry.abort);reject(new Error('Export canceled.'));}};exportQueue.push(entry);signal?.addEventListener('abort',entry.abort,{once:true});grantNext();});
}
