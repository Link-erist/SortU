import {buildContext,gateInput,parseCommand,parseResponse,previewActions,settleModelResponse} from './core.js';
// One assistant turn about the current proposal. Clear commands are handled by rules against the real names; only
// other requests reach the model. The result is a reply plus an optional preview that the user applies with Apply.
export async function askAssistant({runtime,proposal,message}) {
 const context=buildContext(proposal),gate=gateInput(message,{names:context.names});
 if(!gate.ok)return {reply:gate.reply,preview:null,gated:true};
 const command=parseCommand(gate.text,context,proposal);
 if(command)return {reply:command.reply,preview:command.actions.length?previewActions(proposal,context,command.actions):null,source:'rules'};
 const {raw}=await runtime.generate({kind:'assistant',contextText:context.text,aliases:[...context.aliases.keys()],request:gate.text,revision:proposal.revision});
 const parsed=settleModelResponse(parseResponse(raw,context));
 return {reply:parsed.reply,preview:parsed.actions.length?previewActions(proposal,context,parsed.actions):null,raw,source:'model'};
}
