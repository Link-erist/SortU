import {resolveIncluded, splitName} from './inventory.js';
import {validateRules} from './rules.js';
import {validateTarget, safeSegment, REPORT_PATH, pathsConflict, pathKey} from './paths.js';

function localDate(value, timeZone) {
  if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) return 'Unknown-date';
  const parts = new Intl.DateTimeFormat('en-US', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(value));
  const pick = type => parts.find(p => p.type === type).value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
export function keepBoth(path, used) {
  let candidate = path;
  for (let number = 2; number <= 1000; number++) {
    const conflict = used.find(other => pathsConflict(candidate, other));
    if (!conflict) return candidate;
    const parts = path.split('/');
    const conflictingDepth = pathKey(path).startsWith(`${pathKey(conflict)}/`) ? conflict.split('/').length - 1 : parts.length - 1;
    const {stem, extension} = splitName(parts[conflictingDepth]);
    parts[conflictingDepth] = `${stem}-${String(number).padStart(3, '0')}${extension}`;
    candidate = parts.join('/');
  }
  throw new Error('Unable to resolve target conflicts. Edit the proposal.');
}
export function buildProposal(inventory, rules, exclusions = {}) {
  const errors = validateRules(rules); if (errors.length) throw new Error(errors.join(' '));
  const selection = resolveIncluded(inventory, {...exclusions, patterns: rules.patterns});
  const excluded = new Map(selection.excluded.map(({entry, reason}) => [entry.id, reason]));
  const used = [REPORT_PATH], warnings = [];
  const rows = inventory.entries.map(entry => {
    if (excluded.has(entry.id)) return {fileId: entry.id, sourcePath: entry.sourcePath, targetPath: null, included: false, operation: 'excluded', reason: excluded.get(entry.id)};
    const date = localDate(entry.lastModified, rules.timeZone);
    if (date === 'Unknown-date') warnings.push(`Last-modified date unavailable: ${entry.name}.`);
    const stem = safeSegment(entry.stem, true);
    let name = rules.naming === 'preserve' ? safeSegment(entry.name) : `${stem}${entry.extension}`;
    if (rules.naming === 'template') name = safeSegment(rules.template.replace(/\{(stem|category|index|date)\}/g, (_match, token) => ({stem, category: entry.category.toLowerCase(), index: String(entry.sequence + 1).padStart(3, '0'), date}[token]))) + entry.extension;
    const folder = rules.groupBy === 'type' ? entry.category : rules.groupBy === 'year' ? (date === 'Unknown-date' ? date : date.split('-')[0]) : entry.sourcePath.split('/').slice(0, -1).map(part => safeSegment(part)).join('/');
    const intended = folder ? `${folder}/${name}` : name;
    const targetPath = keepBoth(intended, used); validateTarget(targetPath); used.push(targetPath);
    const renamed = targetPath.split('/').at(-1) !== entry.name;
    const organized = targetPath !== entry.sourcePath;
    const operation = renamed ? 'rename' : organized ? 'organize' : 'unchanged';
    const reason = `${rules.groupBy === 'type' ? entry.reason : rules.groupBy === 'year' ? 'Grouped by browser last-modified year.' : 'Retained selected folder structure.'}${renamed ? ' Consistent naming applied.' : ''}${targetPath !== intended ? ' Kept both by adding a visible suffix.' : ''}`;
    return {fileId: entry.id, sourcePath: entry.sourcePath, targetPath, included: true, operation, reason};
  });
  return {revision: '', inventoryId: inventory.id, rows, rules, warnings};
}
