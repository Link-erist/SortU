import {build} from 'esbuild';import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
await mkdir('public/ai',{recursive:true});await mkdir('public/vendor/pdf',{recursive:true});
for(const [name,contents] of [['webllm','export {MLCEngine,prebuiltAppConfig} from "@mlc-ai/web-llm";'],['tokenizers','export {Tokenizer} from "@huggingface/tokenizers";'],['ai-hashes','export {sha1} from "@noble/hashes/legacy.js";']])await build({stdin:{contents,resolveDir:process.cwd()},outfile:`public/vendor/${name}.js`,bundle:true,format:'esm',minify:true,legalComments:'eof'});
await cp('node_modules/pdfjs-dist/build/pdf.mjs','public/vendor/pdf/pdf.mjs');await cp('node_modules/pdfjs-dist/build/pdf.worker.mjs','public/vendor/pdf/pdf.worker.mjs');
for(const name of ['cmaps','standard_fonts','wasm'])await cp(`node_modules/pdfjs-dist/${name}`,`public/vendor/pdf/${name}`,{recursive:true});
const model=JSON.parse(await readFile('docs/superpowers/plans/2026-10-09-local-ai-organizer-artifacts.json','utf8'));
model.artifacts.push({path:'tensor-cache.json',bytes:53481,gitOid:'',sha256:null});
// Metadata is refreshed from the immutable revision only; no weight download.
const tree=await(await fetch(`https://huggingface.co/api/models/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/tree/${model.modelRevision}`)).json();
const index=tree.find(e=>e.path==='tensor-cache.json');if(!index)throw new Error('Missing pinned tensor index');Object.assign(model.artifacts.at(-1),{bytes:index.size,gitOid:index.oid,sha256:index.lfs?.oid||null});
model.status='Pinned runtime preparation manifest';model.requiredFeatures=['shader-f16'];model.contextWindow=4096;model.totalBytes=model.artifacts.reduce((sum,e)=>sum+e.bytes,model.library.bytes);
await writeFile('public/ai/model.json',JSON.stringify(model,null,2)+'\n');
const licenses=[];for(const [pkg,path] of [['@mlc-ai/web-llm','LICENSE'],['@huggingface/tokenizers','LICENSE'],['pdfjs-dist','LICENSE']])licenses.push(`${pkg}\n${await readFile(`node_modules/${pkg}/${path}`,'utf8')}`);
await writeFile('public/vendor/AI-LICENSES.txt',licenses.join('\n\n'));const manifest=JSON.parse(await readFile('public/vendor/manifest.json','utf8'));
const paths=['webllm.js','tokenizers.js','ai-hashes.js','AI-LICENSES.txt',...(await readdir('public/vendor/pdf',{recursive:true})).filter(name=>/\.(mjs|wasm|bcmap|ttf|pfb|otf)$/.test(name)).map(name=>'pdf/'+name.replaceAll('\\','/'))];
for(const name of paths){const bytes=await readFile(`public/vendor/${name}`);manifest.assets[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
manifest.webllm='0.2.85';manifest.tokenizers='0.2.0';manifest.pdfjs='6.4.299';await writeFile('public/vendor/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({totalModelBytes:model.totalBytes,runtime:manifest.assets['webllm.js']},null,2));
