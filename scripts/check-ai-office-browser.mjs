// Real-model check of the Office set: Word/PowerPoint/Excel/OpenDocument reading, the older-format label, and whether
// three related "Atlas" files in different formats end up under the same topic folder. Needs a prepared Edge profile.
import {createRequire} from 'node:module';import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {officeFixtures,officeFixtureBytes} from './ai-fixtures.mjs';import {readStoredZip} from '../tests/helpers/stored-zip.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root='work/evidence/ai-office-fixtures',sources=new Map();await rm(root,{recursive:true,force:true});await mkdir(`${root}/inbox`,{recursive:true});
for(const item of officeFixtures){const bytes=officeFixtureBytes(item);sources.set(`inbox/${item.name}`,bytes);await writeFile(`${root}/inbox/${item.name}`,bytes);}
await writeFile(`${root}/inbox/private.txt`,'Never analyze this excluded source.');
const context=await chromium.launchPersistentContext(process.env.AI_BROWSER_PROFILE||'work/ai-browser-profile',{channel:process.env.AI_BROWSER_CHANNEL||'msedge',headless:true,acceptDownloads:true});
const page=await context.newPage(),errors=[],evidence={},gateFailures=[],gate=(pass,message)=>{if(!pass)gateFailures.push(message);};page.on('pageerror',error=>errors.push(error.message));
try {
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();for(const name of await caches.keys())if(name.startsWith('sortu-'))await caches.delete(name);});
 await page.goto('about:blank');await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');
 await context.setOffline(true);await page.reload();await page.locator('#tab-organize').click();await page.waitForFunction(()=>document.getElementById('organizer-root').dataset.aiState==='ready',{},{timeout:120000});
 await page.locator('#organizer-folder').setInputFiles(`${root}/inbox`);await page.locator('#inventory-list label',{hasText:'private.txt'}).locator('input').uncheck();
 const started=Date.now();await page.locator('#generate-proposal').click();
 await page.waitForFunction(()=>!document.getElementById('proposal-area').hidden||(!document.getElementById('generate-proposal').disabled&&document.getElementById('organizer-status').dataset.state==='error'),{},{timeout:900000});
 assert.equal(await page.locator('#proposal-area').isVisible(),true,await page.locator('#organizer-status').textContent());evidence.analysisMilliseconds=Date.now()-started;
 // Playwright's simulated offline mode crashes this persistent Edge profile on any download (reproduced without AI;
 // see work/diagnose-download.mjs). Turn it off for the export and instead require that the export makes no network requests.
 await context.setOffline(false);const exportRequests=[];const watch=request=>{if(!request.url().startsWith('http://127.0.0.1:4173/')&&!request.url().startsWith('blob:'))exportRequests.push(request.url());};page.on('request',watch);
 await page.locator('#approve-proposal').click();const pending=page.waitForEvent('download');await page.locator('#export-zip').click();const download=await pending;page.off('request',watch);assert.deepEqual(exportRequests,[],'Export must not use the network');evidence.exportNetworkRequests=0;await download.saveAs('work/evidence/ai-office-organized.zip');
 const entries=readStoredZip(await readFile('work/evidence/ai-office-organized.zip')),report=JSON.parse(new TextDecoder().decode(entries['organization-report.json']));
 assert.equal(report.rows.find(row=>row.sourcePath.endsWith('private.txt')).included,false);
 evidence.results=report.rows.filter(row=>row.included).map(row=>{
  const item=officeFixtures.find(fixture=>row.sourcePath.endsWith('/'+fixture.name)),bytes=sources.get(row.sourcePath);assert.deepEqual(Buffer.from(entries[row.targetPath]),bytes);assert.equal(report.checksums[row.targetPath],createHash('sha256').update(bytes).digest('hex'));
  const parts=row.targetPath.split('/');return {source:row.sourcePath,target:row.targetPath,reason:row.reason,categoryPass:item.topic?item.topic.test(parts[0]):null,topicFolder:parts.length>2?parts[1]:'',group:item.group||null};
 });
 const clear=evidence.results.filter(result=>result.categoryPass!==null);evidence.categoryPasses=`${clear.filter(result=>result.categoryPass).length}/${clear.length}`;
 gate(clear.filter(result=>result.categoryPass).length>=clear.length-1,`Office set categories: ${evidence.categoryPasses}`);
 for(const name of ['o1.docx','o2.pptx','o3.xlsx','o4.odt'])gate(!/Metadata-only/.test(evidence.results.find(result=>result.source.endsWith(name)).reason),`${name} content was not used`);
 assert.match(evidence.results.find(result=>result.source.endsWith('o7.doc')).reason,/Older Office format/);
 const atlas=evidence.results.filter(result=>result.group==='atlas');evidence.atlasTopics=atlas.map(result=>result.topicFolder);
 gate(atlas.every(result=>/atlas/i.test(result.topicFolder)),`Related Atlas files share an Atlas topic folder: ${JSON.stringify(evidence.atlasTopics)}`);
 evidence.errors=errors;assert.deepEqual(errors,[]);evidence.gateFailures=gateFailures;await writeFile('work/evidence/ai-office.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
 if(gateFailures.length)throw new Error(`Quality gate failed: ${gateFailures.join('; ')}`);
}catch(error){await writeFile('work/evidence/ai-office-failure.json',JSON.stringify({message:error.message,errors,evidence},null,2));console.error(error.message);process.exitCode=1;}finally{await context.close();}
