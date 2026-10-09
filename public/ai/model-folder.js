// Save a prepared model to a user folder and load it into another browser or profile without a second download.
// Loaded bytes are not trusted: they go through the same pinned size and hash verification as network downloads.
export const MARKER='ai-organizer-model.json';
export function modelFolderEntries(manifest) {
 return [...manifest.artifacts.map(file=>({url:manifest.modelBase+file.path,path:'model/'+file.path,scope:file.path==='mlc-chat-config.json'?'webllm/config':'webllm/model'})),
  {url:manifest.library.url,path:'library/'+manifest.library.url.split('/').pop(),scope:'webllm/wasm'}];
}
async function directoryFor(root,path,create) {let dir=root;const parts=path.split('/');for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create});return {dir,name:parts.at(-1)};}
export async function saveModelFolder(root,{manifest,openCache=scope=>caches.open(scope),signal,onProgress=()=>{}}) {
 const entries=modelFolderEntries(manifest),check=()=>{if(signal?.aborted)throw new Error('Saving the model was canceled.');};
 // Check that every file is prepared before writing anything, so a partial save is never started.
 for(const entry of entries){check();if(!await(await openCache(entry.scope)).match(entry.url))throw new Error('The model is not fully prepared in this browser. Prepare local AI first, then save it.');}
 let bytes=0;
 for(const [index,entry] of entries.entries()) {
  check();onProgress({stage:'Saving model to folder',file:entry.path,completed:index,total:entries.length});
  const response=await(await openCache(entry.scope)).match(entry.url),{dir,name}=await directoryFor(root,entry.path,true),writable=await(await dir.getFileHandle(name,{create:true})).createWritable();
  try {const reader=response.body.getReader();for(;;){check();const next=await reader.read();if(next.done)break;bytes+=next.value.length;await writable.write(next.value);}await writable.close();}
  catch(error){await writable.abort?.().catch(()=>{});throw error;}
 }
 // The marker is written last: a folder without it is an incomplete save.
 const marker=await(await root.getFileHandle(MARKER,{create:true})).createWritable();await marker.write(JSON.stringify({modelId:manifest.modelId,modelRevision:manifest.modelRevision,files:entries.length,bytes},null,2));await marker.close();
 return {files:entries.length,bytes};
}
export async function filesFromDirectory(root,prefix='',files=new Map()) {
 for await(const [name,handle] of root.entries()){if(handle.kind==='directory')await filesFromDirectory(handle,prefix+name+'/',files);else files.set(prefix+name,await handle.getFile());}
 return files;
}
// For <input type="file" webkitdirectory>: drop the chosen folder's own name from each relative path.
export function filesFromInput(fileList){return new Map(Array.from(fileList,file=>[file.webkitRelativePath.split('/').slice(1).join('/'),file]));}
export async function checkFolderMarker(files,manifest) {
 const marker=files.get(MARKER);if(!marker)throw new Error('This is not a saved model folder (or the save did not finish). Choose the folder that contains ai-organizer-model.json.');
 let info;try{info=JSON.parse(await marker.text());}catch{throw new Error('The saved model folder description is unreadable.');}
 if(info.modelId!==manifest.modelId||info.modelRevision!==manifest.modelRevision)throw new Error('This folder holds a different model version. Prepare local AI from the internet instead.');
}
export function folderFetcher(manifest,files) {
 const paths=new Map(modelFolderEntries(manifest).map(entry=>[entry.url,entry.path]));
 return async url=>{const path=paths.get(url),file=path&&files.get(path);if(!file)throw new Error(`The saved model folder is missing ${path||'a file'}.`);return new Response(file,{status:200});};
}
