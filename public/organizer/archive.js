import {createArchiveCore, estimateArchiveBytes, ZIP_LIMIT} from './archive-core.js';
export {estimateArchiveBytes, ZIP_LIMIT};
export function createArchive({maxBytes = ZIP_LIMIT, onChunk, workerFactory} = {}) {
  if (typeof onChunk !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > ZIP_LIMIT) throw new Error('Invalid archive output configuration.');
  let closed = false, nextId = 0, pending = null, chain = Promise.resolve();
  const worker = workerFactory ? workerFactory() : typeof Worker === 'function' ? new Worker(new URL('./archive-worker.js', import.meta.url), {type: 'module'}) : null;
  const outputs = [], core = worker ? null : createArchiveCore({maxBytes, onChunk: bytes => outputs.push(bytes)});
  const reject = error => {closed = true; worker?.terminate(); core?.cancel(); pending?.reject(error); pending = null;};
  if (worker) {
    worker.onmessage = ({data}) => {chain = chain.then(async () => {
      if (closed) return;
      if (data.v !== 1) throw new Error('Invalid archive worker response.');
      if (data.type === 'chunk') {await onChunk(new Uint8Array(data.bytes)); return;}
      if (pending?.id !== data.id) throw new Error('Unexpected archive acknowledgment.');
      const p = pending; pending = null; data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
    }).catch(reject);};
    worker.onerror = () => reject(new Error('Archive worker failed.'));
  }
  async function request(type, entry, bytes) {
    if (closed) throw new Error('Archive canceled or closed.');
    if (pending) throw new Error('Wait for the previous archive chunk.');
    if (!worker) {const result = core[type](type === 'write' ? bytes : entry); while (outputs.length) await onChunk(outputs.shift()); return result;}
    return new Promise((resolve, rejectPromise) => {
      const id = ++nextId; pending = {id, resolve, reject: rejectPromise};
      if (bytes) {const copy = bytes.slice(); worker.postMessage({v: 1, id, type, bytes: copy.buffer}, [copy.buffer]);}
      else worker.postMessage({v: 1, id, type, entry, maxBytes});
    });
  }
  const initialized = worker ? request('init') : Promise.resolve(); initialized.catch(() => {});
  const run = async (type, entry, bytes) => {await initialized; return request(type, entry, bytes);};
  return {addEntry: entry => run('addEntry', entry), write: bytes => run('write', null, bytes), endEntry: () => run('endEntry'), async finish() {const result = await run('finish'); closed = true; worker?.terminate(); return result;}, cancel() {reject(new Error('Archive canceled.'));}};
}
