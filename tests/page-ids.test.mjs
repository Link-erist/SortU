import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
// Catches UI code that looks up an element the page no longer has (a missing id throws at runtime).
test('every element id the UI modules look up exists in index.html',async()=>{
 const page=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),missing=[];
 for(const module of ['organizer/ui.js','ai/ui.js','transfer/ui.js','app.js']) {
  const source=await readFile(new URL(`../public/${module}`,import.meta.url),'utf8');
  for(const [,id] of source.matchAll(/(?:\$\(|querySelector\(|getElementById\()['"]#?([a-z][a-z0-9-]*)['"]\)/g))if(!page.includes(`id="${id}"`))missing.push(`${module}: ${id}`);
 }
 assert.deepEqual(missing,[]);
});
