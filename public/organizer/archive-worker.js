import {createArchiveCore} from './archive-core.js';
let archive;
self.onmessage = ({data}) => {
  try {
    if (data.v !== 1) throw new Error('Unsupported archive worker request.');
    if (data.type === 'init') {archive = createArchiveCore({maxBytes: data.maxBytes, onChunk: bytes => self.postMessage({v: 1, type: 'chunk', bytes: bytes.buffer}, [bytes.buffer])}); self.postMessage({v: 1, id: data.id}); return;}
    if (!archive || !['addEntry', 'write', 'endEntry', 'finish', 'cancel'].includes(data.type)) throw new Error('Invalid archive operation.');
    const result = archive[data.type](data.type === 'write' ? new Uint8Array(data.bytes) : data.entry);
    self.postMessage({v: 1, id: data.id, result});
  } catch (error) {archive?.cancel(); self.postMessage({v: 1, id: data.id, error: error.message});}
};
