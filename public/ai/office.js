// Reads text from modern Office (.docx/.pptx/.xlsx) and OpenDocument (.odt/.odp/.ods) files for AI analysis.
// These are ZIP archives of XML. Only the archive index and the needed XML parts are read, through bounded slices,
// and every part's size is capped before it is decompressed, so a small "ZIP bomb" cannot expand into a huge one.
import {inflateSync} from '../vendor/inflate.js';
const MAX_SOURCE=50*1024*1024,MAX_ENTRIES=2000,MAX_PART=8*1024*1024,MAX_TOTAL=16*1024*1024,MAX_TEXT=32000;
const KINDS={'.docx':'Word','.pptx':'PowerPoint','.xlsx':'Excel','.odt':'OpenDocument','.odp':'OpenDocument','.ods':'OpenDocument'};
export const OFFICE_EXTENSIONS=Object.keys(KINDS);
export const LEGACY_OFFICE_EXTENSIONS=['.doc','.ppt','.xls'];
const damaged=()=>new Error('This document is not a valid Office file, or it is damaged or encrypted.');
async function readZipIndex(file,check) {
 const tailSize=Math.min(file.size,65557),tail=new DataView(await file.slice(file.size-tailSize).arrayBuffer());check();
 let end=-1;for(let i=tail.byteLength-22;i>=0;i--)if(tail.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw damaged();
 const count=tail.getUint16(end+10,true),size=tail.getUint32(end+12,true),offset=tail.getUint32(end+16,true);
 if(count===0xffff||offset===0xffffffff)throw new Error('Very large (ZIP64) documents are not supported.');
 if(count>MAX_ENTRIES)throw new Error('This document has too many internal parts to analyze safely.');
 if(offset+size>file.size)throw damaged();
 const directory=new DataView(await file.slice(offset,offset+size).arrayBuffer());check();const entries=new Map(),decoder=new TextDecoder();
 for(let at=0,i=0;i<count;i++) {
  if(at+46>directory.byteLength||directory.getUint32(at,true)!==0x02014b50)throw damaged();
  const flags=directory.getUint16(at+8,true),method=directory.getUint16(at+10,true),compressed=directory.getUint32(at+20,true),uncompressed=directory.getUint32(at+24,true);
  const nameLength=directory.getUint16(at+28,true),extra=directory.getUint16(at+30,true),comment=directory.getUint16(at+32,true),local=directory.getUint32(at+42,true);
  const name=decoder.decode(new Uint8Array(directory.buffer,directory.byteOffset+at+46,nameLength));
  if(flags&1)throw new Error('Password-protected documents cannot be analyzed.');
  entries.set(name,{method,compressed,uncompressed,local});at+=46+nameLength+extra+comment;
 }
 return entries;
}
async function readPart(file,part,budget,check) {
 if(part.uncompressed>MAX_PART||part.uncompressed>budget.left)throw new Error('This document is too large to analyze (internal size limit).');
 const header=new DataView(await file.slice(part.local,part.local+30).arrayBuffer());check();
 if(header.byteLength<30||header.getUint32(0,true)!==0x04034b50)throw damaged();
 const start=part.local+30+header.getUint16(26,true)+header.getUint16(28,true),data=new Uint8Array(await file.slice(start,start+part.compressed).arrayBuffer());check();
 if(data.length!==part.compressed)throw damaged();
 let bytes;
 if(part.method===0)bytes=data;
 else if(part.method===8){try{bytes=inflateSync(data,{out:new Uint8Array(part.uncompressed)});}catch{throw damaged();}}
 else throw new Error('This document uses an unsupported compression method.');
 if(bytes.length!==part.uncompressed)throw damaged();
 budget.left-=bytes.length;return new TextDecoder().decode(bytes);
}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const decodeEntities=text=>text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,code)=>code[0]==='#'?(()=>{const value=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);return value>0&&value<=0x10ffff?String.fromCodePoint(value):'';})():entities[code]??match);
// Text between opening and closing text tags; each paragraph tag ends a line.
function extractXml(xml,textTags,paragraphTags) {
 const lines=[];let current='',depth=0;const pattern=/<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)/g;
 for(const [,closing,name,selfClosing,body] of xml.matchAll(pattern)) {
  if(body!==undefined){if(depth>0)current+=decodeEntities(body);continue;}
  if(textTags.includes(name)&&!selfClosing)depth+=closing?-1:1;
  if(paragraphTags.includes(name)&&(closing||selfClosing)){if(current.trim())lines.push(current.trim());current='';}
 }
 if(current.trim())lines.push(current.trim());return lines;
}
export async function extractOffice(file,extension,{signal}={}) {
 const check=()=>{if(signal?.aborted)throw new Error('File analysis canceled.');};check();
 if(file.size>MAX_SOURCE)throw new Error('Document exceeds the 50 MiB analysis limit.');
 const entries=await readZipIndex(file,check),budget={left:MAX_TOTAL},part=name=>entries.has(name)?readPart(file,entries.get(name),budget,check):Promise.resolve('');let lines=[];
 if(extension==='.docx')lines=extractXml(await part('word/document.xml'),['w:t'],['w:p']);
 else if(extension==='.pptx') {
  const slides=[...entries.keys()].filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  for(const slide of slides){lines.push(...extractXml(await part(slide),['a:t'],['a:p']));if(lines.join('\n').length>MAX_TEXT)break;}
 }
 else if(extension==='.xlsx') {
  const workbook=await part('xl/workbook.xml');for(const [,name] of workbook.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g))lines.push(decodeEntities(name));
  lines.push(...extractXml(await part('xl/sharedStrings.xml'),['t'],['si']));
 }
 else lines=extractXml(await part('content.xml'),['text:p','text:h'],['text:p','text:h']);
 let text=lines.join('\n');const truncated=text.length>MAX_TEXT;if(truncated)text=text.slice(0,MAX_TEXT);
 return {text,status:text.trim()?'text':'no-text',truncated,evidence:`${KINDS[extension]} document text${truncated?' (first 32,000 characters)':''}.`};
}
