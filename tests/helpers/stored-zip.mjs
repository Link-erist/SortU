import assert from 'node:assert/strict';
// Independent stored-ZIP reader: central directory boundaries and CRC32.
function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function readStoredZip(buffer) {
  const data=new Uint8Array(buffer.buffer||buffer,buffer.byteOffset||0,buffer.byteLength),view=new DataView(data.buffer,data.byteOffset,data.byteLength),entries=Object.create(null);
  let end=data.length-22;while(end>=Math.max(0,data.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
  assert.ok(end>=0,'ZIP end directory exists');const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true);
  for(let i=0;i<count;i++) {
    assert.equal(view.getUint32(offset,true),0x02014b50);assert.equal(view.getUint16(offset+10,true),0);
    const size=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
    assert.equal(size,view.getUint32(offset+20,true));const name=new TextDecoder().decode(data.subarray(offset+46,offset+46+nameLength));assert.equal(Object.hasOwn(entries,name),false);
    const local=view.getUint32(offset+42,true);assert.equal(view.getUint32(local,true),0x04034b50);
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),bytes=data.slice(start,start+size);
    assert.equal(bytes.length,size);assert.equal(crc32(bytes),view.getUint32(offset+16,true),'entry CRC32');entries[name]=bytes;offset+=46+nameLength+extra+comment;
  }
  assert.equal(offset,view.getUint32(end+16,true)+view.getUint32(end+12,true));return entries;
}
