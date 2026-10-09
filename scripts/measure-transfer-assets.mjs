import {readdir,readFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';
const paths=['public/transfer-entry.js'];
for(const folder of ['public/transfer','public/vendor'])for(const entry of await readdir(folder))if(entry.endsWith('.js'))paths.push(`${folder}/${entry}`);
let raw=0,gzip=0;for(const path of paths){const bytes=await readFile(path);raw+=bytes.length;gzip+=gzipSync(bytes).length;}
console.log(JSON.stringify({files:paths.length,rawBytes:raw,gzipBytes:gzip,note:'Transfer scripts and bundled libraries only; excludes existing app shell and license metadata.'},null,2));
