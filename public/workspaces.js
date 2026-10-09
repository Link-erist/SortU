import {mountOrganizer} from './organizer/ui.js';
import {mountTransfer} from './transfer/ui.js';
import {mountTranscribe} from './transcribe/ui.js';
// Each workspace mounts once and keeps its state while hidden; switching only changes visibility.
export function mountWorkspaces({organizerRoot,transferRoot,transcribeRoot,organizeButton,transferButton,transcribeButton,organizerMount=mountOrganizer,transferMount=mountTransfer,transcribeMount=mountTranscribe}) {
  const workspaces=[['organize',organizerRoot,organizeButton,organizerMount],['transfer',transferRoot,transferButton,transferMount],['transcribe',transcribeRoot,transcribeButton,transcribeMount]].filter(([,root,button])=>root&&button);
  const cleanups=workspaces.map(([,root,,mount])=>mount(root));let closed=false;
  const select=name=>{for(const [id,root,button] of workspaces){root.hidden=id!==name;button.setAttribute('aria-selected',String(id===name));}};
  const handlers=workspaces.map(([id,,button])=>{const handler=()=>select(id);button.addEventListener('click',handler);return [button,handler];});
  select('organize');
  return ()=>{if(closed)return;closed=true;for(const [button,handler] of handlers)button.removeEventListener('click',handler);cleanups.forEach(cleanup=>cleanup());};
}
