export function makePdf(text,{scan=false}={}) {
 const escaped=text.replace(/[\\()]/g,value=>'\\'+value),stream=scan?'q 50 0 0 50 50 700 cm /Im1 Do Q':`BT /F1 12 Tf 50 750 Td (${escaped}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\nX\nendstream'];
 let pdf='%PDF-1.4\n',offsets=[0];for(let index=0;index<objects.length;index++){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${objects[index]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf);
}
export const fixtures=[
 {name:'f01.txt',text:'Invoice INV-2026-013. Acme Supplies. Office paper and pens. Total PHP 1500. Due October 30 2026.',topic:/invoice|billing|financ|account/i},
 {name:'f02.pdf',text:'Meeting minutes. Atlas project planning. Attendees discussed milestones, assigned testing to Maria, and scheduled the next meeting for Friday.',pdf:true,topic:/meeting|minute|project|planning/i},
 {name:'f03.txt',text:'Biology homework assignment. Grade 10. Explain photosynthesis and cellular respiration. Submit your science report by Friday.',topic:/school|educat|assign|homework|biology|science/i},
 {name:'f04.json',text:'{"project":"Harbor inventory system","document":"Software requirements specification","features":["stock tracking","supplier reports","barcode search"]}',topic:/project|software|specif|requirement|develop|inventory/i},
 {name:'f05.txt',text:'Resume. Jordan Reyes. IT support specialist. Experience: troubleshooting Windows workstations and maintaining company networks. Skills: helpdesk, networking, hardware repair.',topic:/resume|career|cv|employment|professional/i},
 {name:'f06.txt',text:'Travel reservation confirmation. Guest Alex Santos. Hotel Harbor View. Booking HV1027. Arrival December 12, departure December 15. Cebu city vacation itinerary.',topic:/travel|booking|reservation|vacation|itinerar/i},
 {name:'f07.md',text:'# Chicken adobo recipe\nIngredients: chicken, vinegar, soy sauce, garlic and pepper. Marinate, simmer until tender and serve with rice.',topic:/recipe|cook|food|meal/i},
 {name:'f08.txt',text:'Fictional rental agreement. Landlord Example Estates and tenant Demo Person agree to a monthly rent and a twelve-month lease. This sample contract is for software demonstration only.',topic:/legal|contract|agreement|lease|rental/i},
 {name:'f09.csv',text:'Month,Income,Expense,Savings\nJanuary,30000,24000,6000\nFebruary,32000,25000,7000\nPersonal monthly household budget for 2026.',topic:/budget|financ|account|expense/i},
 {name:'f10.txt',text:'Tala ng pagpupulong ng pangkat. Napag-usapan ang iskedyul at mga gawain sa proyektong Atlas. Susunod na pagpupulong sa Biyernes. Si Ana ang gagawa ng ulat.',topic:/meeting|minute|project|planning|pagpupulong|tala/i},
 {name:'f11.txt',text:'Maybe later. Check the thing. No other context is available.',ambiguous:true},
 {name:'f12.pdf',text:'',pdf:true,scan:true}
];
// Office set: modern Office/OpenDocument files plus three related "Atlas" files in different formats that should share a topic.
// All files sit in a neutral inbox/ folder, so grouping must come from content rather than folder names.
import {zipSync,strToU8} from 'fflate';
const zip=parts=>Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([path,text])=>[path,strToU8(text)]))));
const paragraphs=lines=>`<w:document><w:body>${lines.map(line=>`<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
const slide=lines=>`<p:sld><p:cSld><p:spTree>${lines.map(line=>`<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`;
export const officeFixtures=[
 {name:'o1.docx',bytes:()=>zip({'word/document.xml':paragraphs(['Atlas inventory project','Software design document','Modules: stock tracking, supplier reports and barcode search.','Prepared for the Atlas project team.'])}),topic:/project|software|specif|design|develop/i,group:'atlas'},
 {name:'o2.pptx',bytes:()=>zip({'ppt/slides/slide1.xml':slide(['Quarterly budget review','Third quarter 2026']),'ppt/slides/slide2.xml':slide(['Revenue and expenses by department','Marketing spend increased by 12 percent'])}),topic:/financ|budget|report|present|account/i},
 {name:'o3.xlsx',bytes:()=>zip({'xl/workbook.xml':'<workbook><sheets><sheet name="Invoices 2026" sheetId="1"/></sheets></workbook>','xl/sharedStrings.xml':'<sst><si><t>Invoice number</t></si><si><t>Client</t></si><si><t>Amount due</t></si><si><t>Acme Supplies</t></si><si><t>Harbor Foods</t></si></sst>'}),topic:/invoice|financ|account|bill/i},
 {name:'o4.odt',bytes:()=>zip({'mimetype':'application/vnd.oasis.opendocument.text','content.xml':'<office:document-content><office:body><office:text><text:h>Biology class notes</text:h><text:p>Photosynthesis converts light energy into chemical energy. Cellular respiration releases energy for the cell. Review chapter four before the science quiz.</text:p></office:text></office:body></office:document-content>'}),topic:/school|educat|biology|science|class|note/i},
 {name:'o5.pdf',pdf:true,text:'Meeting minutes. Atlas project planning. Attendees discussed milestones, assigned testing to Maria, and scheduled the next meeting for Friday.',topic:/meeting|minute|project|planning/i,group:'atlas'},
 {name:'o6.txt',text:'Atlas project test plan. Testing schedule for the stock tracking and supplier report modules. Maria leads integration testing; results are due before the Friday review.',topic:/project|test|plan/i,group:'atlas'},
 {name:'o7.doc',bytes:()=>Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,...Buffer.from('Old binary Word document')]),legacy:true}
];
export function officeFixtureBytes(item){return item.bytes?item.bytes():item.pdf?makePdf(item.text):Buffer.from(item.text);}
