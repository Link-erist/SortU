// When the WebGPU device is lost (usually the graphics chip running out of memory, or a driver reset), WebLLM 0.2.85
// unloads the model, but a generation already running keeps using the deleted JSON grammar matcher. That surfaces as
// "Cannot pass deleted object as a pointer of type GrammarMatcher" or "GrammarMatcher instance already deleted",
// and the engine cannot be reused. Start a fresh engine from the local cache once and retry the request.
export const GPU_LOST='The graphics chip stopped responding, often because it ran out of memory. Close other tabs or apps that use graphics, then try again.';
export const lostModel=error=>/deleted object|already deleted|GrammarMatcher|device (was )?lost|model not loaded|not loaded/i.test(error?.message||'');
export async function completeWithRecovery(getEngine,restart,request) {
 try {await getEngine().resetChat();return await getEngine().chat.completions.create(request);}
 catch(error) {
  if(!lostModel(error))throw error;
  try {await restart();await getEngine().resetChat();return await getEngine().chat.completions.create(request);}
  catch(retryError) {throw lostModel(retryError)||/webgpu|adapter|device/i.test(retryError?.message||'')?new Error(GPU_LOST):retryError;}
 }
}
