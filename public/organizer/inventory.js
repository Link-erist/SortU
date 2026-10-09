const extensions = {
  Documents: 'pdf txt md doc docx odt rtf csv xls xlsx ppt pptx',
  Images: 'jpg jpeg png gif webp heic heif avif bmp svg tiff tif',
  Audio: 'mp3 wav flac aac m4a ogg opus',
  Video: 'mp4 mov mkv webm avi m4v',
  Archives: 'zip rar 7z tar gz bz2 xz tar.gz tar.bz2 tar.xz',
  Code: 'js mjs cjs ts tsx jsx py go rs c cpp h cs java html css json yaml yml toml sql sh ps1'
};
export function splitName(name) {
  const compound = ['.tar.gz', '.tar.bz2', '.tar.xz'].find(ext => name.toLowerCase().endsWith(ext));
  const dot = compound ? name.length - compound.length : name.lastIndexOf('.');
  return dot > 0 ? {stem: name.slice(0, dot), extension: name.slice(dot)} : {stem: name, extension: ''};
}
export function classify(entry) {
  const ext = (entry.extension || splitName(entry.name).extension).slice(1).toLowerCase();
  const category = Object.entries(extensions).find(([, values]) => values.split(' ').includes(ext))?.[0] || 'Other';
  return {category, reason: ext ? `${ext.toUpperCase()} extension; grouped under ${category}.` : 'No recognized extension; grouped under Other.'};
}
export function createInventory(files, {idFactory = () => crypto.randomUUID()} = {}) {
  const selected = Array.from(files);
  if (!selected.length || selected.length > 100) throw new Error('Select between 1 and 100 files.');
  const entries = selected.map((file, sequence) => {
    const sourcePath = file.webkitRelativePath || file.name;
    if (typeof file.name !== 'string' || !file.name || typeof sourcePath !== 'string' || sourcePath.length > 1024 || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('Invalid file metadata or source path too long.');
    const nameParts = splitName(file.name);
    const entry = {id: idFactory(), file, sequence, name: file.name, sourcePath, size: file.size, type: file.type || '', lastModified: file.lastModified, ...nameParts};
    return Object.freeze({...entry, ...classify(entry)});
  });
  return Object.freeze({id: idFactory(), entries: Object.freeze(entries)});
}
export function wildcardMatch(pattern, value) {
  const p = pattern.normalize('NFC').toLowerCase(), text = value.normalize('NFC').toLowerCase();
  let i = 0, j = 0, star = -1, checkpoint = 0;
  while (i < text.length) {
    if (p[j] === '?' || p[j] === text[i]) {i++; j++;}
    else if (p[j] === '*') {star = j++; checkpoint = i;}
    else if (star >= 0) {j = star + 1; i = ++checkpoint;}
    else return false;
  }
  while (p[j] === '*') j++;
  return j === p.length;
}
export function resolveIncluded(inventory, {excludedIds = [], patterns = []} = {}) {
  if (!Array.isArray(patterns) || patterns.length > 20 || patterns.some(p => typeof p !== 'string' || !p || p.length > 256)) throw new Error('Use at most 20 exclusion patterns, each up to 256 characters.');
  const manual = new Set(excludedIds), included = [], excluded = [];
  for (const entry of inventory.entries) {
    const pattern = patterns.find(p => wildcardMatch(p, entry.sourcePath) || wildcardMatch(p, entry.name));
    if (manual.has(entry.id) || pattern) excluded.push({entry, reason: manual.has(entry.id) ? 'Excluded by you.' : `Excluded by pattern: ${pattern}`});
    else included.push(entry);
  }
  return {included, excluded};
}
