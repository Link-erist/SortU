import test from 'node:test';import assert from 'node:assert/strict';
import {completeWithRecovery,GPU_LOST} from '../public/ai/recover.js';
const engine=failures=>{const calls={resets:0,creates:0};return {calls,resetChat:async()=>{calls.resets++;},chat:{completions:{create:async request=>{calls.creates++;if(failures.length)throw new Error(failures.shift());return {request};}}}};};
for(const message of ['Cannot pass deleted object as a pointer of type GrammarMatcher','GrammarMatcher instance already deleted','Model not loaded before trying to complete ChatCompletionRequest.'])
 test(`a lost model ("${message.slice(0,40)}…") reloads once and retries the same request`,async()=>{
  const broken=engine([message]);let reloads=0;
  const result=await completeWithRecovery(()=>broken,async()=>{reloads++;},{seed:0});
  assert.deepEqual(result.request,{seed:0});assert.equal(reloads,1);assert.equal(broken.calls.creates,2);
 });
test('other errors pass through, and a second loss explains what happened',async()=>{
 await assert.rejects(()=>completeWithRecovery((e=>()=>e)(engine(['Tokenizer mismatch'])),async()=>assert.fail('no reload'),{}),/Tokenizer mismatch/);
 const twice=engine(['GrammarMatcher instance already deleted','GrammarMatcher instance already deleted']);
 await assert.rejects(()=>completeWithRecovery(()=>twice,async()=>{},{}),{message:GPU_LOST});
 await assert.rejects(()=>completeWithRecovery((e=>()=>e)(engine(['GrammarMatcher instance already deleted'])),async()=>{throw new Error('No WebGPU adapter found');},{}),{message:GPU_LOST});
});
