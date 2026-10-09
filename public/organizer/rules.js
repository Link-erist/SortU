export function defaultRules() {
  return {groupBy: 'type', naming: 'normalize', template: '{stem}', patterns: [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone};
}
export function validateRules(rules) {
  const errors = [];
  if (!['type', 'year', 'folders'].includes(rules.groupBy)) errors.push('Group by must be type, year, or folders.');
  if (!['normalize', 'preserve', 'template'].includes(rules.naming)) errors.push('Choose normalize, preserve, or template naming.');
  if (typeof rules.template !== 'string' || !rules.template || rules.template.length > 256) errors.push('Naming template must have 1 to 256 characters.');
  else if (rules.naming === 'template') {
    const stripped = rules.template.replace(/\{(stem|category|index|date)\}/g, '');
    if (/[{}]/.test(stripped)) errors.push('Supported tokens are {stem}, {category}, {index}, and {date}.');
    if (/[\\/\u0000-\u001f\u007f]/.test(rules.template)) errors.push('Naming templates cannot contain folders or control characters.');
  }
  if (!Array.isArray(rules.patterns) || rules.patterns.length > 20 || rules.patterns.some(p => typeof p !== 'string' || !p || p.length > 256)) errors.push('Use at most 20 patterns of up to 256 characters.');
  try {new Intl.DateTimeFormat('en', {timeZone: rules.timeZone});} catch {errors.push('Invalid date time zone.');}
  return errors;
}
export function parseGuide(text, {source = 'typed'} = {}) {
  const limit = source === 'readme' ? 32768 : 8192;
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > limit) throw new Error(`Guide text exceeds the ${limit / 1024} KiB limit.`);
  const rules = {}, errors = [], unsupported = [], seen = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(Group by|Naming|Exclude)\s*:\s*(.*)$/i.exec(line);
    if (!match) {unsupported.push(line); continue;}
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (seen.has(key) && seen.get(key) !== value) {errors.push(`Conflicting ${match[1]} directives.`); continue;}
    seen.set(key, value);
    if (key === 'group by') rules.groupBy = value.toLowerCase();
    if (key === 'naming') {
      rules.naming = ['preserve', 'normalize'].includes(value.toLowerCase()) ? value.toLowerCase() : 'template';
      if (rules.naming === 'template') rules.template = value;
    }
    if (key === 'exclude') rules.patterns = value ? value.split(',').map(p => p.trim()).filter(Boolean) : [];
  }
  errors.push(...validateRules({...defaultRules(), ...rules}));
  return {rules, unsupported, errors, source};
}
export function resolveRules({guides = [], controls = {}, automatic = false} = {}) {
  const rules = defaultRules(), errors = [], warnings = [];
  if (!automatic) {
    const seen = new Map();
    for (const guide of guides) {
      errors.push(...guide.errors, ...guide.unsupported.map(line => `Unsupported instruction: ${line}`));
      for (const [key, value] of Object.entries(guide.rules)) {
        if (seen.has(key) && seen.get(key) !== JSON.stringify(value)) errors.push(`Conflicting guides for ${key}.`);
        seen.set(key, JSON.stringify(value)); rules[key] = value;
      }
    }
  } else if (guides.length) warnings.push('Automatic organization selected; guide instructions are not applied.');
  for (const [key, value] of Object.entries(controls)) {
    if (!Object.hasOwn(rules, key)) {errors.push('Unknown organization setting.'); continue;}
    if (!automatic && guides.some(g => Object.hasOwn(g.rules, key)) && JSON.stringify(rules[key]) !== JSON.stringify(value)) warnings.push(`Manual override: ${key}.`);
    rules[key] = value;
  }
  errors.push(...validateRules(rules));
  return {rules, errors, warnings};
}
