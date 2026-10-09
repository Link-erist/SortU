import test from 'node:test';import assert from 'node:assert/strict';import {createInventory} from '../public/organizer/inventory.js';import {defaultRules} from '../public/organizer/rules.js';
test('approval is opaque, immutable and invalidated by every target/input change',async()=>{
 const {createOrganizerSession}=await import('../public/organizer/proposal.js');const session=createOrganizerSession();const inventory=createInventory([new File(['abc'],'notes.txt')]);const inputs={inventory,rules:defaultRules(),exclusions:{},guideResolved:true};
 session.setInputs(inputs);session.generate();const permit=session.approve();const snapshot=session.resolveApproval(permit);assert.equal(snapshot.entries[0].file,inventory.entries[0].file);assert.ok(Object.isFrozen(snapshot.rows[0]));assert.throws(()=>session.resolveApproval({...permit}));
 session.editTarget(inventory.entries[0].id,'Documents/edited.txt');assert.throws(()=>session.resolveApproval(permit),/approval|stale/i);
 const next=session.approve();session.setInputs(inputs);assert.throws(()=>session.resolveApproval(next));
 session.setInputs({...inputs,guideResolved:false});assert.throws(()=>session.generate(),/instruction|guide/i);
});
test('excluded inventory cannot be approved and epoch metadata is a valid date',async()=>{
 const {createOrganizerSession}=await import('../public/organizer/proposal.js');const session=createOrganizerSession();const inventory=createInventory([new File([],'notes.txt',{lastModified:0})]);const rules={...defaultRules(),groupBy:'year',timeZone:'UTC'};
 session.setInputs({inventory,rules,guideResolved:true});assert.equal(session.generate().rows[0].targetPath,'1970/notes.txt');
 session.setInputs({inventory,rules,guideResolved:true,exclusions:{excludedIds:[inventory.entries[0].id]}});session.generate();assert.throws(()=>session.approve(),/included|select/i);
});
