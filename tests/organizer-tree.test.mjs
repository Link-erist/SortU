import test from 'node:test';import assert from 'node:assert/strict';
import {folderTree} from '../public/organizer/tree.js';
const names=node=>node.files.map(file=>file.name);
test('paths become sorted nested folders with file counts',()=>{
 const tree=folderTree(['Invoices/Acme/b.pdf','Invoices/Acme/a.pdf','Recipes/adobo.md','Invoices/total.csv','top.txt']);
 assert.deepEqual(tree.folders.map(folder=>[folder.name,folder.count]),[['Invoices',3],['Recipes',1]]);
 assert.deepEqual(tree.folders[0].folders[0].name,'Acme');assert.deepEqual(names(tree.folders[0].folders[0]),['a.pdf','b.pdf']);assert.equal(tree.folders[0].folders[0].count,2);
 assert.deepEqual(names(tree.folders[0]),['total.csv']);assert.deepEqual(names(tree),['top.txt']);assert.equal(tree.count,5);
});
test('file items keep their id and original path so the panel can show where each file came from',()=>{
 const tree=folderTree([{path:'Documents/invoice.pdf',id:'f1',source:'INV-599.pdf'}]);
 assert.deepEqual(tree.folders[0].files,[{name:'invoice.pdf',id:'f1',source:'INV-599.pdf'}]);
});
test('an empty proposal is an empty tree',()=>{assert.deepEqual(folderTree([]),{name:'',folders:[],files:[],count:0});});
