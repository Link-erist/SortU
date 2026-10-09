import test from 'node:test';import assert from 'node:assert/strict';import {createInventory} from '../public/organizer/inventory.js';
test('text extraction reads a bounded prefix, reports UTF-8 truncation and never reads exclusions',async()=>{
 const {extractContent,extractIncluded}=await import('../public/ai/extract.js');const file=new File(['a'.repeat(65535)+'界'.repeat(10)],'one.txt');file.text=()=>{throw new Error('Full read');};const entry=createInventory([file]).entries[0];const result=await extractContent(entry);assert.equal(result.text.length,65535);assert.equal(result.truncated,true);
 const excluded=new File(['secret'],'private.txt');excluded.slice=()=>{throw new Error('excluded read');};let count=0;const inventory=createInventory([file,excluded]);for await(const item of extractIncluded(inventory,{patterns:['private*']})){assert.equal(item.fileId,inventory.entries[0].id);count++;}assert.equal(count,1);
});
test('invalid UTF-8, binary, empty and unsupported types yield honest evidence',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');for(const [file,status]of[[new File([new Uint8Array([255])],'bad.txt'),'error'],[new File(['\0\0abc'],'binary.txt'),'error'],[new File([],'empty.txt'),'no-text'],[new File(['bytes'],'image.png'),'unsupported']])assert.equal((await extractContent(createInventory([file]).entries[0])).status,status);
});
test('PDF extraction rejects oversized sources before reads and disposes failed or canceled parser',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');const big={name:'large.pdf',size:10485761,slice(){throw new Error('Must not read');}};assert.equal((await extractContent(createInventory([big]).entries[0])).status,'error');
 const source=new File(['pdf'],'one.pdf'),entry=createInventory([source]).entries[0];let destroyed=0;
 const result=await extractContent(entry,{pdfFactory:async()=>({numPages:25,getPage:async()=>({getTextContent:async()=>({items:[{str:'hello'}]})}),destroy:async()=>{destroyed++;}})});assert.equal(result.text.split('hello').length-1,20);assert.equal(result.truncated,true);assert.equal(destroyed,1);
});
