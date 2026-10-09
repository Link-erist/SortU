import {LIMITS,validateManifest,parseControl,encodeChunk,decodeChunk} from './protocol.js';
import {createHasher,hashPrefix} from './hash.js';

export function createTransferEngine({role,channel,pairingVerified=false,sinkFactory,hasherFactory=createHasher,onEvent=()=>{},clock=Date.now}) {
  if(!['send','receive'].includes(role))throw new Error('Invalid transfer role.');
  let localVerified=pairingVerified,remoteVerified=false,closed=false,paused=false,generation=0;
  let manifest=null,sources=new Map(),received=new Map(),sending=new Map(),accepted=false;
  let incoming=Promise.resolve(),queued=0,running=false,lastActivity=clock();let timer;
  const listeners=[];
  const emit=(type,detail={})=>onEvent({type,...detail});
  const ready=()=>!closed&&!paused&&localVerified&&remoteVerified&&channel.readyState==='open';
  const control=message=>{if(closed||channel.readyState!=='open')throw new Error('Connection interrupted. Re-pair to continue.');const text=JSON.stringify({v:1,...message});parseControl(text);channel.send(text);};
  const progress=(entry,offset)=>emit('progress',{fileId:entry.id,name:entry.name,offset,size:entry.size});
  const alive=token=>!closed&&!paused&&generation===token;
  const cleanupSinks=async()=>{await Promise.allSettled(Array.from(received.values(),r=>r.sink.abort()));};
  const fail=async error=>{
    if(closed)return;paused=true;generation++;running=false;emit('error',{message:error.message});
    if(manifest&&channel.readyState==='open'){try{control({type:'error',transferId:manifest.transferId,message:error.message.slice(0,500)});}catch{}}
    accepted=false;await cleanupSinks();
  };
  async function waitUntil(predicate,token,{timeout=60000}={}) {
    const start=clock();while(!predicate()){if(!alive(token))throw new Error('Transfer paused.');if(clock()-start>timeout)throw Object.assign(new Error('Transfer timed out. Re-pair while keeping both pages open.'),{recoverable:true});await new Promise(resolve=>setTimeout(resolve,15));}
  }
  async function sendFile(record,start=0) {
    const token=generation;const source=sources.get(record.entry.id);const hash=hasherFactory();
    try {
      for(let p=0;p<start;p+=LIMITS.chunk){if(!alive(token))return;await hash.update(new Uint8Array(await source.slice(p,Math.min(start,p+LIMITS.chunk)).arrayBuffer()));}
      let offset=start;record.ack=start;
      const capacity=channel.maxMessageSize||65536;const chunkSize=Math.min(LIMITS.chunk,capacity-LIMITS.header);
      if(chunkSize<1)throw new Error('Browser message capacity too small.');
      while(offset<source.size){
        const length=Math.min(chunkSize,source.size-offset);
        await waitUntil(()=>ready()&&channel.bufferedAmount+length+LIMITS.header<=LIMITS.queue&&offset-record.ack+length<=LIMITS.queue,token);
        const bytes=new Uint8Array(await source.slice(offset,offset+length).arrayBuffer());
        if(!alive(token))return;await hash.update(bytes);if(!alive(token))return;
        channel.send(encodeChunk({transferId:manifest.transferId,fileId:record.entry.id,offset},bytes));offset+=length;record.sent=offset;
      }
      await waitUntil(()=>record.ack===source.size,token);
      if(!alive(token))return;
      control({type:'complete',transferId:manifest.transferId,fileId:record.entry.id,digest:await hash.digest()});
      let attempts=0;
      while(!record.state){await waitUntil(()=>record.state||clock()-lastActivity>1000,token,{timeout:10000});if(!record.state){if(++attempts>60)throw Object.assign(new Error('Completion response timed out. Re-pair to continue.'),{recoverable:true});control({type:'status',transferId:manifest.transferId,fileId:record.entry.id});lastActivity=clock();}}
      // Wait for user export before sending another file, keeping memory bounded.
      await waitUntil(()=>record.state==='saved'||record.state==='export-requested',token,{timeout:Number.MAX_SAFE_INTEGER});
    } finally {hash.dispose();}
  }
  async function pump(startId,startOffset=0) {
    if(running)return;running=true;const token=generation;
    try{const records=Array.from(sending.values());let start=startId?records.findIndex(r=>r.entry.id===startId):0;for(let i=start;i<records.length;i++){if(!alive(token))break;const record=records[i];if(record.state==='saved'||record.state==='export-requested')continue;await sendFile(record,i===start?startOffset:0);}}
    catch(error){if(alive(token)){if(error.recoverable){paused=true;generation++;running=false;remoteVerified=false;localVerified=false;emit('paused',{message:error.message});channel.close();}else await fail(error);}}finally{if(token===generation)running=false;}
  }
  function checkTransaction(m){if(!manifest||m.transferId!==manifest.transferId)throw new Error('Unknown or stale transfer.');}
  async function handle(data) {
    lastActivity=clock();
    if(typeof data!=='string'){
      if(role!=='receive'||!ready()||!accepted)throw new Error('File bytes arrived without approval.');
      const chunk=decodeChunk(data);checkTransaction(chunk);const record=received.get(chunk.fileId);
      const next=Array.from(received.values()).find(r=>!r.state||r.state==='verified');
      if(!record||record!==next||record.state)throw new Error('Unexpected file chunk.');
      await record.sink.write(chunk.offset,chunk.bytes);if(!ready()||!accepted)return;
      progress(record.entry,record.sink.confirmedOffset);control({type:'ack',transferId:manifest.transferId,fileId:record.entry.id,offset:record.sink.confirmedOffset});return;
    }
    const m=parseControl(data);
    if(m.type==='hello'){remoteVerified=m.verified;if(ready())emit('ready');return;}
    if(!ready())throw new Error('Verify pairing on both devices first.');
    if(m.type==='manifest'){
      if(role!=='receive'||(manifest&&Array.from(received.values()).some(r=>!r.state||r.state==='verified')))throw new Error('Another transfer is still pending.');
      await cleanupSinks();received.clear();manifest=validateManifest({transferId:m.transferId,files:m.files});accepted=false;emit('manifest',{manifest});return;
    }
    checkTransaction(m);
    if(m.type==='error'){paused=true;accepted=false;generation++;running=false;await cleanupSinks();emit('error',{message:m.message});return;}
    if(m.type==='reject'||m.type==='cancel'){accepted=false;paused=false;generation++;running=false;await cleanupSinks();sources.clear();sending.clear();received.clear();manifest=null;listeners.splice(0).forEach(remove=>remove());bind(channel);emit('canceled');return;}
    if(m.type==='accept'){
      if(role!=='send'||accepted)throw new Error('Unexpected acceptance.');
      if(m.fileIds.some(id=>!sources.has(id)))throw new Error('Unknown accepted file.');
      sending=new Map(manifest.files.filter(e=>m.fileIds.includes(e.id)).map(entry=>[entry.id,{entry,ack:0,sent:0,state:null}]));accepted=true;emit('accepted');void pump();return;
    }
    if(m.type==='ack'){
      const record=sending.get(m.fileId);if(role!=='send'||!accepted||!record||m.offset<record.ack||m.offset>record.sent)throw new Error('Invalid receiver acknowledgment.');record.ack=m.offset;progress(record.entry,m.offset);return;
    }
    if(m.type==='complete'||m.type==='status'){
      const record=received.get(m.fileId);if(role!=='receive'||!accepted||!record)throw new Error('Unexpected completion request.');
      if(m.type==='complete'&&!record.state){await record.sink.finish(m.digest);if(!ready()||!accepted)return;record.state='verified';emit('verified',{fileId:m.fileId,name:record.entry.name,sink:record.sink});}
      if(record.state)control({type:'completed',transferId:manifest.transferId,fileId:m.fileId,state:record.state});return;
    }
    if(m.type==='completed'){
      const record=sending.get(m.fileId);if(role!=='send'||!accepted||!record||record.ack!==record.entry.size)throw new Error('Unexpected completion result.');record.state=m.state;emit(m.state,{fileId:m.fileId,name:record.entry.name,remote:true});if(!running&&(m.state==='saved'||m.state==='export-requested'))void pump();return;
    }
    if(m.type==='resume'){
      if(role!=='send')throw new Error('Unexpected resume request.');const source=sources.get(m.fileId);const record=sending.get(m.fileId);
      if(!source||!record||!accepted||m.offset>source.size)throw new Error('Resume requires an accepted retained source file.');
      if(await hashPrefix(source,m.offset)!==m.digest)throw new Error('Source file or stored prefix changed. Restart this transfer.');
      record.state=null;record.ack=m.offset;record.sent=m.offset;emit('resuming');void pump(m.fileId,m.offset);return;
    }
    throw new Error('Unexpected transfer message.');
  }
  function bind(value) {
    channel=value;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=262144;const token=generation;
    const message=event=>{
      if(closed||token!==generation)return;
      const length=typeof event.data==='string'?new TextEncoder().encode(event.data).length:event.data?.byteLength||0;
      queued+=length;if(queued>LIMITS.queue+LIMITS.control+LIMITS.header*32){queued-=length;void fail(new Error('Incoming buffer limit exceeded.'));return;}
      incoming=incoming.then(()=>{if(!closed&&token===generation)return handle(event.data);}).catch(error=>fail(error)).finally(()=>{queued-=length;});
    };
    const disconnect=()=>{if(closed||token!==generation)return;paused=true;generation++;running=false;remoteVerified=false;localVerified=false;emit('paused',{message:'Connection interrupted. Keep both pages open and re-pair.'});};
    channel.addEventListener('message',message);channel.addEventListener('close',disconnect);channel.addEventListener('error',disconnect);
    listeners.push(()=>{value.removeEventListener('message',message);value.removeEventListener('close',disconnect);value.removeEventListener('error',disconnect);});
    queueMicrotask(()=>{if(!closed&&token===generation&&channel.readyState==='open')control({type:'hello',verified:localVerified});});
  }
  bind(channel);
  timer=setInterval(()=>{if(closed)return;if(channel.readyState==='open'&&!remoteVerified){try{control({type:'hello',verified:localVerified});}catch{}}},1000);
  timer.unref?.();
  const engine={
    get ready(){return ready();},get manifest(){return manifest;},
    confirmPairing(){localVerified=true;control({type:'hello',verified:true});if(ready())emit('ready');},
    async offer(files){if(role!=='send'||!ready())throw new Error('Verify the paired devices first.');if(manifest&&sending.size&&Array.from(sending.values()).some(r=>r.state!=='saved'&&r.state!=='export-requested'))throw new Error('Finish or cancel the current transfer first.');const entries=Array.from(files).map(file=>({id:crypto.randomUUID(),name:file.name,path:file.webkitRelativePath||file.name,size:file.size}));manifest=validateManifest({transferId:crypto.randomUUID(),files:entries});sources=new Map(entries.map((e,i)=>[e.id,files[i]]));sending.clear();accepted=false;control({type:'manifest',...manifest});emit('offered',{manifest});return manifest;},
    async accept(fileIds,sinks){if(role!=='receive'||!ready()||!manifest||accepted)throw new Error('No incoming transfer to approve.');if(!fileIds.length||fileIds.some(id=>!manifest.files.some(e=>e.id===id)))throw new Error('Invalid file selection.');if(!sinks){if(!sinkFactory)throw new Error('Choose receiving storage first.');sinks=new Map();try{for(const entry of manifest.files.filter(e=>fileIds.includes(e.id)))sinks.set(entry.id,await sinkFactory(entry));}catch(error){await Promise.allSettled(Array.from(sinks.values(),s=>s.abort()));throw error;}}for(const entry of manifest.files.filter(e=>fileIds.includes(e.id))){const sink=sinks.get(entry.id);if(!sink)throw new Error('Missing receiving storage.');received.set(entry.id,{entry,sink,state:null});}accepted=true;control({type:'accept',transferId:manifest.transferId,fileIds});emit('accepted');},
    reject(){if(manifest)control({type:'reject',transferId:manifest.transferId});manifest=null;received.clear();accepted=false;emit('canceled');},
    async cancel(){if(manifest&&channel.readyState==='open')control({type:'cancel',transferId:manifest.transferId});generation++;running=false;accepted=false;await cleanupSinks();received.clear();sources.clear();sending.clear();manifest=null;paused=false;listeners.splice(0).forEach(remove=>remove());bind(channel);emit('canceled');},
    async exportFile(fileId){const record=received.get(fileId);if(!record||record.state!=='verified')throw new Error('File is not ready to save.');const result=await record.sink.export();record.state=result.state;if(ready())control({type:'completed',transferId:manifest.transferId,fileId,state:result.state});emit(result.state,{fileId,name:record.entry.name});return result;},
    reconnect(value,verified=false){listeners.splice(0).forEach(remove=>remove());generation++;running=false;paused=false;localVerified=verified;remoteVerified=false;incoming=Promise.resolve();bind(value);},
    async resume(){if(role!=='receive'||!ready()||!accepted)throw new Error('Re-pair and confirm both devices before resuming.');const record=Array.from(received.values()).find(r=>r.state!=='saved'&&r.state!=='export-requested');if(!record)throw new Error('No partial file to resume.');if(record.state==='verified')throw new Error('Save the verified file before resuming the next file.');const offset=record.sink.confirmedOffset;control({type:'resume',transferId:manifest.transferId,fileId:record.entry.id,offset,digest:await record.sink.hashPrefix(offset)});emit('resuming');},
    async close(){closed=true;generation++;clearInterval(timer);listeners.splice(0).forEach(remove=>remove());await cleanupSinks();sources.clear();received.clear();sending.clear();}
  };
  return engine;
}
