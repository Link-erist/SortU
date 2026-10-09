// Turns the browser and graphics checks into one plain-language verdict that every visitor sees.
const TESTED='Use Chrome or Edge on a computer, or Chrome on Android.';
const PLAIN=[
 [/HTTPS/,'The page must be opened over a secure (HTTPS) connection.'],
 [/WebGPU/,"This browser doesn't let web pages use the graphics chip (WebGPU)."],
 [/graphics adapter/,'No usable graphics chip was found.'],
 [/shader-f16/,"The graphics chip doesn't support 16-bit shaders (shader-f16)."],
 [/storage limits/,"The graphics chip's memory limits are too low for the model."],
 [/Graphics access failed/,'The graphics chip could not be accessed.']
];
export function plainReason(reason) {
 const match=PLAIN.find(([pattern])=>pattern.test(String(reason||'')));
 return match?match[1]:String(reason||'The device check could not finish.');
}
// support: browserSupport(); organizer/transcribe: checkAiCapabilities() results for each model.
export function compatibilityVerdict({support,organizer,transcribe}) {
 const reasons=[];let level,title,summary;
 if(support.level==='rejected') {
  level='unsupported';title='Not supported';reasons.push(`${support.name} is not supported for the organizer.`);
  summary=`The organizer does not work in ${support.name}. ${TESTED} File transfer still works here.`;
 } else if(organizer.supported) {
  level='full';title='Fully supported';summary='This device can run Local AI. Every feature works here.';
  if(support.level==='untested')reasons.push(`This browser has not been tested. ${TESTED}`);
 } else if(support.level==='untested') {
  level='unsupported';title='Not supported';reasons.push(plainReason(organizer.reason),`This browser has not been tested. ${TESTED}`);
  summary='The organizer cannot run in this browser. File transfer still works here.';
 } else {
  level='basic';title='Basic organization only';reasons.push(plainReason(organizer.reason));
  summary='This device cannot run Local AI. Files can still be organized by name and metadata, and file transfer works.';
 }
 const transcribeOk=!!transcribe?.supported;
 return {level,title,summary,reasons,transcribe:{supported:transcribeOk,text:transcribeOk?'Transcription can run on this device.':`Transcription cannot run on this device. ${plainReason(transcribe?.reason)}`}};
}
