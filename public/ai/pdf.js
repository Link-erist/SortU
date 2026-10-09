export async function extractPdf(file,{signal,pdfFactory,timeout=30000}={}) {
 let document=null,loading=null,worker=null,timer,abort,stopped=false,stopReason='PDF analysis canceled.',rejectStopped;
 const check=()=>{if(stopped||signal?.aborted)throw new Error(stopReason);};check();
 async function destroyDocument(candidate){try{if(typeof candidate?.destroy==='function')await candidate.destroy();else await candidate?.loadingTask?.destroy();}catch{}}
 async function adopt(candidate){if(stopped||signal?.aborted){await destroyDocument(candidate);throw new Error(stopReason);}document=candidate;return candidate;}
 const stop=message=>{if(stopped)return;stopped=true;stopReason=message;rejectStopped?.(new Error(message));};
 try {
  const interrupted=new Promise((_,reject)=>{rejectStopped=reject;abort=()=>stop('PDF analysis canceled.');signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>stop('PDF analysis timed out.'),timeout);});
  const operation=(async()=>{
   const bytes=new Uint8Array(await file.arrayBuffer());check();
   if(pdfFactory)await adopt(await pdfFactory(bytes));
   else {
    const pdf=await import('../vendor/pdf/pdf.js');check();pdf.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf/pdf.worker.js',import.meta.url).href;
    worker=new pdf.PDFWorker();loading=pdf.getDocument({data:bytes,worker,isEvalSupported:false,cMapUrl:new URL('../vendor/pdf/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../vendor/pdf/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../vendor/pdf/wasm/',import.meta.url).href,disableAutoFetch:true,disableStream:true});
    loading.onPassword=()=>stop('Password-protected PDF must be decrypted before analysis.');await adopt(await loading.promise);
   }
   check();let text='',truncated=document.numPages>20;
   for(let page=1;page<=Math.min(20,document.numPages);page++) {
    check();const content=await(await document.getPage(page)).getTextContent();check();
    const part=content.items.map(item=>typeof item.str==='string'?item.str:'').join(' ')+'\n';
    const available=32000-text.length;text+=part.slice(0,available);if(part.length>available){truncated=true;break;}
   }
   return {text,status:text.trim()?'text':'no-text',truncated,evidence:text.trim()?'Embedded PDF text.':'No embedded PDF text; OCR is not available in this milestone.'};
  })();
  return await Promise.race([operation,interrupted]);
 }finally {
  stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
  if(!loading)worker?.destroy();
  if(loading){let cleanupTimer;try{await Promise.race([loading.destroy().catch(()=>{}),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,250);})]);}finally{clearTimeout(cleanupTimer);worker?.destroy();}}
  else if(document)await destroyDocument(document);
 }
}
