import {LIMITS} from './protocol.js';

export function createDownloadBudget(limit) {
  let used=0;const waiting=new Set();const leases=new Set();
  const wake=()=>{for(const callback of Array.from(waiting))callback();};
  return {
    get used(){return used;},
    async reserve(bytes,signal){
      if(!Number.isSafeInteger(bytes)||bytes<0||bytes>limit)throw new Error('Download memory limit exceeded.');
      while(used+bytes>limit){
        if(signal?.aborted)throw new Error('Download canceled.');
        await new Promise((resolve,reject)=>{const done=()=>{waiting.delete(done);signal?.removeEventListener('abort',abort);resolve();};const abort=()=>{waiting.delete(done);signal?.removeEventListener('abort',abort);reject(new Error('Download canceled.'));};waiting.add(done);signal?.addEventListener('abort',abort,{once:true});});
      }
      if(signal?.aborted)throw new Error('Download canceled.');used+=bytes;let released=false;
      const lease={url:null,timer:null,release(){if(released)return;released=true;clearTimeout(lease.timer);if(lease.url)URL.revokeObjectURL(lease.url);used-=bytes;leases.delete(lease);wake();}};leases.add(lease);return lease;
    },
    releaseAll(){for(const lease of Array.from(leases))lease.release();}
  };
}
export const downloadBudget=createDownloadBudget(LIMITS.blob);
export const releaseDownloadResources=()=>downloadBudget.releaseAll();
