import test from 'node:test';import assert from 'node:assert/strict';
const segments=[{start:0,end:2.5,text:' Hello there.'},{start:2.5,end:65.123,text:' Second line, with <b>tags</b> & arrows -->'},{start:3725.4,end:null,text:'Last words'}];
test('chunk count mirrors 30 s windows with 5 s strides',async()=>{
 const {chunkCount}=await import('../public/transcribe/core.js');const rate=16000;
 assert.equal(chunkCount(rate*10),1);assert.equal(chunkCount(rate*30),1);assert.equal(chunkCount(rate*31),2);assert.equal(chunkCount(rate*50),2);assert.equal(chunkCount(rate*51),3);
});
test('SRT: numbered cues, comma milliseconds, hour rollover, missing end times filled',async()=>{
 const {toSrt}=await import('../public/transcribe/core.js');
 assert.equal(toSrt(segments,{duration:3730}),'1\n00:00:00,000 --> 00:00:02,500\nHello there.\n\n2\n00:00:02,500 --> 00:01:05,123\nSecond line, with <b>tags</b> & arrows -->\n\n3\n01:02:05,400 --> 01:02:10,000\nLast words\n');
});
test('WebVTT: header, dot milliseconds, cue text cannot break the format',async()=>{
 const {toVtt}=await import('../public/transcribe/core.js');const vtt=toVtt(segments,{duration:3730});
 assert.ok(vtt.startsWith('WEBVTT\n\n'));assert.match(vtt,/00:00:02\.500 --> 00:01:05\.123\nSecond line, with &lt;b&gt;tags&lt;\/b&gt; &amp; arrows --&gt;\n/);assert.match(vtt,/01:02:05\.400 --> 01:02:10\.000\nLast words/);
});
test('plain text: one timestamped line per segment',async()=>{
 const {toText}=await import('../public/transcribe/core.js');
 assert.equal(toText(segments),'[00:00:00] Hello there.\n[00:00:02] Second line, with <b>tags</b> & arrows -->\n[01:02:05] Last words\n');
});
test('segments are cleaned: empty text dropped, order and non-negative times enforced',async()=>{
 const {cleanSegments}=await import('../public/transcribe/core.js');
 assert.deepEqual(cleanSegments([{start:5,end:6,text:'b'},{start:1,end:2,text:'  '},{start:-1,end:1,text:'a'},{start:7,end:6,text:'c'}],{duration:10}),[{start:0,end:1,text:'a'},{start:5,end:6,text:'b'},{start:7,end:7,text:'c'}]);
});
test('input limits: size and duration are checked with clear messages',async()=>{
 const {checkMediaSize,checkDuration,MAX_BYTES,MAX_SECONDS}=await import('../public/transcribe/core.js');
 assert.doesNotThrow(()=>checkMediaSize({size:MAX_BYTES,name:'a.mp3'}));assert.throws(()=>checkMediaSize({size:MAX_BYTES+1,name:'a.mp3'}),/200 MiB/);
 assert.doesNotThrow(()=>checkDuration(MAX_SECONDS));assert.throws(()=>checkDuration(MAX_SECONDS+1),/30 minutes/);assert.throws(()=>checkDuration(0),/no audio/i);
});
test('output names keep the recording name and add one file per chosen format',async()=>{
 const {outputNames}=await import('../public/transcribe/core.js');
 assert.deepEqual(outputNames('meeting.final.mp4',['srt','txt']),['meeting.final.srt','meeting.final.txt']);assert.deepEqual(outputNames('noext',['vtt']),['noext.vtt']);
 assert.throws(()=>outputNames('a.mp3',[]),/at least one/);assert.throws(()=>outputNames('a.mp3',['docx']),/format/);
});
function audioMocks({duration=12,fail=false}={}) {
 const calls={closed:0,offline:null};
 class AudioContextMock{async decodeAudioData(){if(fail)throw new Error('EncodingError');return {duration,numberOfChannels:2,sampleRate:48000};}close(){calls.closed++;}}
 class OfflineMock{constructor(channels,length,rate){calls.offline={channels,length,rate};this.destination={};}createBufferSource(){return {connect(){},start(){},set buffer(value){calls.buffer=value;}};}async startRendering(){return {getChannelData:()=>new Float32Array(calls.offline.length)};}}
 return {calls,AudioContextClass:AudioContextMock,OfflineContext:OfflineMock};
}
test('audio is decoded then resampled to 16 kHz mono; the decoding context is always closed',async()=>{
 const {decodeAudio}=await import('../public/transcribe/audio.js');const {calls,...classes}=audioMocks({duration:12});
 const result=await decodeAudio(new File(['x'],'talk.mp3'),classes);assert.equal(result.duration,12);assert.equal(result.audio.length,12*16000);assert.deepEqual(calls.offline,{channels:1,length:192000,rate:16000});assert.equal(calls.closed,1);
});
test('undecodable, silent, too long and oversized media fail with clear messages',async()=>{
 const {decodeAudio}=await import('../public/transcribe/audio.js');
 let mocks=audioMocks({fail:true});await assert.rejects(()=>decodeAudio(new File(['x'],'clip.mkv'),mocks),/clip\.mkv.*cannot decode/);assert.equal(mocks.calls.closed,1);
 await assert.rejects(()=>decodeAudio(new File(['x'],'a.mp4'),audioMocks({duration:0})),/no audio track/);
 await assert.rejects(()=>decodeAudio(new File(['x'],'a.mp4'),audioMocks({duration:31*60})),/30 minutes/);
 const big=new File(['x'],'big.mp4');Object.defineProperty(big,'size',{value:201*1024*1024});big.arrayBuffer=()=>{throw new Error('read');};await assert.rejects(()=>decodeAudio(big,audioMocks()),/200 MiB/);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>decodeAudio(new File(['x'],'a.mp3'),{...audioMocks(),signal:controller.signal}),/cancel/i);
});
test('duplicate transcript names get a number; the ZIP holds every transcript byte for byte',async()=>{
 const {uniqueNames,zipTexts}=await import('../public/transcribe/ui.js');const {readStoredZip}=await import('./helpers/stored-zip.mjs');
 assert.deepEqual(uniqueNames(['talk.srt','talk.txt','talk.srt','Talk.SRT']),['talk.srt','talk.txt','talk (2).srt','Talk (3).SRT']);
 const zip=zipTexts([{name:'talk.srt',text:'1\n00:00:00,000 --> 00:00:01,000\nHi\n'},{name:'talk.txt',text:'[00:00:00] Hi ñ\n'}]);
 const entries=readStoredZip(Buffer.from(await zip.arrayBuffer()));assert.equal(new TextDecoder().decode(entries['talk.txt']),'[00:00:00] Hi ñ\n');assert.equal(Object.keys(entries).length,2);
});
