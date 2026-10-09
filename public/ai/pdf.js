export async function extractPdf(file,{signal,pdfFactory,timeout=30000}={}) {
 let document=null,loading=null,worker=null,timer,abort;
 const check=()=>{if(signal?.aborted)throw new Error('PDF analysis canceled.');};check();
 try {
  const operation=(async()=>{
   const bytes=new Uint8Array(await file.arrayBuffer());check();
   if(pdfFactory)document=await pdfFactory(bytes);
   else {
    const pdf=await import('../vendor/pdf/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf/pdf.worker.mjs',import.meta.url).href;
    worker=new pdf.PDFWorker();loading=pdf.getDocument({data:bytes,worker,isEvalSupported:false,cMapUrl:new URL('../vendor/pdf/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../vendor/pdf/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../vendor/pdf/wasm/',import.meta.url).href,disableAutoFetch:true,disableStream:true});
    loading.onPassword=()=>{void loading.destroy();};document=await loading.promise;
   }
   check();let text='',truncated=document.numPages>20;
   for(let page=1;page<=Math.min(20,document.numPages);page++) {
    check();const content=await(await document.getPage(page)).getTextContent();check();
    const part=content.items.map(item=>typeof item.str==='string'?item.str:'').join(' ')+'\n';
    const available=32000-text.length;text+=part.slice(0,available);if(part.length>available){truncated=true;break;}
   }
   return {text,status:text.trim()?'text':'no-text',truncated,evidence:text.trim()?'Embedded PDF text.':'No embedded PDF text; OCR is not available in this milestone.'};
  })();
  const stopped=new Promise((_,reject)=>{abort=()=>reject(new Error('PDF analysis canceled.'));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(new Error('PDF analysis timed out.')),timeout);});
  return await Promise.race([operation,stopped]);
 }finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.destroy();if(document)await document.destroy().catch(()=>{});else if(loading)void loading.destroy().catch(()=>{});}
}
