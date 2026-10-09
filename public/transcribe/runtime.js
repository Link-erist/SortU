// The transcription worker speaks the same protocol as the organizer AI worker, so it reuses that runtime wrapper
// for cancellation, timeouts (kept alive by progress) and stale-reply protection.
import {createLocalRuntime} from '../ai/runtime.js';
export function createTranscribeRuntime(options={}) {
 return createLocalRuntime({...options,workerFactory:options.workerFactory||(()=>new Worker(new URL('./worker.js',import.meta.url),{type:'module'}))});
}
