import {createRequire} from 'node:module';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({acceptDownloads:true});
const errors=[];const evidence={};await mkdir('work/evidence',{recursive:true});
try{
 const a=await context.newPage(),b=await context.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
 await a.goto('http://127.0.0.1:4173');await a.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');await b.goto('http://127.0.0.1:4173');await b.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');
 await context.setOffline(true);await a.reload();await b.reload();
 // Browser offline emulation disables ICE networking too. Block HTTP only
 // after testing cached reload, preserving LAN sockets as a WAN outage does.
 await context.setOffline(false);await context.route('**/*',route=>route.abort());
 await a.getByRole('button',{name:'Send files'}).click();await b.getByRole('button',{name:'Receive files'}).click();
 await a.waitForFunction(()=>document.getElementById('pairing-output').value.startsWith('{'));
 const offer=await a.locator('#pairing-output').inputValue();await b.locator('summary').click();await b.locator('#pairing-input').fill(offer);await b.locator('#use-pairing-text').click();
 await b.waitForFunction(()=>document.getElementById('pairing-output').value.startsWith('{'));
 const answer=await b.locator('#pairing-output').inputValue();await a.locator('summary').click();await a.locator('#pairing-input').fill(answer);await a.locator('#use-pairing-text').click();
 await Promise.all([a.locator('#verification-code').waitFor({state:'visible'}),b.locator('#verification-code').waitFor({state:'visible'})]);
 const codes=await Promise.all([a.locator('#verification-code').textContent(),b.locator('#verification-code').textContent()]);if(codes[0]!==codes[1])throw new Error('Codes differ');
 await a.locator('#verify-pairing').click();await b.locator('#verify-pairing').click();await a.locator('#file-workspace').waitFor({state:'visible'});await b.locator('#file-workspace').waitFor({state:'visible'});
 const payload=Buffer.alloc(1024*1024);for(let i=0;i<payload.length;i++)payload[i]=i%251;
 await a.locator('#select-files').setInputFiles([{name:'offline-demo.bin',mimeType:'application/octet-stream',buffer:payload},{name:'empty.txt',mimeType:'text/plain',buffer:Buffer.alloc(0)}]);await a.locator('#offer-files').click();await b.locator('#incoming-review').waitFor({state:'visible'});await b.locator('#accept-files').click();
 await b.getByRole('button',{name:'Save verified file'}).first().waitFor({state:'visible',timeout:60000});
 const downloadPromise=b.waitForEvent('download');await b.getByRole('button',{name:'Save verified file'}).first().click();const download=await downloadPromise;await download.saveAs('work/evidence/received.bin');const received=await readFile('work/evidence/received.bin');
 evidence.hash=createHash('sha256').update(received).digest('hex');evidence.expectedHash=createHash('sha256').update(payload).digest('hex');if(evidence.hash!==evidence.expectedHash)throw new Error('Hash mismatch');
 await b.getByRole('button',{name:'Save verified file'}).last().waitFor({state:'visible',timeout:30000});const emptyPromise=b.waitForEvent('download');await b.getByRole('button',{name:'Save verified file'}).last().click();const empty=await emptyPromise;await empty.saveAs('work/evidence/empty.txt');if((await readFile('work/evidence/empty.txt')).length!==0)throw new Error('Empty file corrupted');
 evidence.offlineReload=true;evidence.bytes=received.length;evidence.codesMatch=true;evidence.zeroByteFile=true;evidence.errors=errors;evidence.speed=await b.locator('#speed-label').textContent();
 await a.setViewportSize({width:1280,height:900});await a.screenshot({path:'work/evidence/desktop.png',fullPage:true});await b.setViewportSize({width:390,height:844});await b.screenshot({path:'work/evidence/mobile.png',fullPage:true});evidence.mobileOverflow=await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 console.log(JSON.stringify(evidence,null,2));await writeFile('work/evidence/browser.json',JSON.stringify(evidence,null,2));if(errors.length)throw new Error('Browser errors');
}catch(error){const pages=await Promise.all(context.pages().map(p=>p.evaluate(()=>({status:document.getElementById('transfer-status')?.textContent,code:document.getElementById('verification-code')?.textContent,payload:document.getElementById('pairing-output')?.value}))));await writeFile('work/evidence/failure.json',JSON.stringify({message:error.message,errors,pages}));console.error(error);process.exitCode=1;}finally{await browser.close();}

