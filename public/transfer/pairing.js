const MAX_PAYLOAD = 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))), x => x.toString(16).padStart(2,'0')).join('');

export function validatePairing(payload, now = Date.now()) {
  if (!payload || JSON.stringify(payload).length > MAX_PAYLOAD) throw new Error('Pairing payload too large.');
  if (payload.version !== 1 || !UUID.test(payload.pairingId) || !['offer','answer'].includes(payload.role)) throw new Error('Invalid pairing payload.');
  if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now || payload.expiresAt > now + 310000) throw new Error('Pairing expired. Create a new code.');
  const d = payload.description;
  if (d?.type !== payload.role || typeof d.sdp !== 'string' || !d.sdp.includes('m=application ') || !d.sdp.includes('a=fingerprint:') || /^m=(audio|video) /m.test(d.sdp) || payload.iceServers) throw new Error('Invalid data-only connection description.');
  return payload;
}

export async function encodePairing(payload, frameLimit = 800) {
  validatePairing(payload);
  if (frameLimit < 160 || frameLimit > 800) throw new Error('Invalid QR frame size.');
  const json = JSON.stringify(payload);
  const bytes = encoder.encode(json);
  if (bytes.length > MAX_PAYLOAD) throw new Error('Pairing payload too large.');
  const content = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const hash = await digest(json);
  const chunkSize = frameLimit - 120;
  const count = Math.ceil(content.length / chunkSize);
  if (count > 256) throw new Error('Connection description too large for QR. Use pairing text.');
  return Array.from({length:count},(_,i) => `FT1|${payload.pairingId}|${hash}|${i}|${count}|${content.slice(i*chunkSize,(i+1)*chunkSize)}`);
}

export function createFrameCollector() {
  let identity = null; let frames = new Map();
  return {
    reset() { identity = null; frames = new Map(); },
    get progress() { return {received:frames.size,total:identity?.count || 0}; },
    async add(text) {
      if (typeof text !== 'string' || text.length > 180000) throw new Error('Pairing input too large.');
      if (text.trim().startsWith('{')) return validatePairing(JSON.parse(text));
      if (text.length > 800) throw new Error('QR frame too large.');
      const [tag,id,hash,indexText,countText,data,...extra] = text.split('|');
      const index = Number(indexText); const count = Number(countText);
      if (tag !== 'FT1' || !UUID.test(id) || !/^[a-f0-9]{64}$/.test(hash) || !Number.isInteger(index) || !Number.isInteger(count) || count < 1 || count > 256 || index < 0 || index >= count || !/^[A-Za-z0-9_-]+$/.test(data || '') || extra.length) throw new Error('Invalid QR frame.');
      if (identity && (identity.id !== id || identity.hash !== hash || identity.count !== count)) throw new Error('Mixed frames from different pairing sessions. Reset scanning.');
      identity = {id,hash,count};
      if (frames.has(index) && frames.get(index) !== data) throw new Error('Conflicting QR frame.');
      frames.set(index,data);
      if (frames.size !== count) return null;
      const encoded = Array.from({length:count},(_,i) => frames.get(i)).join('').replaceAll('-','+').replaceAll('_','/');
      const json = new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));
      if (await digest(json) !== hash) throw new Error('Pairing content verification failed.');
      const payload = validatePairing(JSON.parse(json));
      if (payload.pairingId !== id) throw new Error('Pairing identity mismatch.');
      return payload;
    }
  };
}

export async function verificationCode(offer, answer) {
  return (await digest(JSON.stringify([offer,answer]))).slice(0,8).toUpperCase().replace(/(.{4})(.{4})/,'$1 $2');
}

function waitForIce(peer, signal) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve,reject) => {
    const cleanup = () => {clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);signal.removeEventListener('abort',abort);};
    const changed = () => {if(peer.iceGatheringState === 'complete'){cleanup();resolve();}};
    const abort = () => {cleanup();reject(new Error('Pairing canceled.'));};
    const timer = setTimeout(()=>{cleanup();reject(new Error('Connection setup timed out. Keep local Wi-Fi active.'));},30000);
    peer.addEventListener('icegatheringstatechange',changed);signal.addEventListener('abort',abort,{once:true});
    if (signal.aborted) abort();
  });
}

export async function createPairing({role,payload,peerFactory = config => new RTCPeerConnection(config),clock = Date.now,connectionTimeout=30000}) {
  if (!['offer','answer'].includes(role)) throw new Error('Invalid pairing role.');
  if (role === 'answer') {validatePairing(payload,clock());if(payload.role !== 'offer') throw new Error('Scan the sender offer first.');}
  const peer = peerFactory({iceServers:[]}); const controller = new AbortController();
  let channel; let offer = role === 'answer' ? payload.description : null; let answer = null; let closed = false;let connectionTimer;let opened=false;
  let readyResolve,readyReject;
  const channelReady = new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  channelReady.catch(()=>{});
  const failed=message=>{if(closed||opened)return;closed=true;clearTimeout(connectionTimer);peer.close();readyReject(new Error(message));};
  const armTimeout=(milliseconds,message)=>{clearTimeout(connectionTimer);if(!opened)connectionTimer=setTimeout(()=>failed(message),milliseconds);};
  const ready=()=>{if(!closed){opened=true;clearTimeout(connectionTimer);readyResolve(channel);}};
  const bind = value => {channel=value;channel.binaryType='arraybuffer';if(channel.readyState==='open')ready();else channel.addEventListener?.('open',ready,{once:true});};
  peer.addEventListener('datachannel',event=>{if(!closed)bind(event.channel);});
  peer.addEventListener('connectionstatechange',()=>{if(peer.connectionState==='failed')failed('Local connection failed. Check Wi-Fi and re-pair.');});
  try {
    if (role === 'offer') {bind(peer.createDataChannel('files-v1',{ordered:true}));await peer.setLocalDescription(await peer.createOffer());}
    else {await peer.setRemoteDescription(payload.description);await peer.setLocalDescription(await peer.createAnswer());}
    await waitForIce(peer,controller.signal);
    const local = {type:peer.localDescription.type,sdp:peer.localDescription.sdp};
    if (role === 'offer') offer=local; else answer=local;
    const result = {version:1,pairingId:payload?.pairingId || crypto.randomUUID(),role,expiresAt:payload?.expiresAt || clock()+300000,description:local};
    armTimeout(Math.max(1,result.expiresAt-clock()),'Pairing expired. Create and exchange new QR codes.');
    return {
      payload:result,peer,channelReady,
      async applyAnswer(value) {if(closed)throw new Error('Pairing closed.');validatePairing(value,clock());if(role!=='offer'||value.role!=='answer'||value.pairingId!==result.pairingId)throw new Error('Answer does not match this session.');answer=value.description;await peer.setRemoteDescription(answer);armTimeout(connectionTimeout,'Local connection timed out. Check that both devices share a local network without guest isolation, then re-pair.');},
      async verificationCode() {if(!offer||!answer)throw new Error('Finish exchanging pairing codes first.');return verificationCode(offer,answer);},
      close() {closed=true;clearTimeout(connectionTimer);controller.abort();channel?.close?.();peer.close();readyReject(new Error('Pairing closed.'));}
    };
  } catch(error) {controller.abort();peer.close();readyReject(error);throw error;}
}
