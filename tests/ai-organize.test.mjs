import test from 'node:test';import assert from 'node:assert/strict';import {createInventory} from '../public/organizer/inventory.js';import {defaultRules} from '../public/organizer/rules.js';import {createOrganizerSession} from '../public/organizer/proposal.js';
const runtime=()=>({verifyOffline:async()=>{},generate:async({kind,entry})=>({raw:JSON.stringify(kind==='guide'?{summary:'Skip private',grouping:'subject',naming:'descriptive',exclusionPatterns:['private*'],needsConfirmation:true,blockedReason:''}:{fileId:entry.id,category:'Invoices',stem:'invoice-acme',reason:'Invoice content.',sufficient:true})}),unload:async()=>{},dispose(){}});
test('unconfirmed guide exclusions stop before extraction',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');let reads=0;const ai=createAiOrganizer({runtimeFactory:runtime,extractor:async()=>{reads++;}});
 await assert.rejects(()=>ai.analyze({inventory:createInventory([new File(['secret'],'private.txt')]),rules:defaultRules(),guide:'Exclude private files',revision:'one'},{onGuideReview:async()=>({confirmed:false})}),/confirm|cancel/);assert.equal(reads,0);
});
test('analysis reads only included files, returns typed suggestions and unloads before export',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');let unloads=0;const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),unload:async()=>unloads++}),extractor:async entry=>({fileId:entry.id,text:'Invoice',status:'text',truncated:false,evidence:'Text'})});
 const inventory=createInventory([new File(['invoice'],'one.txt'),new File(['secret'],'private.txt')]);const result=await ai.analyze({inventory,rules:defaultRules(),guide:'Skip private',revision:'one'},{onGuideReview:async()=>({confirmed:true,excludedIds:[]})});assert.equal(result.suggestions.length,1);assert.equal(result.excludedIds[0],inventory.entries[1].id);assert.equal(unloads,1);
});
test('AI session tickets are opaque, stale results are refused and paths preserve extensions',async()=>{
 const session=createOrganizerSession(),inventory=createInventory([new File(['invoice'],'opaque.tar.gz')]);session.setInputs({inventory,rules:defaultRules()});const ticket=session.beginAnalysis({modelId:'model',guideDigest:'one',manualKeys:[]});
 const result={suggestions:[{fileId:inventory.entries[0].id,category:'Invoices',stem:'acme-invoice',reason:'Invoice text.',sufficient:true}],evidence:[{fileId:inventory.entries[0].id,kind:'text'}],model:'model',excludedIds:[]};
 assert.throws(()=>session.acceptAnalysis({...ticket},result),/stale|ticket/);const proposal=session.acceptAnalysis(ticket,result);assert.equal(proposal.rows[0].targetPath,'Invoices/acme-invoice.tar.gz');const permit=session.approve();session.editTarget(inventory.entries[0].id,'Documents/manual.tar.gz');assert.throws(()=>session.resolveApproval(permit),/stale/);assert.throws(()=>session.acceptAnalysis(ticket,result),/stale|ticket/);
});
test('per-file extraction errors remain visible in the proposal',async()=>{
 const {createAiOrganizer,MODEL_ID}=await import('../public/ai/organize.js');const inventory=createInventory([new File(['pdf'],'large.pdf')]),rules=defaultRules();
 const ai=createAiOrganizer({runtimeFactory:runtime,extractor:async entry=>({fileId:entry.id,text:'',status:'error',truncated:false,evidence:'PDF exceeds the 10 MiB analysis limit.'})});const result=await ai.analyze({inventory,rules,guide:'',revision:'one'});
 const session=createOrganizerSession();session.setInputs({inventory,rules});const ticket=session.beginAnalysis({modelId:MODEL_ID,guideDigest:'',manualKeys:[]});const proposal=session.acceptAnalysis(ticket,result);assert.match(proposal.rows[0].reason,/10 MiB/);assert.equal(proposal.analysis.evidence[0].status,'error');
});
test('guide confirmation cannot depend on the model correctly noticing exclusion intent',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');let reads=0;
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async()=>({raw:JSON.stringify({summary:'Organize files',grouping:'subject',naming:'descriptive',exclusionPatterns:[],needsConfirmation:false,blockedReason:''})})}),extractor:async()=>{reads++;}});
 await assert.rejects(()=>ai.analyze({inventory:createInventory([new File(['secret'],'private.txt')]),rules:defaultRules(),guide:'Do not read private files',revision:'one'},{onGuideReview:async()=>({confirmed:false})}),/canceled/);assert.equal(reads,0);
});
test('very short text uses visible metadata fallback rather than a fabricated subject',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');let generated=0;const inventory=createInventory([new File(['Maybe later. Check the thing. No other context is available.'],'a.txt')]);const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async()=>{generated++;}})});
 const result=await ai.analyze({inventory,rules:defaultRules(),guide:'',revision:'one'});assert.equal(generated,0);assert.equal(result.evidence[0].kind,'metadata');assert.match(result.evidence[0].detail,/context/);
});
test('model filename stems are normalized to at most six lowercase hyphenated words',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const text='Meeting minutes for the Atlas project planning session with milestones, assigned testing and the next meeting date.';
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async({entry})=>({raw:JSON.stringify({fileId:entry.id,category:'Meeting Notes',stem:'Meeting minutes Atlas project planning attendees discussed milestones',reason:'Meeting minutes.',sufficient:true})})}),extractor:async entry=>({fileId:entry.id,text,status:'text',truncated:false,evidence:'Text'})});
 const result=await ai.analyze({inventory:createInventory([new File([text],'a.txt')]),rules:defaultRules(),guide:'',revision:'one'});assert.equal(result.suggestions[0].stem,'meeting-minutes-atlas-project-planning-attendees');
});
test('near-matches of the preferred categories use the list spelling; other categories are kept',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const text='A document with enough words to pass the short text gate and reach the local model for a suggestion.';const answers=['recipes','Meeting note','IT Support','invoice'];
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async({entry})=>({raw:JSON.stringify({fileId:entry.id,category:answers.shift(),stem:'example',reason:'Example.',sufficient:true})})}),extractor:async entry=>({fileId:entry.id,text,status:'text',truncated:false,evidence:'Text'})});
 const result=await ai.analyze({inventory:createInventory(['a','b','c','d'].map(name=>new File([text],name+'.txt'))),rules:defaultRules(),guide:'',revision:'one'});assert.deepEqual(result.suggestions.map(item=>item.category),['Recipes','Meeting Notes','IT Support','Invoices']);
});
test('canceling while queued behind another job reads nothing and leaves the lock usable',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const {acquireExportLock}=await import('../public/transfer/resources.js');const release=await acquireExportLock('other-job');let started=0,reads=0;
 const ai=createAiOrganizer({runtimeFactory:()=>{started++;return runtime();},extractor:async()=>{reads++;}});const controller=new AbortController(),inventory=createInventory([new File(['x'.repeat(200)],'a.txt')]);
 const queued=ai.analyze({inventory,rules:defaultRules(),guide:'',revision:'one'},{signal:controller.signal});controller.abort();await assert.rejects(()=>queued,/AI analysis canceled/);assert.equal(started,0);assert.equal(reads,0);
 release();const next=createAiOrganizer({runtimeFactory:runtime});assert.equal((await next.analyze({inventory,rules:defaultRules(),guide:'',revision:'two'})).suggestions.length,1);
});
test('GPU loss during generation fails the analysis, releases the runtime and allows a retry',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const text='Invoice from Acme Supplies for office paper and pens, total due at the end of the month, payment terms thirty days.';let calls=0,unloads=0,disposals=0;
 const lossy=()=>({...runtime(),generate:async args=>{if(++calls===2)throw new Error('Local AI graphics device was lost.');return runtime().generate(args);},unload:async()=>{unloads++;},dispose(){disposals++;}});
 const ai=createAiOrganizer({runtimeFactory:lossy,extractor:async entry=>({fileId:entry.id,text,status:'text',truncated:false,evidence:'Text'})}),inventory=createInventory([new File([text],'a.txt'),new File([text],'b.txt')]);
 await assert.rejects(()=>ai.analyze({inventory,rules:defaultRules(),guide:'',revision:'one'}),/device was lost/);assert.equal(unloads,1);assert.equal(disposals,1);
 assert.equal((await ai.analyze({inventory,rules:defaultRules(),guide:'',revision:'two'})).suggestions.length,2);
});
test('too many combined exclusion patterns are refused before the guide review, with an actionable message',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');let reviews=0;const patterns=Array.from({length:20},(_,i)=>`skip${i}*`);
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async()=>({raw:JSON.stringify({summary:'Skip',grouping:'subject',naming:'descriptive',exclusionPatterns:patterns,needsConfirmation:true,blockedReason:''})})})});
 await assert.rejects(()=>ai.analyze({inventory:createInventory([new File(['x'],'a.txt')]),rules:{...defaultRules(),patterns:['*.tmp']},guide:'Skip many things',revision:'one'},{onGuideReview:async()=>{reviews++;return {confirmed:true};}}),/guide.*exclusion|shorten|fewer/i);assert.equal(reviews,0);
});
test('invisible formatting characters are removed from model categories',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const text='Invoice from Acme Supplies for office paper and pens, total due at the end of the month, payment terms thirty days.';
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async({entry})=>({raw:JSON.stringify({fileId:entry.id,category:'Tax​es‮',stem:'invoice',reason:'Invoice.',sufficient:true})})}),extractor:async entry=>({fileId:entry.id,text,status:'text',truncated:false,evidence:'Text'})});
 assert.equal((await ai.analyze({inventory:createInventory([new File([text],'a.txt')]),rules:defaultRules(),guide:'',revision:'one'})).suggestions[0].category,'Taxes');
});
test('the model receives file metadata, categories and only included batch names; topics are cleaned',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const text='Software requirements specification for the Harbor inventory system with stock tracking and supplier reports.';const seen=[];
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async args=>{seen.push(args);return {raw:JSON.stringify({fileId:args.entry.id,category:'Projects',topic:'Har​bor ',stem:'harbor-spec',reason:'Spec.',sufficient:true})};}}),extractor:async entry=>({fileId:entry.id,text,status:'text',truncated:false,evidence:'Text'})});
 const spec=new File([text],'spec.json',{lastModified:Date.UTC(2026,9,1)});Object.defineProperty(spec,'webkitRelativePath',{value:'work/harbor/spec.json'});
 const inventory=createInventory([spec,new File([text],'notes.txt'),new File(['secret'],'private-salary.txt')]);
 const result=await ai.analyze({inventory,rules:defaultRules(),exclusions:{excludedIds:[inventory.entries[2].id]},guide:'',revision:'one',categories:['Projects','Invoices']});
 assert.equal(seen[0].entry.folder,'work/harbor');assert.equal(seen[0].entry.extension,'.json');assert.equal(seen[0].entry.size,text.length);assert.equal(seen[0].entry.modified,'2026-10-01');assert.deepEqual(seen[0].categories,['Projects','Invoices']);
 assert.equal(seen[0].otherFiles,undefined);assert.ok(seen.every(args=>!JSON.stringify(args).includes('private-salary')));
 assert.equal(result.suggestions[0].topic,'Harbor');
});
const longText=topic=>`Meeting minutes and planning notes for ${topic}, covering milestones, testing assignments and the next review date.`;
function topicRuntime(topics,merge,calls=[]) {
 return ()=>({...runtime(),generate:async args=>{calls.push(args);if(args.kind==='merge')return {raw:typeof merge==='function'?merge(args):JSON.stringify(merge)};const topic=topics[args.entry.name];return {raw:JSON.stringify({fileId:args.entry.id,category:topic[0],topic:topic[1],stem:'notes',reason:'Notes.',sufficient:true})};}});
}
test('the merge step groups near-duplicate topics within a category using only group summaries',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const calls=[];
 const topics={'a.txt':['Projects','Atlas Project'],'b.txt':['Projects','Project Atlas'],'c.txt':['Projects','Harbor'],'d.txt':['Invoices','Acme']};
 const ai=createAiOrganizer({runtimeFactory:topicRuntime(topics,args=>{const id=name=>args.groups.find(group=>group.topic===name).id;return JSON.stringify({merges:[{from:id('Project Atlas'),into:id('Atlas Project')}]});},calls),extractor:async entry=>({fileId:entry.id,text:longText(entry.name),status:'text',truncated:false,evidence:'Text'})});
 const inventory=createInventory(Object.keys(topics).map(name=>new File([longText(name)],name)));const result=await ai.analyze({inventory,rules:defaultRules(),guide:'',revision:'one'});
 const merge=calls.find(args=>args.kind==='merge');assert.ok(merge);assert.equal(merge.groups.length,4);assert.ok(!JSON.stringify(merge).includes('a.txt')&&!JSON.stringify(merge).includes('Meeting minutes'));
 assert.deepEqual(result.suggestions.map(item=>item.topic),['Atlas Project','Atlas Project','Harbor','Acme']);assert.match(result.suggestions[1].reason,/Atlas Project/);
});
test('invalid merges are ignored: cross-category, unknown ids, self and cycles; analysis still completes',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const topics={'a.txt':['Projects','Atlas'],'b.txt':['Invoices','Acme'],'c.txt':['Projects','Harbor']};
 for(const merge of [{merges:[{from:'g2',into:'g1'}]},{merges:[{from:'g9',into:'g1'}]},{merges:[{from:'g1',into:'g1'}]},{merges:[{from:'g1',into:'g3'},{from:'g3',into:'g1'}]},'not json']) {
  const ai=createAiOrganizer({runtimeFactory:topicRuntime(topics,merge),extractor:async entry=>({fileId:entry.id,text:longText(entry.name),status:'text',truncated:false,evidence:'Text'})});
  const result=await ai.analyze({inventory:createInventory(Object.keys(topics).map(name=>new File([longText(name)],name))),rules:defaultRules(),guide:'',revision:'one'});
  assert.deepEqual(result.suggestions.map(item=>item.topic),['Atlas','Acme','Harbor'],JSON.stringify(merge));
 }
});
test('the merge step is skipped when there is nothing to merge',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const calls=[];const topics={'a.txt':['Projects','Atlas'],'b.txt':['Invoices','']};
 const ai=createAiOrganizer({runtimeFactory:topicRuntime(topics,{merges:[]},calls),extractor:async entry=>({fileId:entry.id,text:longText(entry.name),status:'text',truncated:false,evidence:'Text'})});
 await ai.analyze({inventory:createInventory(Object.keys(topics).map(name=>new File([longText(name)],name))),rules:defaultRules(),guide:'',revision:'one'});assert.equal(calls.some(args=>args.kind==='merge'),false);
});
test('AI proposals place files in Category/Topic folders; files without a topic stay one level deep',async()=>{
 const session=createOrganizerSession(),inventory=createInventory([new File(['a'],'a.json'),new File(['b'],'b.txt'),new File(['c'],'c.txt')]);session.setInputs({inventory,rules:defaultRules()});
 const ticket=session.beginAnalysis({modelId:'model',guideDigest:'',manualKeys:[]}),[a,b,c]=inventory.entries.map(entry=>entry.id);
 const result={suggestions:[{fileId:a,category:'Projects',topic:'Atlas',stem:'atlas-spec',reason:'Spec.',sufficient:true},{fileId:b,category:'Projects',topic:'Atlas',stem:'atlas-spec',reason:'Spec.',sufficient:true},{fileId:c,category:'Invoices',topic:'',stem:'acme-invoice',reason:'Invoice.',sufficient:true}],evidence:[a,b,c].map(fileId=>({fileId,kind:'text'})),model:'model',excludedIds:[]};
 const paths=session.acceptAnalysis(ticket,result).rows.map(row=>row.targetPath);
 assert.deepEqual(paths,['Projects/Atlas/atlas-spec.json','Projects/Atlas/atlas-spec.txt','Invoices/acme-invoice.txt']);
});
test('model topics are capped at three words so related files can share a folder',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');const text='Resume for Jordan Reyes, an IT support specialist with experience maintaining Windows workstations and networks.';
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async({entry})=>({raw:JSON.stringify({fileId:entry.id,category:'Resumes',topic:'Jordan Reyes IT support specialist Resume',stem:'resume',reason:'Resume.',sufficient:true})})}),extractor:async entry=>({fileId:entry.id,text,status:'text',truncated:false,evidence:'Text'})});
 assert.equal((await ai.analyze({inventory:createInventory([new File([text],'a.txt')]),rules:defaultRules(),guide:'',revision:'one'})).suggestions[0].topic,'Jordan Reyes IT');
});
test('spreadsheets are not skipped by the short-text rule, which is meant for vague notes',async()=>{
 const {createAiOrganizer}=await import('../public/ai/organize.js');let generated=0;
 const ai=createAiOrganizer({runtimeFactory:()=>({...runtime(),generate:async args=>{generated++;return runtime().generate(args);}}),extractor:async entry=>({fileId:entry.id,text:'Invoices 2026\nInvoice number\nClient\nAmount due\nAcme Supplies',status:'text',truncated:false,evidence:'Excel document text.'})});
 const result=await ai.analyze({inventory:createInventory(['a.xlsx','b.ods','c.csv'].map(name=>new File(['x'],name))),rules:defaultRules(),guide:'',revision:'one'});
 assert.equal(generated,3);assert.ok(result.evidence.every(item=>item.kind==='text'));
});
