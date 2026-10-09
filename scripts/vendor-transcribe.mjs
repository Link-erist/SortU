// Vendors transcription assets: transformers.js (bundled), the onnxruntime WebGPU loader, licenses, and the pinned
// model manifest. Model weights and the 27 MB engine binary are not stored here: they are pinned, hash-checked
// downloads fetched only when a user prepares transcription.
import {build} from 'esbuild';import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const MODEL='Xenova/whisper-small',REVISION='2d67713f236afa48a18992566e7647f6ca848e13';
const FILES=['config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','onnx/encoder_model_fp16.onnx','onnx/decoder_model_merged_q4.onnx'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const ort=JSON.parse(await readFile('node_modules/onnxruntime-web/package.json','utf8')).version;
await build({stdin:{contents:'export {pipeline,env} from "@huggingface/transformers";',resolveDir:process.cwd()},outfile:'public/vendor/transformers.js',bundle:true,format:'esm',minify:true,platform:'browser',legalComments:'eof'});
await mkdir('public/vendor/ort',{recursive:true});await cp('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs','public/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs');
// onnxruntime-web declares MIT in package.json but ships no license file, so the standard MIT notice is written here.
const MIT=`MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const licenses=[`@huggingface/transformers 4.3.0 (Apache-2.0)\n\n${await readFile('node_modules/@huggingface/transformers/LICENSE','utf8')}`,`onnxruntime-web ${ort} (MIT)\n\n${MIT}`,'Whisper model weights (Xenova/whisper-small, converted from openai/whisper-small): Apache-2.0'];
await writeFile('public/vendor/TRANSCRIBE-LICENSES.txt',licenses.join('\n\n----\n\n'));
// File sizes and hashes come from the pinned revision's metadata (no weight download).
const info=await(await fetch(`https://huggingface.co/api/models/${MODEL}/paths-info/${REVISION}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:FILES})})).json();
const artifacts=FILES.map(path=>{const file=info.find(entry=>entry.path===path);if(!file)throw new Error(`Missing ${path}`);return file.lfs?{path,bytes:file.size,sha256:file.lfs.oid}:{path,bytes:file.size,gitOid:file.oid};});
const engine=await readFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm');
const library={url:`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort}/dist/ort-wasm-simd-threaded.asyncify.wasm`,bytes:engine.length,sha256:sha256(engine)};
const manifest={status:'Pinned transcription preparation manifest',modelId:MODEL,modelRevision:REVISION,modelBase:`https://huggingface.co/${MODEL}/resolve/${REVISION}/`,library,artifacts,cache:{model:'transcribe/model',library:'transcribe/engine'},dtype:{encoder_model:'fp16',decoder_model_merged:'q4'},requiredFeatures:['shader-f16'],totalBytes:artifacts.reduce((sum,file)=>sum+file.bytes,library.bytes)};
await mkdir('public/transcribe',{recursive:true});await writeFile('public/transcribe/model.json',JSON.stringify(manifest,null,2)+'\n');
const vendor=JSON.parse(await readFile('public/vendor/manifest.json','utf8'));
for(const name of ['transformers.js','ort/ort-wasm-simd-threaded.asyncify.mjs','TRANSCRIBE-LICENSES.txt']){const bytes=await readFile(`public/vendor/${name}`);vendor.assets[name]={bytes:bytes.length,sha256:sha256(bytes)};}
vendor.transformers='4.3.0';vendor.onnxruntimeWeb=ort;await writeFile('public/vendor/manifest.json',JSON.stringify(vendor,null,2)+'\n');
console.log(JSON.stringify({totalBytes:manifest.totalBytes,artifacts:artifacts.length,ort},null,2));
