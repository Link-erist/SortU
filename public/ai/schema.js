// Preferred folders suggested to the model. Not grammar-enforced: forcing the list made this model choose Other for clear documents.
export const CATEGORIES=Object.freeze(['Invoices','Receipts','Finance','Meeting Notes','School','Projects','Resumes','Travel','Recipes','Contracts','Letters','Health','Personal','Other']);
const parse=raw=>{if(typeof raw!=='string'||new TextEncoder().encode(raw).length>8192)throw new Error('AI response exceeds the 8 KiB limit.');const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('AI response must be a JSON object.');return value;};
function keys(value,allowed){if(Object.keys(value).some(key=>!allowed.includes(key))||allowed.some(key=>!Object.hasOwn(value,key)))throw new Error('AI response contains unexpected or missing fields.');}
function string(value,max,{empty=false,path=false}={}){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000-\u001f\u007f]/.test(value)||(path&&/[\\/:]/.test(value)))throw new Error('Invalid AI text or path component.');return value;}
export function validateSuggestion(raw,{fileId}) {
 const parsed=parse(raw);
 // topic (the subfolder within the category) is optional on input so older callers stay valid; it defaults to empty.
 const value={topic:'',...parsed};keys(value,['fileId','category','topic','stem','reason','sufficient']);if(value.fileId!==fileId||typeof value.sufficient!=='boolean')throw new Error('AI response refers to a different file or invalid evidence.');
 string(value.category,60,{path:true});string(value.topic,60,{empty:true,path:true});string(value.stem,100,{path:true});string(value.reason,300,{empty:true});
 if([value.category,value.topic,value.stem,value.reason].some(text=>/\b\d+(?:-\d+)? characters\b|\bbrief explanation\b/i.test(text)))throw new Error('AI copied placeholder instructions instead of useful evidence.');
 if([value.stem,value.category,value.topic].some(part=>part==='.'||part==='..'))throw new Error('Invalid AI path component.');return Object.freeze(value);
}
// Merges may only join groups of the same category. Chains resolve to their final group; cycles are refused.
export function validateMerges(raw,groups) {
 const value=parse(raw);keys(value,['merges']);if(!Array.isArray(value.merges)||value.merges.length>groups.length)throw new Error('Invalid AI grouping response.');
 const byId=new Map(groups.map(group=>[group.id,group])),next=new Map();
 for(const merge of value.merges) {
  keys(merge,['from','into']);const from=byId.get(merge.from),into=byId.get(merge.into);
  if(!from||!into||from===into||from.category!==into.category||next.has(from.id))throw new Error('Invalid AI grouping response.');
  next.set(from.id,into.id);
 }
 const target=new Map();
 for(const id of next.keys()){const seen=new Set([id]);let current=next.get(id);while(next.has(current)){if(seen.has(current))throw new Error('Invalid AI grouping response.');seen.add(current);current=next.get(current);}target.set(id,current);}
 return target;
}
export function validateGuidance(raw) {
 const value=parse(raw);keys(value,['summary','grouping','naming','exclusionPatterns','needsConfirmation','blockedReason']);
 string(value.summary,1000,{empty:true});string(value.grouping,500,{empty:true});string(value.naming,500,{empty:true});string(value.blockedReason,300,{empty:true});
 if(typeof value.needsConfirmation!=='boolean'||!Array.isArray(value.exclusionPatterns)||value.exclusionPatterns.length>20)throw new Error('Invalid AI exclusion interpretation.');
 for(const pattern of value.exclusionPatterns)string(pattern,256);return Object.freeze({...value,exclusionPatterns:Object.freeze([...value.exclusionPatterns])});
}
export function responseFormat(kind,fileId) {
 if(kind==='merge'){const ids=[...fileId];return {type:'json_object',schema:JSON.stringify({type:'object',properties:{merges:{type:'array',maxItems:ids.length,items:{type:'object',properties:{from:{type:'string',enum:ids},into:{type:'string',enum:ids}},required:['from','into'],additionalProperties:false}}},required:['merges'],additionalProperties:false})};}
 const text=maxLength=>({type:'string',maxLength});
 const properties=kind==='warmup'?{ok:{type:'boolean',enum:[true]}}:kind==='guide'?{summary:text(1000),grouping:text(500),naming:text(500),exclusionPatterns:{type:'array',maxItems:20,items:text(256)},needsConfirmation:{type:'boolean'},blockedReason:text(300)}:{fileId:{type:'string',enum:[fileId]},category:text(60),topic:text(60),stem:text(100),reason:text(300),sufficient:{type:'boolean'}};
 return {type:'json_object',schema:JSON.stringify({type:'object',properties,required:Object.keys(properties),additionalProperties:false})};
}
