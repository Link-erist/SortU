import test from 'node:test';import assert from 'node:assert/strict';
const load=()=>import('../public/organizer/inventory.js');
test('inventory preserves metadata without reading contents and excludes before analysis',async()=>{
 const {createInventory,resolveIncluded}=await load();const files=[new File(['x'],'PRIVATE.tmp'),new File([],'notes.txt')];
 for(const f of files)for(const method of ['slice','stream','arrayBuffer','text'])f[method]=()=>{throw new Error('Unexpected content read');};
 const inventory=createInventory(files);assert.equal(inventory.entries[0].file,files[0]);assert.equal(inventory.entries[1].size,0);
 const selection=resolveIncluded(inventory,{patterns:['*.tmp'],excludedIds:[]});assert.deepEqual(selection.included.map(e=>e.name),['notes.txt']);assert.equal(selection.excluded.length,1);
 assert.throws(()=>createInventory([]));assert.throws(()=>createInventory(Array.from({length:101},()=>files[0])));
});
test('dotfiles, compound extensions and unknown types are classified without inference',async()=>{
 const {createInventory,splitName}=await load();assert.deepEqual(splitName('.env'),{stem:'.env',extension:''});assert.deepEqual(splitName('backup.TAR.GZ'),{stem:'backup',extension:'.TAR.GZ'});
 const i=createInventory([new File([],'archive.tar.gz'),new File([],'report.PDF'),new File([],'mystery.xyz')]);
 assert.deepEqual(i.entries.map(e=>e.category),['Archives','Documents','Other']);assert.deepEqual(i.entries.map(e=>e.sequence),[0,1,2]);
});
