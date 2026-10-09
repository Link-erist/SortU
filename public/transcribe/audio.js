// Decodes a recording's audio track with the browser and resamples it to 16 kHz mono for Whisper.
// The recording itself is only read, never changed.
import {SAMPLE_RATE,checkDuration,checkMediaSize} from './core.js';
export async function decodeAudio(file,{signal,AudioContextClass=globalThis.AudioContext,OfflineContext=globalThis.OfflineAudioContext}={}) {
 const check=()=>{if(signal?.aborted)throw new Error('Transcription canceled.');};check();
 checkMediaSize(file);
 const bytes=await file.arrayBuffer();check();
 const context=new AudioContextClass();let decoded;
 try {decoded=await context.decodeAudioData(bytes);}
 catch{throw new Error(`${file.name}: this browser cannot decode its audio. Try MP3, WAV, M4A, OGG, FLAC, MP4 or WebM.`);}
 finally{await context.close?.();}
 check();checkDuration(decoded.duration);
 // A one-channel offline context mixes all channels down to mono while resampling.
 const offline=new OfflineContext(1,Math.ceil(decoded.duration*SAMPLE_RATE),SAMPLE_RATE),source=offline.createBufferSource();
 source.buffer=decoded;source.connect(offline.destination);source.start();
 const rendered=await offline.startRendering();check();
 return {audio:rendered.getChannelData(0),duration:decoded.duration};
}
