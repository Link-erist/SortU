import test from 'node:test';import assert from 'node:assert/strict';
import {folderTree} from '../public/organizer/tree.js';
test('paths become sorted nested folders with file counts',()=>{
 const tree=folderTree(['Invoices/Acme/b.pdf','Invoices/Acme/a.pdf','Recipes/adobo.md','Invoices/total.csv','top.txt']);
 assert.deepEqual(tree.folders.map(folder=>[folder.name,folder.count]),[['Invoices',3],['Recipes',1]]);
 assert.deepEqual(tree.folders[0].folders[0],{name:'Acme',folders:[],files:['a.pdf','b.pdf'],count:2});
 assert.deepEqual(tree.folders[0].files,['total.csv']);assert.deepEqual(tree.files,['top.txt']);assert.equal(tree.count,5);
});
test('an empty proposal is an empty tree',()=>{assert.deepEqual(folderTree([]),{name:'',folders:[],files:[],count:0});});
