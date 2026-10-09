import {readdir,readFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';
const paths=['public/workspaces.js','public/vendor/zip.js'];
for(const entry of await readdir('public/organizer'))if(entry.endsWith('.js'))paths.push(`public/organizer/${entry}`);
let rawBytes=0,gzipBytes=0;for(const path of paths){const bytes=await readFile(path);rawBytes+=bytes.length;gzipBytes+=gzipSync(bytes).length;}
console.log(JSON.stringify({files:paths.length,rawBytes,gzipBytes,note:'Organizer modules and ZIP vendor only. Excludes modified shared shell and existing Transfer assets. Asset size is not browser RAM usage.'},null,2));
