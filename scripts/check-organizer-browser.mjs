import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readStoredZip} from '../tests/helpers/stored-zip.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({acceptDownloads:true});
// This regression covers basic organization (the fallback without Local AI), so simulate a device without WebGPU.
await context.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'gpu',{get:()=>undefined});});
const errors=[],evidence={};await mkdir('work/evidence/organizer-fixtures',{recursive:true});
try {
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.getElementById('app-status').textContent==='Available offline');
  await context.setOffline(true);await page.reload();await page.locator('#tab-organize').click();await page.locator('#organizer-root').waitFor({state:'visible'});evidence.offlineReload=true;
  const fixtures={'Annual Report.txt':Buffer.from('important text\n'), 'annual_report.txt':Buffer.from('different bytes'), 'café.png':Buffer.from([0,255,2,10]),'.env':Buffer.from('demo=local'), 'backup.tar.gz':Buffer.from([31,139,9]),'empty.txt':Buffer.alloc(0),'private.tmp':Buffer.from('excluded')};
  for(const [name,bytes] of Object.entries(fixtures))await writeFile(`work/evidence/organizer-fixtures/${name}`,bytes);
  await page.locator('#organizer-files').setInputFiles(Object.keys(fixtures).map(name=>`work/evidence/organizer-fixtures/${name}`));
  await page.locator('#generate-proposal').click();assert.match(await page.locator('#proposal-list').textContent(),/Annual Report/);
  await page.locator('#approve-proposal').click();assert.equal(await page.locator('#export-zip').isEnabled(),true);
  await page.locator('#proposal-area summary',{hasText:'Edit individual paths'}).click();await page.locator('#proposal-list input').first().fill('../unsafe.txt');assert.equal(await page.locator('#export-zip').isEnabled(),false);
  await page.locator('#approve-proposal').click();assert.equal(await page.locator('#export-zip').isEnabled(),false);
  await page.locator('#proposal-list input').first().fill('Documents/edited.txt');await page.locator('#approve-proposal').click();
  await page.locator('#tab-transfer').click();await page.locator('#choose-send').click();await page.waitForFunction(()=>document.getElementById('pairing-output').value.startsWith('{'));
  const pairing=await page.locator('#pairing-output').inputValue();await page.locator('#tab-organize').click();assert.equal(await page.locator('#export-zip').isEnabled(),true);
  await page.locator('#tab-transfer').click();assert.equal(await page.locator('#pairing-output').inputValue(),pairing);await page.locator('#end-session').click();await page.locator('#tab-organize').click();
  await page.locator('#organizer-root summary',{hasText:'More options'}).click();await page.locator('#organizer-instructions').fill('Sort by meaning');await page.locator('#generate-proposal').click();assert.match(await page.locator('#organizer-status').textContent(),/Unsupported/);assert.equal(await page.locator('#export-zip').isEnabled(),false);
  await page.locator('#organizer-instructions').fill('界'.repeat(3000));await page.locator('#generate-proposal').click();assert.match(await page.locator('#organizer-status').textContent(),/KiB/);
  await page.locator('#use-automatic').click();await page.locator('#generate-proposal').click();await page.locator('#proposal-area').waitFor({state:'visible'});
  await page.locator('#organizer-instructions').fill('');await writeFile('work/evidence/organizer-guide.md','Group by: type\nNaming: project_{stem}_{index}\nExclude: *.tmp');
  await page.locator('#organizer-guide').setInputFiles('work/evidence/organizer-guide.md');await page.waitForFunction(()=>document.getElementById('organizer-status').textContent.startsWith('Guide loaded'));
  await page.locator('#generate-proposal').click();await page.locator('#approve-proposal').click();
  const targets=await page.locator('#proposal-list input').evaluateAll(inputs=>inputs.map(i=>i.value));assert.equal(targets.length,6);
  const pending=page.waitForEvent('download');await page.locator('#export-zip').click();const download=await pending;await download.saveAs('work/evidence/organized.zip');
  const entries=readStoredZip(await readFile('work/evidence/organized.zip')),report=JSON.parse(new TextDecoder().decode(entries['organization-report.json']));
  assert.equal(Object.keys(entries).length,7);assert.equal(report.rows.filter(r=>!r.included).length,1);
  for(const row of report.rows.filter(r=>r.included)){assert.deepEqual(Buffer.from(entries[row.targetPath]),fixtures[row.sourcePath]);assert.equal(report.checksums[row.targetPath],createHash('sha256').update(fixtures[row.sourcePath]).digest('hex'));}
  assert.match(await page.locator('#organizer-status').textContent(),/download requested/);evidence.zip={entries:Object.keys(entries),sourceHashesMatch:true};
  const retained=await page.evaluate(async()=>{const {downloadBudget,acquireExportLock}=await import('/transfer/resources.js');window.releaseHeldExport=await acquireExportLock('transfer');return downloadBudget.used;});assert.ok(retained>0);
  await page.locator('#export-zip').click();assert.equal(await page.locator('#organizer-files').isDisabled(),true);
  await page.locator('#tab-transfer').click();await page.locator('#choose-receive').click();await page.locator('#end-session').click();
  assert.equal(await page.evaluate(async()=>{const {downloadBudget}=await import('/transfer/resources.js');return downloadBudget.used;}),retained);
  await page.locator('#tab-organize').click();await page.locator('#cancel-export').click();await page.waitForFunction(()=>document.getElementById('organizer-status').textContent.includes('canceled'));
  await page.evaluate(()=>{window.releaseHeldExport();delete window.releaseHeldExport;});assert.equal(await page.locator('#organizer-files').isDisabled(),false);
  evidence.concurrentCancellation={blockedEdits:true,transferCleanupPreservedOrganizerDownload:true,canceledWhileWaiting:true};
  evidence.folder=await page.evaluate(async()=>{
    const {createInventory}=await import('/organizer/inventory.js'),{defaultRules}=await import('/organizer/rules.js'),{createOrganizerSession}=await import('/organizer/proposal.js'),{exportApproved}=await import('/organizer/export.js');
    const parent=await navigator.storage.getDirectory(),session=createOrganizerSession();session.setInputs({inventory:createInventory([new File(['private storage copy'],'notes.txt')]),rules:defaultRules()});session.generate();
    const result=await exportApproved(session,session.approve(),{mode:'folder',parentHandle:parent});if(result.state!=='saved')throw new Error(JSON.stringify(result));
    const folder=await parent.getDirectoryHandle(result.outputName),docs=await folder.getDirectoryHandle('Documents'),file=await(await docs.getFileHandle('notes.txt')).getFile();const text=await file.text();await parent.removeEntry(result.outputName,{recursive:true});return {state:result.state,text,scope:'browser private storage, not native picker'};
  });assert.equal(evidence.folder.text,'private storage copy');
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'work/evidence/organizer-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/evidence/organizer-mobile.png',fullPage:true});evidence.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(evidence.mobileOverflow,false);
  evidence.errors=errors;assert.equal(errors.length,0);await writeFile('work/evidence/organizer-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {await browser.close();}
