import qrcodegen from '../vendor/qrcodegen.js';
import jsQR from '../vendor/jsqr.js';
import {createFrameCollector} from './pairing.js';

export function qrPixels(text, scale = 4) {
  const qr = qrcodegen.QrCode.encodeText(text,qrcodegen.QrCode.Ecc.MEDIUM);
  const width = (qr.size + 8) * scale; const data = new Uint8ClampedArray(width*width*4).fill(255);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++) {
    if(qr.getModule(Math.floor(x/scale)-4,Math.floor(y/scale)-4)){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
  }
  return {data,width,height:width};
}
export const decodePixels = (data,width,height) => jsQR(data,width,height,{inversionAttempts:'dontInvert'})?.data || null;
export function renderQr(canvas,text) {const pixels=qrPixels(text);canvas.width=pixels.width;canvas.height=pixels.height;canvas.getContext('2d').putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);}

export async function scanPairing(video,onPayload,onProgress=()=>{},onError=()=>{}) {
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:640}},audio:false});
  let stopped=false;let timer;const collector=createFrameCollector();const canvas=document.createElement('canvas');
  video.srcObject=stream;video.hidden=false;
  const stop=()=>{stopped=true;clearTimeout(timer);stream.getTracks().forEach(t=>t.stop());video.srcObject=null;video.hidden=true;};
  try{await video.play();}catch(error){stop();throw error;}
  let nativeDetector=null;
  try{if(globalThis.BarcodeDetector && (await BarcodeDetector.getSupportedFormats()).includes('qr_code'))nativeDetector=new BarcodeDetector({formats:['qr_code']});}catch{/* Bundled decoder covers browsers without native QR support. */}
  const tick=async()=>{
    if(stopped)return;
    try {
      let text;
      if(nativeDetector){try{text=(await nativeDetector.detect(video))[0]?.rawValue;}catch{nativeDetector=null;}}
      if(!nativeDetector && video.videoWidth){const ratio=Math.min(1,640/video.videoWidth);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);text=decodePixels(pixels.data,canvas.width,canvas.height);}
      if(text){const result=await collector.add(text);onProgress(collector.progress);if(result){stop();await onPayload(result);return;}}
    }catch(error){stop();onError(error);return;}
    if(!stopped)timer=setTimeout(tick,180);
  };
  timer=setTimeout(tick,0);return stop;
}
