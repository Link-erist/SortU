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
