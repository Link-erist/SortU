export const REPORT_PATH = 'organization-report.json';
export const pathKey = path => path.normalize('NFC').toLowerCase();
const reserved = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
export function validateTarget(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || /[\\:\u0000-\u001f\u007f<>"|?*]/.test(path)) throw new Error('Invalid target path or path too long.');
  for (const part of path.split('/')) {
    if (!part || part === '.' || part === '..' || part.length > 120 || /[. ]$/.test(part) || reserved.test(part)) throw new Error('Unsafe target path segment or Windows reserved name.');
  }
  return path;
}
export function safeSegment(value, normalize = false) {
  let text = String(value).normalize('NFC').replace(/[\\/:\u0000-\u001f\u007f<>"|?*]/g, '-');
  if (normalize) text = text.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  text = text.replace(/[. ]+$/g, '') || 'file';
  if (text === '.' || text === '..' || reserved.test(text)) text = `file-${text}`;
  return text;
}
export const pathsConflict = (a, b) => {const x = pathKey(a), y = pathKey(b); return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);};
