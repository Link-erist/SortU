import test from 'node:test';import assert from 'node:assert/strict';import {createInventory} from '../public/organizer/inventory.js';import {defaultRules} from '../public/organizer/rules.js';
test('automatic proposal keeps meaningful stems and compound extensions, and resolves collisions',async()=>{
 const {buildProposal}=await import('../public/organizer/planner.js');const i=createInventory([new File([],'Annual Report.PDF'),new File([],'annual_report.PDF'),new File([],'backup.tar.gz'),new File([],'.env')]);
 const p=buildProposal(i,defaultRules(),{});assert.deepEqual(p.rows.map(r=>r.targetPath),['Documents/annual-report.PDF','Documents/annual-report-002.PDF','Archives/backup.tar.gz','Other/.env']);
 const excluded=buildProposal(i,defaultRules(),{excludedIds:[i.entries[0].id]});assert.equal(excluded.rows[0].included,false);assert.equal(excluded.rows[0].targetPath,null);
});
test('target validator catches Windows hazards, report conflicts and directory/file prefix collisions',async()=>{
 const {validateTarget,validateProposal}=await import('../public/organizer/proposal.js');
 for(const path of ['../x','/x','C:/x','CON.txt','folder/NUL','folder./x','a\\b','a\u0000b','x/'.repeat(121),'a'.repeat(121)])assert.throws(()=>validateTarget(path));
 const i=createInventory([new File([],'a'),new File([],'b')]);const rows=i.entries.map((e,index)=>({fileId:e.id,sourcePath:e.sourcePath,included:true,targetPath:index?'Folder/x':'folder',reason:'test',operation:'organize'}));
 assert.throws(()=>validateProposal({inventoryId:i.id,rows},i),/conflict|collision/i);
 rows[0].targetPath='organization-report.json';assert.throws(()=>validateProposal({inventoryId:i.id,rows},i),/report|reserved/i);
});
