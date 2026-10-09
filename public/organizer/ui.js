import {createInventory} from './inventory.js';
import {parseGuide,resolveRules} from './rules.js';
import {createOrganizerSession} from './proposal.js';
import {exportApproved} from './export.js';
import {releaseDownloadResources} from '../transfer/resources.js';

export function mountOrganizer(root) {
  const $=selector=>root.querySelector(selector), session=createOrganizerSession(), removers=[];
  let inventory=null, excluded=new Set(), controls={}, readme='', automatic=false, permit=null, job=null, closed=false, guideEpoch=0, guidePending=false, guideError='';
  const status=(message,error=false)=>{ $('#organizer-status').textContent=message;$('#organizer-status').dataset.state=error?'error':'ready';};
  const listen=(selector,event,handler)=>{const element=$(selector);element.addEventListener(event,handler);removers.push(()=>element.removeEventListener(event,handler));};
  function buttons() {
    $('#approve-proposal').disabled=!!job||!session.proposal;
    $('#export-zip').disabled=!!job||!permit;$('#export-folder').disabled=!!job||!permit;
    $('#cancel-export').hidden=!job;
    for(const el of root.querySelectorAll('[data-setting]')) el.disabled=!!job;
    for(const el of root.querySelectorAll('#inventory-list input, #proposal-list input')) el.disabled=!!job;
  }
  function invalidate() {session.reset();permit=null;$('#proposal-area').hidden=true;buttons();}
  function settings() {
    if(guidePending||(!automatic&&guideError)) throw new Error(guidePending?'Wait for the guide to finish loading.':guideError);
    if(automatic) return resolveRules({guides:readme||guideError||$('#organizer-instructions').value.trim()?[{rules:{},errors:[],unsupported:[]}]:[],controls,automatic:true});
    const guides=[];if($('#organizer-instructions').value.trim()) guides.push(parseGuide($('#organizer-instructions').value));
    if(readme) guides.push(parseGuide(readme,{source:'readme'}));
    return resolveRules({guides,controls,automatic});
  }
  function showRules() {
    try {const resolved=settings();$('#rules-summary').textContent=resolved.errors.length?resolved.errors.join(' '):`Group: ${resolved.rules.groupBy}. Naming: ${resolved.rules.naming}${resolved.rules.naming==='template'?` (${resolved.rules.template})`:''}. Exclusions: ${resolved.rules.patterns.join(', ')||'none'}. ${resolved.warnings.join(' ')}`;}
    catch(error) {$('#rules-summary').textContent=error.message;}
  }
  function inventoryView() {
    $('#inventory-list').replaceChildren();
    for(const entry of inventory?.entries||[]) {
      const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');box.type='checkbox';box.checked=!excluded.has(entry.id);
      text.textContent=`${entry.sourcePath} · ${entry.category} · ${entry.size.toLocaleString()} bytes`;
      box.addEventListener('change',()=>{box.checked?excluded.delete(entry.id):excluded.add(entry.id);invalidate();status('Selection changed. Generate and approve a new proposal.');});
      label.append(box,text);$('#inventory-list').append(label);
    }
    $('#inventory-count').textContent=inventory?`${inventory.entries.length} selected files. Contents stay unread until export.`:'Choose up to 100 files.';
  }
  function proposalView() {
    const proposal=session.proposal;$('#proposal-list').replaceChildren();
    for(const row of proposal.rows) {
      const item=document.createElement('div');item.className='proposal-row';const original=document.createElement('strong');original.textContent=row.sourcePath;item.append(original);
      if(row.included) {
        const label=document.createElement('label');label.textContent='Proposed path';const input=document.createElement('input');input.value=row.targetPath;input.type='text';input.maxLength=240;
        input.addEventListener('input',()=>{permit=null;try{session.editTarget(row.fileId,input.value);status('Proposal edited. Review and approve again.');}catch(error){status(error.message,true);}buttons();treeView();});
        label.append(input);item.append(label);
      }
      const reason=document.createElement('p');reason.className='help';reason.textContent=row.included?row.reason:`Excluded: ${row.reason}`;item.append(reason);$('#proposal-list').append(item);
    }
    $('#proposal-summary').textContent=`${proposal.rows.filter(r=>r.included).length} included, ${proposal.rows.filter(r=>!r.included).length} excluded. ${proposal.warnings.join(' ')}`;
    $('#proposal-area').hidden=false;treeView();buttons();
  }
  function treeView() {$('#proposal-tree').textContent=session.proposal?.rows.filter(r=>r.included).map(r=>r.targetPath).sort().join('\n')||'';}
  for(const selector of ['#organizer-files','#organizer-folder']) listen(selector,'change',()=>{
    invalidate();excluded=new Set();
    try {inventory=createInventory(Array.from($(selector).files));inventoryView();status('Files selected. Review settings, then generate a proposal.');}
    catch(error) {inventory=null;inventoryView();status(error.message,true);}
  });
  for(const [selector,key] of [['#group-by','groupBy'],['#naming','naming'],['#naming-template','template'],['#exclusion-patterns','patterns']]) listen(selector,'input',()=>{
    controls[key]=key==='patterns'?$(selector).value.split(',').map(s=>s.trim()).filter(Boolean):$(selector).value;
    invalidate();showRules();status('Settings changed. Generate a new proposal.');
  });
  listen('#organizer-instructions','input',()=>{automatic=false;invalidate();showRules();});
  listen('#organizer-guide','change',async()=>{
    const epoch=++guideEpoch;readme='';guideError='';guidePending=false;automatic=false;invalidate();const file=$('#organizer-guide').files[0];if(!file){showRules();return;}
    guidePending=true;showRules();
    try {if(!/\.(txt|md)$/i.test(file.name)||file.size>32768)throw new Error('Choose a .txt or .md guide of at most 32 KiB.');
      const text=await file.text();if(closed||epoch!==guideEpoch)return;readme=text;parseGuide(readme,{source:'readme'});guidePending=false;invalidate();showRules();status('Guide loaded. Supported instructions are shown below.');
    } catch(error){if(epoch===guideEpoch){readme='';guidePending=false;guideError=error.message;invalidate();showRules();status(error.message,true);}}
  });
  listen('#use-automatic','click',()=>{automatic=true;controls={};$('#group-by').value='type';$('#naming').value='normalize';$('#naming-template').value='{stem}';$('#exclusion-patterns').value='';invalidate();showRules();status('Automatic settings selected. Guide instructions are ignored; manual exclusions remain.');});
  listen('#generate-proposal','click',()=>{
    permit=null;
    try {if(!inventory)throw new Error('Choose files first.');const resolved=settings();if(resolved.errors.length)throw new Error(resolved.errors.join(' '));
      session.setInputs({inventory,rules:resolved.rules,exclusions:{excludedIds:[...excluded]},guideResolved:true});session.generate();proposalView();status('Review every proposed path. No files have changed.');
    }catch(error){session.reset();$('#proposal-area').hidden=true;buttons();status(error.message,true);}
  });
  listen('#approve-proposal','click',()=>{try{permit=session.approve();status('Proposal approved. Export organized copies when ready.');}catch(error){permit=null;status(error.message,true);}buttons();});
  async function runExport(mode) {
    if(job||!permit)return;job=new AbortController();buttons();
    try {
      let parentHandle;
      if(mode==='folder') parentHandle=await window.showDirectoryPicker({mode:'readwrite'});
      const result=await exportApproved(session,permit,{mode,parentHandle,signal:job.signal,onProgress:p=>status(`${p.stage}: ${p.path} (${p.completed}/${p.total})`)});
      if(closed)return;
      status(result.state==='saved'?`Saved and verified in ${result.outputName}.`:result.state==='download-requested'?'ZIP download requested. Wait for your browser to finish saving.':`${result.state}: ${result.outputName}. ${result.error} Completed: ${result.completedPaths.length}.`,['partial','canceled'].includes(result.state));
    }catch(error){if(!closed)status(error.name==='AbortError'?'Folder selection canceled.':error.message,true);}
    finally {job=null;if(!closed)buttons();}
  }
  listen('#export-zip','click',()=>void runExport('zip'));listen('#export-folder','click',()=>void runExport('folder'));
  listen('#cancel-export','click',()=>job?.abort());
  listen('#reset-organizer','click',()=>{inventory=null;excluded.clear();invalidate();inventoryView();releaseDownloadResources('organizer');$('#organizer-files').value='';$('#organizer-folder').value='';status('File selection cleared.');});
  $('#export-folder').hidden=typeof window.showDirectoryPicker!=='function';
  $('#folder-support').textContent=typeof window.showDirectoryPicker==='function'?'Save copies in a new subfolder on supported Windows browsers, or download a ZIP.':'This browser uses ZIP export. Direct folder saving is unavailable.';
  showRules();buttons();
  return ()=>{closed=true;guideEpoch++;job?.abort();session.reset();releaseDownloadResources('organizer');removers.forEach(remove=>remove());};
}
