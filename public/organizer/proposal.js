import {buildProposal,keepBoth} from './planner.js';
import {safeSegment} from './paths.js';
import {validateSuggestion} from '../ai/schema.js';
import {validateRules} from './rules.js';
import {validateTarget, REPORT_PATH, pathsConflict} from './paths.js';
import {sha256} from '../vendor/sha256.js';
export {validateTarget} from './paths.js';

export function validateProposal(proposal, inventory) {
  if (!proposal || proposal.inventoryId !== inventory.id || !Array.isArray(proposal.rows) || proposal.rows.length !== inventory.entries.length) throw new Error('Proposal does not match selected inventory.');
  const entries = new Map(inventory.entries.map(e => [e.id, e])), seen = new Set(), paths = [REPORT_PATH];
  for (const row of proposal.rows) {
    const entry = entries.get(row.fileId);
    if (!entry || seen.has(row.fileId) || row.sourcePath !== entry.sourcePath || typeof row.included !== 'boolean') throw new Error('Unknown or repeated proposal file.');
    seen.add(row.fileId);
    if (!row.included) {if (row.targetPath !== null) throw new Error('Excluded file has an export assignment.'); continue;}
    validateTarget(row.targetPath);
    if (pathsConflict(row.targetPath, REPORT_PATH)) throw new Error('Target conflicts with the reserved organization report.');
    if (paths.some(path => pathsConflict(row.targetPath, path))) throw new Error('Target file/directory collision.');
    paths.push(row.targetPath);
  }
}
const freezeRules = rules => Object.freeze({...rules, patterns: Object.freeze([...rules.patterns])});
const fingerprint = (version, p) => Array.from(sha256(new TextEncoder().encode(JSON.stringify([version, p.inventoryId, p.rows, p.rules,p.analysis||null]))), b => b.toString(16).padStart(2, '0')).join('');
export function createOrganizerSession() {
  let inputs = null, proposal = null, version = 0, permits = new WeakMap(),tickets=new WeakMap();
  const invalidate = () => {version++; permits = new WeakMap();tickets=new WeakMap();};
  const finalize = value => Object.freeze({...value, revision: fingerprint(version, value), rows: Object.freeze(value.rows.map(r => Object.freeze({...r}))), rules: freezeRules(value.rules), warnings: Object.freeze([...value.warnings])});
  return {
    get proposal() {return proposal;},
    setInputs({inventory, rules, exclusions = {}, guideResolved = true}) {
      invalidate(); proposal = null;
      if (!inventory?.entries || !rules) throw new Error('Select files and valid rules first.');
      inputs = {inventory, rules: freezeRules(rules), exclusions: {excludedIds: [...(exclusions.excludedIds || [])]}, guideResolved};
    },
    generate() {
      invalidate(); if (!inputs?.guideResolved) throw new Error('Resolve guide instructions before generating a proposal.');
      proposal = finalize(buildProposal(inputs.inventory, inputs.rules, inputs.exclusions)); validateProposal(proposal, inputs.inventory); return proposal;
    },
    beginAnalysis(context) {
      if(!inputs?.guideResolved)throw new Error('Resolve guide settings first.');invalidate();proposal=null;
      if(typeof context.modelId!=='string'||typeof context.guideDigest!=='string'||!Array.isArray(context.manualKeys))throw new Error('Invalid AI analysis context.');
      const saved=Object.freeze({...context,manualKeys:Object.freeze([...context.manualKeys])});
      const revision=fingerprint(version,{inventoryId:inputs.inventory.id,rows:[],rules:inputs.rules,analysis:saved});
      const ticket=Object.freeze({revision});tickets.set(ticket,{version,context:saved});return ticket;
    },
    acceptAnalysis(ticket,{suggestions,evidence,model,excludedIds=[]}) {
      const issued=ticket&&tickets.get(ticket);if(!issued||issued.version!==version)throw new Error('AI analysis ticket is missing or stale.');
      if(model!==issued.context.modelId||!Array.isArray(suggestions)||!Array.isArray(evidence)||!Array.isArray(excludedIds)||excludedIds.some(id=>!inputs.inventory.entries.some(entry=>entry.id===id)))throw new Error('AI analysis identity does not match.');
      const exclusions={excludedIds:[...inputs.exclusions.excludedIds,...excludedIds]},base=buildProposal(inputs.inventory,inputs.rules,exclusions),included=base.rows.filter(row=>row.included),seen=new Set();
      if(suggestions.length!==included.length||evidence.length!==included.length)throw new Error('AI analysis is missing or repeats files.');
      const byId=new Map();for(const suggestion of suggestions){if(seen.has(suggestion.fileId)||!included.some(row=>row.fileId===suggestion.fileId))throw new Error('Unknown, excluded or repeated AI file.');seen.add(suggestion.fileId);byId.set(suggestion.fileId,validateSuggestion(JSON.stringify(suggestion),{fileId:suggestion.fileId}));}
      const evidenceIds=new Set();for(const item of evidence){if(!seen.has(item.fileId)||evidenceIds.has(item.fileId)||!['text','truncated','metadata'].includes(item.kind)||(item.status!==undefined&&!['text','no-text','unsupported','error'].includes(item.status))||(item.detail!==undefined&&(typeof item.detail!=='string'||item.detail.length>300||/[\u0000-\u001f\u007f]/.test(item.detail))))throw new Error('Invalid AI evidence.');evidenceIds.add(item.fileId);}
      const used=[REPORT_PATH],manual=new Set(issued.context.manualKeys);
      const rows=base.rows.map(row=>{
        if(!row.included)return row;const suggestion=byId.get(row.fileId),entry=inputs.inventory.entries.find(e=>e.id===row.fileId),kind=evidence.find(e=>e.fileId===row.fileId).kind;
        let target=row.targetPath;
        if(suggestion.sufficient){const parts=target.split('/');if(!manual.has('naming'))parts[parts.length-1]=safeSegment(suggestion.stem,true)+entry.extension;
          if(!manual.has('groupBy')&&inputs.rules.groupBy==='type')parts.splice(0,parts.length-1,...[suggestion.category,suggestion.topic].filter(Boolean).map(part=>safeSegment(part)));target=parts.join('/');}
        target=keepBoth(target,used);used.push(target);
        const outcome=evidence.find(item=>item.fileId===row.fileId);
        return {...row,targetPath:target,operation:target===entry.sourcePath?'unchanged':'organize',reason:kind==='metadata'?`${row.reason} Metadata-only fallback. ${outcome.detail||''}`.trimEnd():`AI based on ${kind==='truncated'?'a truncated excerpt':'extracted text'}. ${suggestion.reason}`};
      });
      const analysis=Object.freeze({model,guideDigest:issued.context.guideDigest,evidence:Object.freeze(evidence.map(item=>Object.freeze({fileId:item.fileId,kind:item.kind,status:item.status||'text',detail:item.detail||''})))});
      const candidate=finalize({...base,rows,analysis});validateProposal(candidate,inputs.inventory);inputs={...inputs,exclusions};proposal=candidate;tickets.delete(ticket);return proposal;
    },
    editTarget(fileId, path) {
      invalidate(); if (!proposal) throw new Error('Generate a proposal first.');
      if (!proposal.rows.some(r => r.fileId === fileId && r.included)) throw new Error('Cannot edit an excluded or unknown file.');
      proposal = finalize({...proposal, rows: proposal.rows.map(r => r.fileId === fileId ? {...r, targetPath: path, operation: 'edit', reason: 'Target edited by you.'} : r)});
      validateProposal(proposal, inputs.inventory); return proposal;
    },
    approve() {
      if (!proposal || !inputs.guideResolved) throw new Error('Generate a current proposal first.');
      validateProposal(proposal, inputs.inventory); const ruleErrors = validateRules(proposal.rules); if (ruleErrors.length) throw new Error(ruleErrors.join(' '));
      const included = new Set(proposal.rows.filter(r => r.included).map(r => r.fileId));
      if (!included.size) throw new Error('Select at least one included file.');
      const snapshot = Object.freeze({revision: proposal.revision, inventoryId: inputs.inventory.id, rows: proposal.rows, rules: proposal.rules,analysis:proposal.analysis||null, entries: Object.freeze(inputs.inventory.entries.filter(e => included.has(e.id)))});
      const permit = Object.freeze({revision: proposal.revision}); permits.set(permit, {version, snapshot}); return permit;
    },
    resolveApproval(permit) {
      const approved = permit && permits.get(permit);
      if (!approved || approved.version !== version || approved.snapshot.revision !== proposal?.revision) throw new Error('Approval is missing, stale, or invalid. Review and approve again.');
      return approved.snapshot;
    },
    reset() {invalidate(); inputs = null; proposal = null;}
  };
}
