// WebLLM 0.2.85 can leave a released JSON grammar matcher in place ("Cannot pass deleted object as a pointer of
// type GrammarMatcher"). The model weights are fine, so reload the model from the local cache once and retry.
export const brokenGrammar=error=>/deleted object|GrammarMatcher/i.test(error?.message||'');
export async function completeWithRecovery(engine,reload,request) {
 try {await engine.resetChat();return await engine.chat.completions.create(request);}
 catch(error) {
  if(!brokenGrammar(error))throw error;
  await reload();
  return await engine.chat.completions.create(request);
 }
}
