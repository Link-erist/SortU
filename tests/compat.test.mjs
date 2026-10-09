import test from 'node:test';import assert from 'node:assert/strict';
import {compatibilityVerdict,plainReason} from '../public/shell/compat.js';
const ok={supported:true},noGpu={supported:false,reason:'This browser does not expose WebGPU.'},noF16={supported:false,reason:'This AI profile requires shader-f16 support.'};
test('a supported browser that can run the model is fully supported',()=>{
 const verdict=compatibilityVerdict({support:{level:'supported',name:'Chrome'},organizer:ok,transcribe:ok});
 assert.equal(verdict.level,'full');assert.deepEqual(verdict.reasons,[]);assert.equal(verdict.transcribe.supported,true);
});
test('a supported browser without the graphics features falls back to basic organization',()=>{
 const verdict=compatibilityVerdict({support:{level:'supported',name:'Edge'},organizer:noF16,transcribe:ok});
 assert.equal(verdict.level,'basic');assert.match(verdict.reasons[0],/16-bit shaders/);assert.equal(verdict.transcribe.supported,true);
});
test('Firefox is rejected for the organizer but transcription is reported separately',()=>{
 const verdict=compatibilityVerdict({support:{level:'rejected',name:'Firefox'},organizer:ok,transcribe:ok});
 assert.equal(verdict.level,'unsupported');assert.match(verdict.summary,/Chrome or Edge/);assert.equal(verdict.transcribe.supported,true);
 const none=compatibilityVerdict({support:{level:'rejected',name:'Firefox'},organizer:noGpu,transcribe:noGpu});
 assert.match(none.transcribe.text,/cannot run.*WebGPU/);
});
test('an untested browser is fully supported only when the model can run',()=>{
 assert.equal(compatibilityVerdict({support:{level:'untested',name:'Safari'},organizer:ok,transcribe:ok}).level,'full');
 assert.equal(compatibilityVerdict({support:{level:'untested',name:'Safari'},organizer:noGpu,transcribe:noGpu}).level,'unsupported');
});
test('unknown reasons are passed through unchanged',()=>{assert.equal(plainReason('Odd failure.'),'Odd failure.');});
