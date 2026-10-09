import {buildContext,gateInput,parseCommand,parseResponse,previewActions,settleModelResponse} from './core.js';
export const RULES_ONLY="I understand these requests: move X to Y, keep X with Y, rename folder A to B, merge A into B, and why is X in Y. Other requests need Local AI, which is not available on this device.";
// One assistant turn about the current proposal. Clear commands are handled by rules against the real names; only
// other requests reach the model, which is loaded on demand through getRuntime() (or null when Local AI is unavailable).
export async function askAssistant({getRuntime,runtime,proposal,message}) {
 const context=buildContext(proposal),gate=gateInput(message,{names:context.names});
 if(!gate.ok)return {reply:gate.reply,preview:null,gated:true};
 const command=parseCommand(gate.text,context,proposal);
 if(command)return {reply:command.reply,preview:command.actions.length?previewActions(proposal,context,command.actions):null,source:'rules'};
 const model=runtime||await getRuntime?.();if(!model)return {reply:RULES_ONLY,preview:null,source:'rules'};
 const {raw}=await model.generate({kind:'assistant',contextText:context.text,aliases:[...context.aliases.keys()],request:gate.text,revision:proposal.revision});
 const parsed=settleModelResponse(parseResponse(raw,context));
 return {reply:parsed.reply,preview:parsed.actions.length?previewActions(proposal,context,parsed.actions):null,raw,source:'model'};
}
// Before a proposal exists, a message sets the direction for Organize. Grouping words pick an organize-by option.
export function directionFrom(message) {
 const gate=gateInput(message);if(!gate.ok)return {reply:gate.reply};
 const text=gate.text,lower=text.toLowerCase();
 const organizeBy=/\bby (date|year|month)\b/.test(lower)?'year':/\bby (file )?(type|extension|kind)\b/.test(lower)?'type':/\bby (content|subject|topic|meaning)\b/.test(lower)?'content':/\b(original|existing|same) folders?\b/.test(lower)?'folders':null;
 return {text,organizeBy};
}
