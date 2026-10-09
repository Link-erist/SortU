import {resolveIncluded} from '../organizer/inventory.js';
import {safeSegment} from '../organizer/paths.js';
import {acquireExportLock} from '../transfer/resources.js';
import {createLocalRuntime} from './runtime.js';
import {extractContent} from './extract.js';
import {CATEGORIES,validateGuidance,validateSuggestion} from './schema.js';
export const MODEL_ID='Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
// Spell near-matches of a preferred category the list's way (case, spacing, singular/plural); keep any other category as written.
const categoryKey=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'').replace(/s$/,'');
const PREFERRED=new Map(CATEGORIES.map(name=>[categoryKey(name),name]));
// Invisible formatting characters (zero-width, bidi overrides) could make two folders look identical in review.
const preferredCategory=category=>{const visible=category.replace(/\p{Cf}/gu,'').trim()||'Other';return PREFERRED.get(categoryKey(visible))||visible;};
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
     // A model may overlook exclusion intent. Every nonempty guide gets a
     // metadata-only inclusion review before any source content is read.
     if(guide.trim()) {
      if(patterns.length+guidance.exclusionPatterns.length>20)throw new Error('The guide adds too many exclusion patterns (at most 20 in total with your rules). Use fewer or broader exclusions in the guide.');
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
     if(content.status==='text'&&content.text.trim().length<80&&(content.text.match(/\p{L}[\p{L}\p{N}'-]*/gu)||[]).length<12)content={...content,status:'no-text',evidence:'Text has too little context for this AI profile; metadata used (under 80 characters and 12 words).'};
     let suggestion={fileId:entry.id,category:entry.category,stem:safeSegment(entry.stem).slice(0,100),reason:'Metadata-only fallback.',sufficient:false},kind='metadata';
     if(content.status==='text') {
      onProgress({stage:'Understanding file',path:entry.sourcePath,completed:suggestions.length,total:selection.included.length});
      const alias=`f${suggestions.length+1}`;
      const confirmedGuide=guidance?`${guide}\nConfirmed grouping preference: ${guidance.grouping}\nConfirmed naming preference: ${guidance.naming}`:guide;
      const result=await runtime.generate({kind:'file',guide:confirmedGuide,entry:{id:alias,name:entry.name},text:content.text,rules,revision});check();
      const validated=validateSuggestion(result.raw,{fileId:alias});
       // Small models tend to copy run-on phrases; keep the model's words but in a short, consistent filename shape.
       const words=validated.stem.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0,6);
       suggestion=Object.freeze({...validated,fileId:entry.id,category:preferredCategory(validated.category),stem:words.length?words.join('-'):validated.stem});kind=suggestion.sufficient?(content.truncated||result.truncated?'truncated':'text'):'metadata';
     }
     const detail=String(content.evidence||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,300),status=content.status;
     content=null;suggestions.push(suggestion);evidence.push({fileId:entry.id,kind,status,detail});
    }
    check();return {suggestions,evidence,model:MODEL_ID,excludedIds:selection.excluded.map(item=>item.entry.id),guidance};
   }catch(error){
    // Shared resources (such as the export lock) word their own cancel errors; report this job's cancel consistently.
    if(controller.signal.aborted)throw new Error('AI analysis canceled.');throw error;
   }finally {try{await runtime?.unload();}catch{}runtime?.dispose();release?.();signal?.removeEventListener('abort',abort);active=null;}
  },
  dispose(){active?.abort();}
 };
}
