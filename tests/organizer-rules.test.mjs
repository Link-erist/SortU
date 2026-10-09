import test from 'node:test';import assert from 'node:assert/strict';
const load=()=>import('../public/organizer/rules.js');
test('guides parse supported directives and surface unsupported or contradictory instructions',async()=>{
 const {parseGuide,resolveRules}=await load();const guide=parseGuide('Group by: type\nNaming: project_{stem}_{index}\nExclude: *.tmp, private/*',{source:'readme'});
 assert.equal(guide.rules.groupBy,'type');assert.equal(guide.rules.naming,'template');assert.deepEqual(guide.rules.patterns,['*.tmp','private/*']);assert.equal(guide.errors.length,0);
 const bad=parseGuide('Group by: type\nSort by importance\nGroup by: year',{source:'readme'});assert.equal(bad.unsupported.length,1);assert.ok(bad.errors.length);
 assert.ok(resolveRules({guides:[bad]}).errors.length);assert.equal(resolveRules({guides:[bad],automatic:true}).errors.length,0);
 assert.ok(resolveRules({guides:[guide],controls:{groupBy:'year'}}).warnings.some(w=>w.includes('override')));
});
test('UTF-8 limits and naming tokens are checked before proposal generation',async()=>{
 const {parseGuide,resolveRules}=await load();assert.throws(()=>parseGuide('é'.repeat(4097),{source:'typed'}),/limit|large/i);
 assert.ok(parseGuide('Naming: {subject}',{source:'typed'}).errors.length);
 assert.ok(resolveRules({controls:{patterns:Array(21).fill('*.tmp')}}).errors.length);
});
