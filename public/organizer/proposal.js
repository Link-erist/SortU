import {buildProposal} from './planner.js';
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
const fingerprint = (version, p) => Array.from(sha256(new TextEncoder().encode(JSON.stringify([version, p.inventoryId, p.rows, p.rules]))), b => b.toString(16).padStart(2, '0')).join('');
export function createOrganizerSession() {
  let inputs = null, proposal = null, version = 0, permits = new WeakMap();
  const invalidate = () => {version++; permits = new WeakMap();};
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
      const snapshot = Object.freeze({revision: proposal.revision, inventoryId: inputs.inventory.id, rows: proposal.rows, rules: proposal.rules, entries: Object.freeze(inputs.inventory.entries.filter(e => included.has(e.id)))});
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
