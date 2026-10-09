import {resolveIncluded} from '../organizer/inventory.js';
import {safeSegment} from '../organizer/paths.js';
import {acquireExportLock} from '../transfer/resources.js';
import {createLocalRuntime} from './runtime.js';
import {extractContent} from './extract.js';
import {validateGuidance,validateSuggestion} from './schema.js';
export const MODEL_ID='Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export function createAiOrganizer({runtimeFactory=createLocalRuntime,extractor=extractContent}={}) {
 let active=null;
 return {
  async analyze({inventory,rules,exclusions={},guide='',revision},{signal,onProgress=()=>{},onGuideReview}={}) {
   if(active)throw new Error('AI analysis is already running.');const controller=new AbortController();active=controller;
   const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const check=()=>{if(controller.signal.aborted)throw new Error('AI analysis canceled.');};let release,runtime;
   try {
    onProgress({stage:'Waiting for AI resources'});release=await acquireExportLock('organizer-ai',controller.signal);check();
    runtime=runtimeFactory({signal:controller.signal,onProgress});await runtime.verifyOffline();check();
    let guidance=null,extraIds=[],patterns=[...rules.patterns];
    if(guide.trim()) {
     guidance=validateGuidance((await runtime.generate({kind:'guide',guide,revision})).raw);check();
     if(guidance.blockedReason)throw new Error(`Unsupported guide action: ${guidance.blockedReason}`);
     onProgress({stage:'Guide interpreted',summary:guidance.summary});
     if(guidance.needsConfirmation||guidance.exclusionPatterns.length) {
      if(!onGuideReview)throw new Error('Confirm guide exclusions before reading files.');
      const review=await onGuideReview(guidance);check();if(!review?.confirmed)throw new Error('Guide review canceled. No files were analyzed.');extraIds=review.excludedIds||[];
     }
     patterns=[...patterns,...guidance.exclusionPatterns];
    }
    if(extraIds.some(id=>!inventory.entries.some(entry=>entry.id===id)))throw new Error('Guide review refers to an unselected file.');
    const selection=resolveIncluded(inventory,{excludedIds:[...(exclusions.excludedIds||[]),...extraIds],patterns});
    if(!selection.included.length)throw new Error('Include at least one file for AI analysis.');
    const suggestions=[],evidence=[];
    for(const entry of selection.included) {
     check();let content=await extractor(entry,{signal:controller.signal,onProgress});check();
     if(content.fileId!==entry.id)throw new Error('Extraction returned a different file ID.');
     let suggestion={fileId:entry.id,category:entry.category,stem:safeSegment(entry.stem).slice(0,100),reason:'Metadata-only fallback.',sufficient:false},kind='metadata';
     if(content.status==='text') {
      onProgress({stage:'Understanding file',path:entry.sourcePath,completed:suggestions.length,total:selection.included.length});
      const result=await runtime.generate({kind:'file',guide,entry:{id:entry.id,name:entry.name},text:content.text,rules,revision});check();
      suggestion=validateSuggestion(result.raw,{fileId:entry.id});kind=suggestion.sufficient?(content.truncated||result.truncated?'truncated':'text'):'metadata';
     }
     content=null;suggestions.push(suggestion);evidence.push({fileId:entry.id,kind});
    }
    check();return {suggestions,evidence,model:MODEL_ID,excludedIds:selection.excluded.map(item=>item.entry.id),guidance};
   }finally {try{await runtime?.unload();}catch{}runtime?.dispose();release?.();signal?.removeEventListener('abort',abort);active=null;}
  },
  dispose(){active?.abort();}
 };
}
