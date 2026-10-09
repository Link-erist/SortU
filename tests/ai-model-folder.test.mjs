import test from 'node:test';import assert from 'node:assert/strict';
const manifest={modelId:'m',modelRevision:'r',modelBase:'https://example.test/pinned/',library:{url:'https://example.test/libs/model-webgpu.wasm',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'},artifacts:[{path:'tokenizer.json',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'},{path:'params/shard_0.bin',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}],totalBytes:9};
// Minimal in-memory stand-in for the File System Access directory API.
function memoryDirectory(){const files=new Map();const dir=prefix=>({kind:'directory',name:prefix.split('/').filter(Boolean).pop()||'root',
 async getDirectoryHandle(name,{create}={}){const path=prefix+name+'/';if(!create&&![...files.keys()].some(key=>key.startsWith(path)))throw new DOMException('missing','NotFoundError');return dir(path);},
 async getFileHandle(name,{create}={}){const path=prefix+name;if(!create&&!files.has(path))throw new DOMException('missing','NotFoundError');return {kind:'file',name,async getFile(){return new File([files.get(path)],name);},async createWritable(){const parts=[];return {async write(chunk){parts.push(chunk);},async close(){files.set(path,await new Blob(parts).arrayBuffer());},async abort(){}};}};},
 async *entries(){const seen=new Set();for(const key of files.keys()){if(!key.startsWith(prefix))continue;const rest=key.slice(prefix.length),name=rest.split('/')[0];if(seen.has(name))continue;seen.add(name);yield [name,rest.includes('/')?dir(prefix+name+'/'):await this.getFileHandle(name)];}}});
 return {root:dir(''),files};}
test('folder layout maps every pinned artifact and the library to a stable relative path',async()=>{
 const {modelFolderEntries}=await import('../public/ai/model-folder.js');assert.deepEqual(modelFolderEntries(manifest).map(entry=>entry.path),['model/tokenizer.json','model/params/shard_0.bin','library/model-webgpu.wasm']);
});
test('save writes every cached artifact and the completion marker last; load reads them back',async()=>{
 const {saveModelFolder,filesFromDirectory}=await import('../public/ai/model-folder.js');const {root,files}=memoryDirectory();const order=[];
 const openCache=async()=>({match:async url=>new Response('abc')});
 const saved=await saveModelFolder(root,{manifest,openCache,onProgress:p=>order.push(p.file)});assert.equal(saved.files,3);
 const keys=[...files.keys()];assert.equal(keys.at(-1),'ai-organizer-model.json');assert.ok(keys.includes('model/params/shard_0.bin'));
 const loaded=await filesFromDirectory(root);assert.equal(loaded.size,4);assert.equal(await loaded.get('library/model-webgpu.wasm').text(),'abc');
});
test('save refuses when the model is not fully prepared and writes no marker',async()=>{
 const {saveModelFolder}=await import('../public/ai/model-folder.js');const {root,files}=memoryDirectory();
 await assert.rejects(()=>saveModelFolder(root,{manifest,openCache:async()=>({match:async url=>url.endsWith('.wasm')?undefined:new Response('abc')})}),/prepare/i);assert.equal(files.has('ai-organizer-model.json'),false);
});
test('folder source feeds the verifying transport: missing, wrong-model and corrupted folders are refused',async()=>{
 const {folderFetcher,checkFolderMarker}=await import('../public/ai/model-folder.js');const {createModelTransport}=await import('../public/ai/transport.js');
 const good=new Map([['ai-organizer-model.json',new File([JSON.stringify({modelId:'m',modelRevision:'r'})],'ai-organizer-model.json')],['model/tokenizer.json',new File(['abc'],'t')],['model/params/shard_0.bin',new File(['abc'],'s')],['library/model-webgpu.wasm',new File(['abc'],'l')]]);
 await checkFolderMarker(good,manifest);let stored=0;await createModelTransport({manifest,fetcher:folderFetcher(manifest,good),cacheLookup:async()=>undefined,cacheStore:async(url,response)=>{await response.arrayBuffer();stored++;}}).prepareArtifacts();assert.equal(stored,3);
 const missing=new Map(good);missing.delete('model/params/shard_0.bin');await assert.rejects(()=>createModelTransport({manifest,fetcher:folderFetcher(manifest,missing),cacheLookup:async()=>undefined,cacheStore:async(url,response)=>{await response.arrayBuffer();}}).prepareArtifacts(),/missing model\/params\/shard_0.bin/);
 const corrupt=new Map(good);corrupt.set('model/tokenizer.json',new File(['abd'],'t'));await assert.rejects(()=>createModelTransport({manifest,fetcher:folderFetcher(manifest,corrupt),cacheLookup:async()=>undefined,cacheStore:async(url,response)=>{await response.arrayBuffer();}}).prepareArtifacts(),/integrity/);
 const other=new Map(good);other.set('ai-organizer-model.json',new File([JSON.stringify({modelId:'other',modelRevision:'r'})],'x'));await assert.rejects(()=>checkFolderMarker(other,manifest),/different model/);
 await assert.rejects(()=>checkFolderMarker(new Map(),manifest),/not a saved model folder/);
});
test('selected folder files use paths relative to the chosen folder',async()=>{
 const {filesFromInput}=await import('../public/ai/model-folder.js');const file=new File(['abc'],'shard_0.bin');Object.defineProperty(file,'webkitRelativePath',{value:'My Model/model/params/shard_0.bin'});
 assert.deepEqual([...filesFromInput([file]).keys()],['model/params/shard_0.bin']);
});
test('the model counts as prepared only when every pinned file is stored',async()=>{
 const {isModelPrepared}=await import('../public/ai/model-folder.js');
 assert.equal(await isModelPrepared(manifest,async()=>({match:async()=>new Response('abc')})),true);
 assert.equal(await isModelPrepared(manifest,async()=>({match:async url=>url.endsWith('.wasm')?undefined:new Response('abc')})),false);
 assert.equal(await isModelPrepared(manifest,async()=>{throw new Error('storage blocked');}),false);
});
