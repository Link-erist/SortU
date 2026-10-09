import {Zip, ZipPassThrough} from '../vendor/zip.js';
import {sha256} from '../vendor/sha256.js';
import {validateTarget} from './paths.js';
export const ZIP_LIMIT = 67108864;
export function createArchiveCore({maxBytes = ZIP_LIMIT, onChunk}) {
  let entry = null, closed = false, bytes = 0, minimumBytes = 22;
  const names = new Set();
  const zip = new Zip((error, data) => {
    if (error) throw error;
    bytes += data.length;
    if (bytes > maxBytes) throw new Error('ZIP output exceeds the size limit.');
    if (data.length) onChunk(data.slice());
  });
  const check = () => {if (closed) throw new Error('Archive canceled or closed.');};
  return {
    addEntry({path, size, date}) {
      check(); validateTarget(path);
      if (entry || names.has(path) || !Number.isSafeInteger(size) || size < 0) throw new Error('Invalid or duplicate ZIP entry.');
      minimumBytes += size + 92 + 2 * new TextEncoder().encode(path).length;
      if (minimumBytes > maxBytes) throw new Error('ZIP entry exceeds the archive size limit.');
      names.add(path); const stream = new ZipPassThrough(path);
      // ZIP's DOS date range cannot represent every File last-modified value.
      const candidate = date == null ? new Date(2000, 0, 1) : new Date(date);
      stream.mtime = Number.isFinite(candidate.getTime()) && candidate.getFullYear() >= 1980 && candidate.getFullYear() <= 2099 ? candidate : new Date(2000, 0, 1);
      entry = {stream, size, written: 0, hash: sha256.create()}; zip.add(stream);
    },
    write(data) {check(); if (!entry || !(data instanceof Uint8Array) || !data.length || data.length > 32768 || entry.written + data.length > entry.size) throw new Error('Invalid ZIP input chunk.'); entry.hash.update(data); entry.stream.push(data, false); entry.written += data.length;},
    endEntry() {check(); if (!entry || entry.written !== entry.size) throw new Error('ZIP entry incomplete.'); entry.stream.push(new Uint8Array(), true); const digest = Array.from(entry.hash.digest(), b => b.toString(16).padStart(2, '0')).join(''); entry = null; return {digest};},
    finish() {check(); if (entry) throw new Error('Finish the current entry first.'); zip.end(); closed = true; return {bytes};},
    cancel() {closed = true; entry?.hash.destroy(); entry = null; zip.terminate();}
  };
}
export function estimateArchiveBytes(entries, reportBytes) {
  const encoder = new TextEncoder();
  return 22 + reportBytes + 256 + 2 * encoder.encode('organization-report.json').length + entries.reduce((n, e) => n + e.size + 256 + 2 * encoder.encode(e.targetPath).length, 0);
}
