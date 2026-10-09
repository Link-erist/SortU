import {resolveIncluded} from '../organizer/inventory.js';
import {extractPdf} from './pdf.js';
import {extractOffice,LEGACY_OFFICE_EXTENSIONS,OFFICE_EXTENSIONS} from './office.js';
export async function extractContent(entry,{signal,pdfFactory,onProgress=()=>{}}={}) {
 const check=()=>{if(signal?.aborted)throw new Error('File analysis canceled.');};check();
 const base={fileId:entry.id,text:'',status:'unsupported',truncated:false,evidence:'Metadata only: this format is not analyzed.'};
 try {
  onProgress({stage:'Reading selected file',path:entry.sourcePath});
  if(entry.extension.toLowerCase()==='.pdf') {
   if(entry.size>10485760)return {...base,status:'error',evidence:'PDF exceeds the 10 MiB analysis limit.'};
   return {...base,...await extractPdf(entry.file,{signal,pdfFactory})};
  }
  const extension=entry.extension.toLowerCase();
  if(OFFICE_EXTENSIONS.includes(extension))return {...base,...await extractOffice(entry.file,extension,{signal})};
  if(LEGACY_OFFICE_EXTENSIONS.includes(extension))return {...base,evidence:'Older Office format: content not read; organized by name and metadata.'};
  if(!['.txt','.md','.csv','.json','.log'].includes(extension))return base;
  const limit=Math.min(entry.size,65536),bytes=new Uint8Array(await entry.file.slice(0,limit).arrayBuffer());check();
  if(bytes.length!==limit)throw new Error('Source file changed during analysis.');
  if(bytes.includes(0))throw new Error('Binary content is not supported as text.');
  const truncated=entry.size>limit,decoder=new TextDecoder('utf-8',{fatal:true});
  // Streaming decode omits only an incomplete terminal character in a bounded
  // prefix. Invalid UTF-8 before that boundary still fails.
  const text=decoder.decode(bytes,{stream:truncated});
  return {...base,text,status:text.trim()?'text':'no-text',truncated,evidence:truncated?'Text prefix limited to 64 KiB.':'UTF-8 text.'};
 }catch(error){check();return {...base,status:'error',evidence:error.message};}
}
export async function* extractIncluded(inventory,{excludedIds=[],patterns=[],signal,onProgress}={}) {
 for(const entry of resolveIncluded(inventory,{excludedIds,patterns}).included)yield await extractContent(entry,{signal,onProgress});
}
