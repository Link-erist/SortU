import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,strToU8} from 'fflate';import {createInventory} from '../public/organizer/inventory.js';
const office=(name,parts,options={})=>new File([zipSync(Object.fromEntries(Object.entries(parts).map(([path,text])=>[path,[strToU8(text),options]])))],name);
const entry=file=>createInventory([file]).entries[0];
test('docx paragraphs are read in order with entities decoded',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');
 const file=office('report.docx',{'[Content_Types].xml':'<Types/>','word/document.xml':'<w:document><w:body><w:p><w:r><w:t>Atlas project</w:t></w:r><w:r><w:t xml:space="preserve"> specification</w:t></w:r></w:p><w:p><w:r><w:t>Tom &amp; Ana &lt;team&gt;</w:t></w:r></w:p></w:body></w:document>'});
 const result=await extractContent(entry(file));assert.equal(result.status,'text');assert.equal(result.text,'Atlas project specification\nTom & Ana <team>');assert.match(result.evidence,/Word/);
});
test('pptx slides are read in numeric slide order',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');const slide=text=>`<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`;
 const file=office('deck.pptx',{'ppt/slides/slide10.xml':slide('Ten'),'ppt/slides/slide2.xml':slide('Two'),'ppt/slides/slide1.xml':slide('Quarterly budget review')});
 const result=await extractContent(entry(file));assert.equal(result.text,'Quarterly budget review\nTwo\nTen');assert.match(result.evidence,/PowerPoint/);
});
test('xlsx sheet names and shared strings are read',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');
 const file=office('budget.xlsx',{'xl/workbook.xml':'<workbook><sheets><sheet name="Household 2026" sheetId="1"/></sheets></workbook>','xl/sharedStrings.xml':'<sst><si><t>Month</t></si><si><t>Income</t></si><si><r><t>Ex</t></r><r><t>pense</t></r></si></sst>'});
 const result=await extractContent(entry(file));assert.equal(result.text,'Household 2026\nMonth\nIncome\nExpense');assert.match(result.evidence,/Excel/);
});
test('OpenDocument text, slides and sheets read content.xml',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');const content='<office:document-content><office:body><text:h>Biology notes</text:h><text:p>Photosynthesis <text:span>and respiration</text:span></text:p></office:body></office:document-content>';
 for(const name of ['notes.odt','talk.odp','grades.ods']){const result=await extractContent(entry(office(name,{'mimetype':'x','content.xml':content})));assert.equal(result.text,'Biology notes\nPhotosynthesis and respiration',name);assert.match(result.evidence,/OpenDocument/);}
});
test('older binary Office formats are labelled metadata-only and never read',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');
 for(const name of ['a.doc','b.ppt','c.xls']){const file=new File(['binary'],name);file.slice=()=>{throw new Error('read');};const result=await extractContent(entry(file));assert.equal(result.status,'unsupported');assert.match(result.evidence,/older .*format/i);}
});
test('zip bombs, corrupt and oversized archives fail safely without large reads',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');
 const bomb=office('bomb.docx',{'word/document.xml':'<w:t>'+'a'.repeat(20*1024*1024)+'</w:t>'},{level:9});assert.ok(bomb.size<1024*1024);
 let result=await extractContent(entry(bomb));assert.equal(result.status,'error');assert.match(result.evidence,/too large|limit/i);
 result=await extractContent(entry(new File(['not a zip at all'],'broken.docx')));assert.equal(result.status,'error');assert.match(result.evidence,/not a valid|damaged|encrypted/i);
 const huge=new File(['x'],'huge.pptx');Object.defineProperty(huge,'size',{value:60*1024*1024});huge.slice=()=>{throw new Error('read');};
 result=await extractContent(entry(huge));assert.equal(result.status,'error');assert.match(result.evidence,/50 MiB/);
});
test('long document text is capped and marked truncated',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');const paragraphs=Array.from({length:3000},(_,i)=>`<w:p><w:r><w:t>Paragraph ${i} about the Atlas inventory system.</w:t></w:r></w:p>`).join('');
 const result=await extractContent(entry(office('long.docx',{'word/document.xml':`<w:document><w:body>${paragraphs}</w:body></w:document>`})));assert.equal(result.truncated,true);assert.ok(result.text.length<=32000);
});
test('canceling during office extraction stops it',async()=>{
 const {extractContent}=await import('../public/ai/extract.js');const controller=new AbortController();controller.abort();
 await assert.rejects(()=>extractContent(entry(office('x.docx',{'word/document.xml':'<w:t>x</w:t>'})),{signal:controller.signal}),/cancel/i);
});
