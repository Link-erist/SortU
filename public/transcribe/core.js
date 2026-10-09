// Pure transcription helpers: input limits, chunk counting, segment cleanup and the SRT / WebVTT / text writers.
export const SAMPLE_RATE=16000,CHUNK_SECONDS=30,STRIDE_SECONDS=5;
export const MAX_BYTES=200*1024*1024,MAX_SECONDS=30*60;
export const FORMATS=Object.freeze({srt:'SubRip subtitles (.srt)',vtt:'WebVTT subtitles (.vtt)',txt:'Text with timestamps (.txt)'});
export function checkMediaSize(file) {
 if(file.size>MAX_BYTES)throw new Error(`${file.name} is larger than the 200 MiB transcription limit.`);
}
// Decoding holds the whole audio track in memory, so recordings are limited to 30 minutes.
export function checkDuration(seconds) {
 if(!(seconds>0))throw new Error('This file has no audio track that the browser can decode.');
 if(seconds>MAX_SECONDS)throw new Error('Recordings longer than 30 minutes are not supported yet. Trim the file and try again.');
}
// Number of windows transformers.js processes for this many samples (mirrors its chunking loop).
export function chunkCount(samples) {
 const window=SAMPLE_RATE*CHUNK_SECONDS,jump=window-2*SAMPLE_RATE*STRIDE_SECONDS;let count=1;
 for(let offset=0;offset+window<samples;offset+=jump)count++;
 return count;
}
export function cleanSegments(segments,{duration=0}={}) {
 const sorted=segments.map(segment=>({start:Math.max(0,Number(segment.start)||0),end:segment.end==null?null:Math.max(0,Number(segment.end)),text:String(segment.text??'').replace(/\s+/g,' ').trim()}))
  .filter(segment=>segment.text).sort((a,b)=>a.start-b.start);
 // A missing end time runs to the next segment, or to the end of the recording.
 return sorted.map((segment,index)=>{const fallback=sorted[index+1]?.start??Math.max(duration,segment.start);const end=segment.end==null||Number.isNaN(segment.end)?fallback:segment.end;return {...segment,end:Math.max(end,segment.start)};});
}
const pad=(value,width=2)=>String(value).padStart(width,'0');
function clock(seconds,separator) {
 const millis=Math.round(seconds*1000),h=Math.floor(millis/3600000),m=Math.floor(millis/60000)%60,s=Math.floor(millis/1000)%60;
 return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(millis%1000,3)}`;
}
export function toSrt(segments,options) {
 return cleanSegments(segments,options).map((segment,index)=>`${index+1}\n${clock(segment.start,',')} --> ${clock(segment.end,',')}\n${segment.text}\n`).join('\n');
}
// WebVTT cue text is HTML-like, so markup characters are escaped; "-->" cannot appear unescaped either.
const escapeVtt=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function toVtt(segments,options) {
 return 'WEBVTT\n\n'+cleanSegments(segments,options).map(segment=>`${clock(segment.start,'.')} --> ${clock(segment.end,'.')}\n${escapeVtt(segment.text)}\n`).join('\n');
}
export function toText(segments,options) {
 return cleanSegments(segments,options).map(segment=>`[${clock(segment.start,'.').slice(0,8)}] ${segment.text}\n`).join('');
}
export const WRITERS={srt:toSrt,vtt:toVtt,txt:toText};
export function outputNames(name,formats) {
 if(!formats.length)throw new Error('Choose at least one transcript format.');
 const unknown=formats.find(format=>!FORMATS[format]);if(unknown)throw new Error(`Unknown transcript format: ${unknown}.`);
 const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name;
 return formats.map(format=>`${stem}.${format}`);
}
