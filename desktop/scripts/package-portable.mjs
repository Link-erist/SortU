// Builds the portable ZIP: SortU.exe + model/ + transcribe-model/ (saved model folders) + README.txt.
// Usage: node desktop/scripts/package-portable.mjs [organizerModelFolder] [transcribeModelFolder]
//        (defaults: work/model-folder and work/transcribe-model-folder; scripts/save-model-folder.mjs creates them)
// Run `cargo tauri build --no-bundle` in desktop/src-tauri first.
import {cp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';
const repo=path.resolve(import.meta.dirname,'../..');
const config=JSON.parse(await readFile(path.join(repo,'desktop/src-tauri/tauri.conf.json'),'utf8'));
const {modelFolderEntries,MARKER}=await import(new URL('../../public/ai/model-folder.js',import.meta.url));
// Each bundled folder, the manifest it must match, and where it goes in the ZIP (the desktop app serves these names).
const bundles=[
 {source:path.resolve(repo,process.argv[2]||'work/model-folder'),manifest:'public/ai/model.json',target:'model'},
 {source:path.resolve(repo,process.argv[3]||'work/transcribe-model-folder'),manifest:'public/transcribe/model.json',target:'transcribe-model'}
];
// Refuse to package anything that would fail the app's own verification.
async function verifyFolder({source,manifest:manifestPath}) {
 const manifest=JSON.parse(await readFile(path.join(repo,manifestPath),'utf8'));
 const marker=JSON.parse(await readFile(path.join(source,MARKER),'utf8'));if(marker.modelId!==manifest.modelId||marker.modelRevision!==manifest.modelRevision)throw new Error(`${source} is for a different model version.`);
 const specs=new Map([...manifest.artifacts.map(file=>[manifest.modelBase+file.path,file]),[manifest.library.url,manifest.library]]);
 for(const entry of modelFolderEntries(manifest)) {
  const spec=specs.get(entry.url),file=path.join(source,...entry.path.split('/')),size=(await stat(file)).size;if(size!==spec.bytes)throw new Error(`${entry.path}: size ${size}, expected ${spec.bytes}`);
  const hash=spec.sha256?createHash('sha256'):createHash('sha1');if(!spec.sha256)hash.update(`blob ${spec.bytes}\0`);for await(const chunk of createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==(spec.sha256||spec.gitOid))throw new Error(`${entry.path}: hash mismatch`);
 }
}
for(const bundle of bundles)await verifyFolder(bundle);
const exe=path.join(repo,'desktop/src-tauri/target/release/sortu.exe'),name=`SortU-portable-${config.version}`,dist=path.join(repo,'desktop/dist'),out=path.join(dist,name);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await cp(exe,path.join(out,'SortU.exe'));for(const bundle of bundles)await cp(bundle.source,path.join(out,bundle.target),{recursive:true});
await writeFile(path.join(out,'README.txt'),`SortU ${config.version} (portable)

Run "SortU.exe". Nothing is installed:
- The app keeps its data in the "data" folder created next to it.
- "model" holds the Local AI organizer model (Qwen2.5-1.5B, about 885 MB) and "transcribe-model" holds the
  transcription model (Whisper Small, about 440 MB). On first launch the app copies them into its data folder and
  checks every file. After that, everything works offline.
- To remove the app completely, close it and delete this whole folder.

Windows may show "Windows protected your PC" because the app is not code-signed. Choose "More info", then "Run anyway".
Requires Windows 10/11 with the Microsoft Edge WebView2 runtime (included in Windows 11) and a graphics adapter with
WebGPU and shader-f16 support. Without it, basic organization (names and metadata) and file transfer still work.
`.replace(/\n/g,'\r\n'));
const zip=path.join(dist,name+'.zip');await rm(zip,{force:true});
execFileSync(process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'tar',['-a','-c','-f',zip,'-C',dist,name],{stdio:'inherit'});
console.log(JSON.stringify({zip:path.relative(repo,zip),bytes:(await stat(zip)).size},null,2));
