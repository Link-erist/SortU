import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await build({stdin:{contents:"export {Zip,ZipPassThrough} from 'fflate';",resolveDir:process.cwd()},outfile:'public/vendor/zip.js',bundle:true,format:'esm',minify:true,legalComments:'eof'});
const license=await readFile('node_modules/fflate/LICENSE','utf8');
await writeFile('public/vendor/ZIP-LICENSE.txt',`fflate 0.8.3 (ZIP streaming subset)\n${license}`);
const manifest=JSON.parse(await readFile('public/vendor/manifest.json','utf8'));manifest.fflate='0.8.3';
for(const name of ['zip.js','ZIP-LICENSE.txt']){const bytes=await readFile(`public/vendor/${name}`);manifest.assets[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
await writeFile('public/vendor/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(manifest.assets['zip.js']);
