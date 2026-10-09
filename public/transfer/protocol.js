export const LIMITS = Object.freeze({control:131072,files:100,chunk:32768,queue:1048576,blob:67108864,header:49});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw new Error('Invalid transfer identity.');};
const safePath=value=>typeof value==='string'&&value.length>0&&value.length<=1024&&!/[\u0000-\u001f\u007f\\:]/.test(value)&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
export function validateManifest(value) {
  if(!value||!Array.isArray(value.files)||value.files.length<1||value.files.length>LIMITS.files)throw new Error('Select between 1 and 100 files.');
  id(value.transferId);const ids=new Set(),paths=new Set();let total=0;
  for(const entry of value.files){id(entry.id);if(typeof entry.name!=='string'||entry.name.length>255||entry.name.includes('/')||!safePath(entry.name)||!safePath(entry.path)||!integer(entry.size))throw new Error('Invalid file name, path, or size.');const path=entry.path.normalize('NFC').toLowerCase();if(ids.has(entry.id)||paths.has(path))throw new Error('Duplicate file identity or path.');ids.add(entry.id);paths.add(path);total+=entry.size;if(!Number.isSafeInteger(total))throw new Error('Transfer size too large.');}
  if(JSON.stringify(value).length>LIMITS.control)throw new Error('Manifest too large.');return value;
}
export function parseControl(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMITS.control)throw new Error('Control message too large.');
  const m=JSON.parse(text);if(!m||m.v!==1||!['hello','manifest','accept','reject','ack','complete','completed','status','cancel','resume','error'].includes(m.type))throw new Error('Unsupported transfer message.');
  if(m.type==='hello'){if(typeof m.verified!=='boolean')throw new Error('Invalid pairing confirmation.');return m;}
  id(m.transferId);
  if(m.type==='manifest')validateManifest(m);
  if(['ack','complete','completed','status','resume'].includes(m.type))id(m.fileId);
  if(['ack','resume'].includes(m.type)&&!integer(m.offset))throw new Error('Invalid confirmed offset.');
  if(m.type==='accept'&&(!Array.isArray(m.fileIds)||m.fileIds.length<1||m.fileIds.length>LIMITS.files||new Set(m.fileIds).size!==m.fileIds.length))throw new Error('Invalid accepted files.');
  if(m.type==='accept')m.fileIds.forEach(id);
  if(['complete','resume'].includes(m.type)&&!/^[0-9a-f]{64}$/.test(m.digest||''))throw new Error('Invalid file digest.');
  if(m.type==='completed'&&!['verified','saved','export-requested'].includes(m.state))throw new Error('Invalid completion state.');
  if(m.type==='error'&&(typeof m.message!=='string'||m.message.length>500))throw new Error('Invalid error message.');
  return m;
}
const uuidBytes=value=>Uint8Array.from(value.replaceAll('-','').match(/../g),x=>parseInt(x,16));
const uuidText=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
export function encodeChunk(meta,bytes) {
  id(meta.transferId);id(meta.fileId);if(!integer(meta.offset)||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>LIMITS.chunk)throw new Error('Invalid file chunk.');
  const result=new Uint8Array(LIMITS.header+bytes.length);result[0]=1;result.set(uuidBytes(meta.transferId),1);result.set(uuidBytes(meta.fileId),17);new DataView(result.buffer).setFloat64(33,meta.offset);new DataView(result.buffer).setUint32(41,bytes.length);result.set(bytes,LIMITS.header);return result.buffer;
}
export function decodeChunk(buffer) {
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<=LIMITS.header||buffer.byteLength>LIMITS.header+LIMITS.chunk)throw new Error('Invalid chunk length.');
  const bytes=new Uint8Array(buffer);const view=new DataView(buffer);const offset=view.getFloat64(33);if(bytes[0]!==1||!integer(offset)||view.getUint32(41)!==bytes.length-LIMITS.header||view.getUint32(45)!==0)throw new Error('Invalid chunk header.');
  return {transferId:uuidText(bytes.subarray(1,17)),fileId:uuidText(bytes.subarray(17,33)),offset,bytes:bytes.slice(LIMITS.header)};
}
