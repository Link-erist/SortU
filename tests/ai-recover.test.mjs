import test from 'node:test';import assert from 'node:assert/strict';
import {completeWithRecovery} from '../public/ai/recover.js';
const engine=failures=>{const calls={resets:0,creates:0};return {calls,resetChat:async()=>{calls.resets++;},chat:{completions:{create:async request=>{calls.creates++;if(failures.length)throw new Error(failures.shift());return {request};}}}};};
test('a deleted grammar matcher reloads the model once and retries the same request',async()=>{
 const broken=engine(['Cannot pass deleted object as a pointer of type GrammarMatcher']);let reloads=0;
 const result=await completeWithRecovery(broken,async()=>{reloads++;},{seed:0});
 assert.deepEqual(result.request,{seed:0});assert.equal(reloads,1);assert.equal(broken.calls.creates,2);
});
test('other errors, and a second grammar failure after reloading, are reported',async()=>{
 await assert.rejects(()=>completeWithRecovery(engine(['out of memory']),async()=>assert.fail('no reload'),{}),/out of memory/);
 const twice=engine(['Cannot pass deleted object as a pointer of type GrammarMatcher','Cannot pass deleted object as a pointer of type GrammarMatcher']);
 await assert.rejects(()=>completeWithRecovery(twice,async()=>{},{}),/GrammarMatcher/);
});
