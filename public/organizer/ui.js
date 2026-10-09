import {createInventory} from './inventory.js';
import {parseGuide,resolveRules} from './rules.js';
import {createOrganizerSession} from './proposal.js';
import {exportApproved} from './export.js';
import {releaseDownloadResources} from '../transfer/resources.js';
import {mountAiControls} from '../ai/ui.js';
import {MODEL_ID} from '../ai/organize.js';
import {sha256} from '../vendor/sha256.js';
import {folderTree,renderTree} from './tree.js';
import {mountAssistant} from '../assistant/ui.js';

export function mountOrganizer(root,{settingsRoot}={}) {
  // Model controls live on the Settings page; everything else is inside this page.
  const $=selector=>root.querySelector(selector)||settingsRoot?.querySelector(selector), session=createOrganizerSession(), removers=[];
  let inventory=null, excluded=new Set(), controls={}, readme='', automatic=false, permit=null, job=null, closed=false, guideEpoch=0, guidePending=false, guideError='',aiControls,assistant,assistantBusy=false;
  const status=(message,error=false)=>{ $('#organizer-status').textContent=message;$('#organizer-status').dataset.state=error?'error':'ready';};
  const listen=(selector,event,handler)=>{const element=$(selector);element.addEventListener(event,handler);removers.push(()=>element.removeEventListener(event,handler));};
  function buttons() {
    assistant?.sync();
    $('#approve-proposal').disabled=!!job||!session.proposal;
    $('#export-zip').disabled=!!job||!permit;$('#export-folder').disabled=!!job||!permit;
    $('#cancel-export').hidden=!job||!!aiControls?.isBusy();
    $('#cancel-ai').hidden=$('#cancel-ai-setup').hidden=!aiControls?.isBusy();
    for(const el of [...root.querySelectorAll('[data-setting]'),...(settingsRoot?.querySelectorAll('[data-setting]')||[])]) el.disabled=!!job;
    for(const el of root.querySelectorAll('#inventory-list input, #proposal-list input')) el.disabled=!!job;
    $('#redo-proposal').disabled=!!job||!session.proposal;
    // Content (Local AI) is offered only when the model is ready on this device.
    const content=root.querySelector('input[name="organize-by"][value="content"]');content.disabled=!!job||root.dataset.aiState!=='ready';
  }
  function invalidate() {session.reset();permit=null;$('#proposal-area').hidden=true;$('#proposal-empty').hidden=false;buttons();}
  function settings() {
    if(guidePending||(!automatic&&guideError)) throw new Error(guidePending?'Wait for the guide to finish loading.':guideError);
    if(automatic) return resolveRules({guides:readme||guideError||$('#organizer-instructions').value.trim()?[{rules:{},errors:[],unsupported:[]}]:[],controls,automatic:true});
    const guides=[];if($('#organizer-instructions').value.trim()) guides.push(parseGuide($('#organizer-instructions').value));
    if(readme) guides.push(parseGuide(readme,{source:'readme'}));
    if(aiControls?.getMode()==='local') for(const guide of guides)guide.unsupported=[];
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
    $('#inventory-count').textContent=inventory?`${inventory.entries.length} selected files. ${aiControls?.getMode()==='local'?'Included supported files are read when you analyze them.':'Contents stay unread until export.'}`:'Choose up to 100 files.';
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
    $('#proposal-area').hidden=false;$('#proposal-empty').hidden=true;treeView();buttons();
  }
  function treeView() {$('#proposal-tree').replaceChildren(renderTree(document,folderTree(session.proposal?.rows.filter(r=>r.included).map(r=>r.targetPath)||[])));}
  function selectFiles(files) {
    invalidate();excluded=new Set();
    try {inventory=createInventory(files);inventoryView();status('Files selected. Choose how to organize, then click Organize.');}
    catch(error) {inventory=null;inventoryView();status(error.message,true);}
  }
  for(const selector of ['#organizer-files','#organizer-folder']) listen(selector,'change',()=>selectFiles(Array.from($(selector).files)));
  // Drag and drop accepts files only; folders are chosen with "Select a folder" so their paths are kept.
  listen('#organizer-drop','dragover',event=>{event.preventDefault();if(!job)$('#organizer-drop').dataset.over='true';});
  listen('#organizer-drop','dragleave',()=>{delete $('#organizer-drop').dataset.over;});
  listen('#organizer-drop','drop',event=>{
    event.preventDefault();delete $('#organizer-drop').dataset.over;if(job)return;
    const items=Array.from(event.dataTransfer?.items||[]),folders=items.some(item=>item.webkitGetAsEntry?.()?.isDirectory);
    const files=items.length?items.filter(item=>item.kind==='file'&&!item.webkitGetAsEntry?.()?.isDirectory).map(item=>item.getAsFile()).filter(Boolean):Array.from(event.dataTransfer?.files||[]);
    if(!files.length){status(folders?'To organize a folder, use Select a folder.':'No files were dropped.',true);return;}
    selectFiles(files);if(folders)status('Dropped folders were skipped. To organize a folder, use Select a folder.');
  });
  const organizeBy=()=>root.querySelector('input[name="organize-by"]:checked')?.value||'type';
  // The organize-by choice drives both the analysis mode and the basic grouping rule.
  function applyOrganizeBy() {
    const value=organizeBy();
    if(value==='content')$('#ai-mode').value='local';
    else {$('#ai-mode').value='rules';$('#group-by').value=value;controls.groupBy=value;}
    modeChanged();status('Settings changed. Click Organize to see the proposal.');
  }
  for(const radio of root.querySelectorAll('input[name="organize-by"]')){radio.addEventListener('change',applyOrganizeBy);removers.push(()=>radio.removeEventListener('change',applyOrganizeBy));}
  function modeChanged() {
    const local=aiControls.getMode()==='local';
    const checked=local?'content':(organizeBy()==='content'?$('#group-by').value:organizeBy());root.querySelector(`input[name="organize-by"][value="${checked}"]`).checked=true;
    $('#analysis-badge').textContent=local?'Local AI':'Basic organization';
    $('#organize-by-help').textContent=local?'Content: Local AI reads the documents and chooses folders and names by subject.':root.dataset.aiState==='ready'?'Sorted by name and metadata only. Choose Content to let Local AI read the documents.':'Sorted by name and metadata only. Content needs Local AI, which this device cannot run or has not set up.';
    invalidate();showRules();inventoryView();
  }
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
  listen('#use-automatic','click',()=>{automatic=true;controls={};$('#group-by').value='type';if(organizeBy()!=='content')root.querySelector('input[name="organize-by"][value="type"]').checked=true;$('#naming').value='normalize';$('#naming-template').value='{stem}';$('#exclusion-patterns').value='';invalidate();showRules();status('Automatic settings selected. Guide instructions are ignored; manual exclusions remain.');});
  async function organize() {
    if(job||assistantBusy)return;
    await assistant.releaseModel();
    permit=null;
    try {if(!inventory)throw new Error('Choose files first.');const resolved=settings();if(resolved.errors.length)throw new Error(resolved.errors.join(' '));
      session.setInputs({inventory,rules:resolved.rules,exclusions:{excludedIds:[...excluded]},guideResolved:true});
      if(aiControls.getMode()==='local') {
       const guide=automatic?'':[$('#organizer-instructions').value,readme].filter(Boolean).join('\n');
       const guideDigest=Array.from(sha256(new TextEncoder().encode(guide)),byte=>byte.toString(16).padStart(2,'0')).join('');
       const manualKeys=new Set(Object.keys(controls));if(!automatic){for(const text of [$('#organizer-instructions').value,readme])if(text.trim())for(const key of Object.keys(parseGuide(text,{source:'readme'}).rules))manualKeys.add(key);}
       const ticket=session.beginAnalysis({modelId:MODEL_ID,guideDigest,manualKeys:[...manualKeys]});
       const result=await aiControls.analyze({inventory,rules:resolved.rules,exclusions:{excludedIds:[...excluded]},guide,revision:ticket.revision});if(closed)return;session.acceptAnalysis(ticket,result);
      }else session.generate();
      proposalView();status('Review every proposed path. No original files have changed.');
    }catch(error){session.reset();$('#proposal-area').hidden=true;$('#proposal-empty').hidden=false;buttons();status(error.message,true);}
  }
  listen('#generate-proposal','click',()=>void organize());
  // Redo runs the same settings again; with Local AI the result can differ.
  listen('#redo-proposal','click',()=>void organize());
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
  aiControls=mountAiControls(root,{settingsRoot,onModeChange:modeChanged,onBusy:controller=>{job=controller;buttons();},onStatus:status});
  // The Description box: sets the direction before a proposal, then proposes previewed changes.
  assistant=mountAssistant(root,{session,aiReady:()=>root.dataset.aiState==='ready',isBusy:()=>!!job,
    onBusy:busy=>{assistantBusy=busy;buttons();},
    onApplied:()=>{permit=null;proposalView();status('Assistant changes applied. Review and approve again before saving.');},
    onDirection:({text,organizeBy:choice})=>{
      const ready=root.dataset.aiState==='ready';
      if(choice==='content'&&!ready)return 'Organizing by content needs Local AI, which is not ready on this device. Choose File type or Date instead.';
      if(choice){root.querySelector(`input[name="organize-by"][value="${choice}"]`).checked=true;applyOrganizeBy();}
      if(aiControls.getMode()==='local'){const box=$('#organizer-instructions');box.value=[box.value.trim(),text].filter(Boolean).join('\n').slice(0,8192);box.dispatchEvent(new Event('input'));return 'Got it. Local AI will follow this when you click Organize. You can add more, or click Organize now.';}
      return choice?`Set to organize by ${{type:'file type',year:'date',folders:'the original folders'}[choice]}. Click Organize when ready.`:'In basic organization I can switch between File type, Date and the original folders. Describing the result in words needs Content (Local AI).';
    }});
  modeChanged();buttons();
  return ()=>{closed=true;guideEpoch++;job?.abort();assistant.dispose();aiControls.dispose();session.reset();releaseDownloadResources('organizer');removers.forEach(remove=>remove());};
}
