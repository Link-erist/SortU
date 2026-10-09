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
