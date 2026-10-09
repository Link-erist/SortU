export async function checkAiCapabilities(navigatorLike,{secureContext=globalThis.isSecureContext,model={}}={}) {
 if(!secureContext)return {supported:false,reason:'Local AI requires HTTPS or localhost.'};
 if(!navigatorLike.gpu)return {supported:false,reason:'This browser does not expose WebGPU.'};
 try {const adapter=await navigatorLike.gpu.requestAdapter();if(!adapter)return {supported:false,reason:'No usable graphics adapter was found.'};
  const required=model.requiredFeatures||['shader-f16'];if(required.some(feature=>!adapter.features.has(feature)))return {supported:false,reason:'This AI profile requires shader-f16 support.'};
  if(!(adapter.limits.maxComputeWorkgroupStorageSize>=32768)||!(adapter.limits.maxStorageBuffersPerShaderStage>=10))return {supported:false,reason:'Graphics storage limits are below this model runtime requirement.'};
  return {supported:true,features:[...adapter.features],limits:{maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize,maxBufferSize:adapter.limits.maxBufferSize,maxComputeWorkgroupStorageSize:adapter.limits.maxComputeWorkgroupStorageSize,maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage},reason:'Capability check passed. Model loading still needs verification.'};
 }catch{return {supported:false,reason:'Graphics access failed.'};}
}
// Which browsers we advertise for Local AI. 'untested' browsers may still pass the capability check and run it.
// Brand hints are preferred because some Chromium browsers (such as Brave) send a Chrome-identical user agent.
export function browserSupport(navigatorLike) {
 const brands=(navigatorLike?.userAgentData?.brands||[]).map(entry=>entry.brand);
 if(brands.includes('Microsoft Edge'))return {level:'supported',name:'Edge'};
 if(brands.includes('Google Chrome'))return {level:'supported',name:'Chrome'};
 const ua=String(navigatorLike?.userAgent||'');
 if(/Firefox\/|FxiOS\//.test(ua))return {level:'rejected',name:'Firefox'};
 if(brands.length||/OPR\/|SamsungBrowser\/|Vivaldi|YaBrowser|CriOS\//.test(ua))return {level:'untested',name:'This browser'};
 if(/Edg\//.test(ua))return {level:'supported',name:'Edge'};
 if(/Chrome\//.test(ua))return {level:'supported',name:'Chrome'};
 return {level:'untested',name:/Safari\//.test(ua)?'Safari':'This browser'};
}
