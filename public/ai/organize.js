import {resolveIncluded} from '../organizer/inventory.js';
import {safeSegment} from '../organizer/paths.js';
import {acquireExportLock} from '../transfer/resources.js';
import {createLocalRuntime} from './runtime.js';
import {extractContent} from './extract.js';
import {CATEGORIES,validateGuidance,validateMerges,validateSuggestion} from './schema.js';
export const MODEL_ID='Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
// Spell near-matches of a preferred category the list's way (case, spacing, singular/plural); keep any other category as written.
const categoryKey=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'').replace(/s$/,'');
// Invisible formatting characters (zero-width, bidi overrides) could make two folders look identical in review.
const visibleText=value=>value.replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim();
const preferredCategory=(category,preferred)=>{const visible=visibleText(category)||'Other';return preferred.get(categoryKey(visible))||visible;};
const modifiedDate=time=>Number.isFinite(time)?new Date(time).toISOString().slice(0,10):'';
// Review step: the model sees only category/topic group summaries (never file names or content) and may join
// near-duplicate topics in the same category. Any invalid or failed response leaves the topics unchanged.
const MAX_MERGE_GROUPS=60;
async function mergeTopics(runtime,suggestions,revision,check) {
 const groups=[],byKey=new Map();
 for(const suggestion of suggestions) {
  if(!suggestion.sufficient||!suggestion.topic)continue;const key=suggestion.category+'\u0000'+suggestion.topic;
  if(!byKey.has(key)){if(groups.length>=MAX_MERGE_GROUPS)continue;const group={id:`g${groups.length+1}`,category:suggestion.category,topic:suggestion.topic,count:0};groups.push(group);byKey.set(key,group);}
  byKey.get(key).count++;
 }
 const categories=new Set(groups.map(group=>group.category));if(groups.length<2||categories.size===groups.length)return suggestions;
 let target;try{target=validateMerges((await runtime.generate({kind:'merge',groups,revision})).raw,groups);}catch{check();return suggestions;}
 check();const byId=new Map(groups.map(group=>[group.id,group]));
 return suggestions.map(suggestion=>{const group=byKey.get(suggestion.category+'\u0000'+suggestion.topic),into=group&&byId.get(target.get(group.id));
  return into?Object.freeze({...suggestion,topic:into.topic,reason:`${suggestion.reason} Grouped with ${into.topic}.`.slice(0,300)}):suggestion;});
}
export function createAiOrganizer({runtimeFactory=createLocalRuntime,extractor=extractContent}={}) {
 let active=null;
 return {
  async analyze({inventory,rules,exclusions={},guide='',revision,categories=CATEGORIES},{signal,onProgress=()=>{},onGuideReview}={}) {
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
    const preferred=new Map(categories.map(name=>[categoryKey(name),name]));
    for(const entry of selection.included) {
     check();let content=await extractor(entry,{signal:controller.signal,onProgress});check();
     if(content.fileId!==entry.id)throw new Error('Extraction returned a different file ID.');
     if(content.status==='text'&&content.text.trim().length<80&&(content.text.match(/\p{L}[\p{L}\p{N}'-]*/gu)||[]).length<12)content={...content,status:'no-text',evidence:'Text has too little context for this AI profile; metadata used (under 80 characters and 12 words).'};
     let suggestion={fileId:entry.id,category:entry.category,stem:safeSegment(entry.stem).slice(0,100),reason:'Metadata-only fallback.',sufficient:false},kind='metadata';
     if(content.status==='text') {
      onProgress({stage:'Understanding file',path:entry.sourcePath,completed:suggestions.length,total:selection.included.length});
      const alias=`f${suggestions.length+1}`;
      const confirmedGuide=guidance?`${guide}\nConfirmed grouping preference: ${guidance.grouping}\nConfirmed naming preference: ${guidance.naming}`:guide;
      // Other files' names are not sent: in real-model tests they made this model mark clear documents insufficient.
      const metadata={id:alias,name:entry.name,folder:entry.sourcePath.split('/').slice(0,-1).join('/'),extension:entry.extension,size:entry.size,modified:modifiedDate(entry.lastModified)};
      const result=await runtime.generate({kind:'file',guide:confirmedGuide,entry:metadata,text:content.text,rules,categories,revision});check();
      const validated=validateSuggestion(result.raw,{fileId:alias});
       // Small models tend to copy run-on phrases; keep the model's words but in a short, consistent filename shape.
       const words=validated.stem.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0,6);
       suggestion=Object.freeze({...validated,fileId:entry.id,category:preferredCategory(validated.category,preferred),topic:visibleText(validated.topic).split(' ').slice(0,3).join(' '),stem:words.length?words.join('-'):validated.stem});kind=suggestion.sufficient?(content.truncated||result.truncated?'truncated':'text'):'metadata';
     }
     const detail=String(content.evidence||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,300),status=content.status;
     content=null;suggestions.push(suggestion);evidence.push({fileId:entry.id,kind,status,detail});
    }
    check();onProgress({stage:'Grouping related files'});const grouped=await mergeTopics(runtime,suggestions,revision,check);
    check();return {suggestions:grouped,evidence,model:MODEL_ID,excludedIds:selection.excluded.map(item=>item.entry.id),guidance};
   }catch(error){
    // Shared resources (such as the export lock) word their own cancel errors; report this job's cancel consistently.
    if(controller.signal.aborted)throw new Error('AI analysis canceled.');throw error;
   }finally {try{await runtime?.unload();}catch{}runtime?.dispose();release?.();signal?.removeEventListener('abort',abort);active=null;}
  },
  dispose(){active?.abort();}
 };
}
