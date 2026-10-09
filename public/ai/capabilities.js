export async function checkAiCapabilities(navigatorLike,{secureContext=globalThis.isSecureContext,model={}}={}) {
 if(!secureContext)return {supported:false,reason:'Local AI requires HTTPS or localhost.'};
 if(!navigatorLike.gpu)return {supported:false,reason:'This browser does not expose WebGPU. Rules mode remains available.'};
 try {const adapter=await navigatorLike.gpu.requestAdapter();if(!adapter)return {supported:false,reason:'No usable graphics adapter was found.'};
  const required=model.requiredFeatures||['shader-f16'];if(required.some(feature=>!adapter.features.has(feature)))return {supported:false,reason:'This AI profile requires shader-f16 support. Use Rules mode.'};
  return {supported:true,features:[...adapter.features],limits:{maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize,maxBufferSize:adapter.limits.maxBufferSize},reason:'Capability check passed. Model loading still needs verification.'};
 }catch{return {supported:false,reason:'Graphics access failed. Rules mode remains available.'};}
}
