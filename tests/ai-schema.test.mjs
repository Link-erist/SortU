import test from 'node:test';import assert from 'node:assert/strict';
test('suggestion contract rejects access expansion, wrong identities and oversized values',async()=>{
 const {validateSuggestion}=await import('../public/ai/schema.js');const valid={fileId:'one',category:'Invoices',stem:'invoice-acme',reason:'Invoice subject.',sufficient:true};assert.equal(validateSuggestion(JSON.stringify(valid),{fileId:'one'}).stem,'invoice-acme');
 for(const bad of [{...valid,fileId:'other'},{...valid,targetPath:'C:/private'},{...valid,stem:'../outside'},{...valid,extension:'.exe'},{...valid,category:'a'.repeat(61)},{...valid,reason:'x'.repeat(301)}])assert.throws(()=>validateSuggestion(JSON.stringify(bad),{fileId:'one'}));assert.throws(()=>validateSuggestion('x'.repeat(8193),{fileId:'one'}));
});
test('guide interpretation exposes exclusion review and rejects executable operations',async()=>{
 const {validateGuidance}=await import('../public/ai/schema.js');const guide={summary:'Group invoices',grouping:'subject',naming:'descriptive',exclusionPatterns:['private*'],needsConfirmation:true,blockedReason:''};assert.deepEqual(validateGuidance(JSON.stringify(guide)).exclusionPatterns,['private*']);assert.throws(()=>validateGuidance(JSON.stringify({...guide,delete:['originals']})));assert.throws(()=>validateGuidance(JSON.stringify({...guide,exclusionPatterns:Array(21).fill('*')})));
});
test('runtime JSON formatting always supplies a schema string',async()=>{
 const {responseFormat}=await import('../public/ai/schema.js');for(const kind of ['warmup','guide','file']){const format=responseFormat(kind,'one');assert.equal(format.type,'json_object');assert.equal(typeof format.schema,'string');const schema=JSON.parse(format.schema);assert.equal(schema.additionalProperties,false);if(kind==='file')assert.deepEqual(schema.properties.fileId.enum,['one']);}
});
