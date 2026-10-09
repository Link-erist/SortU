import {mountOrganizer} from './organizer/ui.js';
import {mountTransfer} from './transfer/ui.js';
export function mountWorkspaces({organizerRoot,transferRoot,organizeButton,transferButton,organizerMount=mountOrganizer,transferMount=mountTransfer}) {
  const cleanups=[organizerMount(organizerRoot),transferMount(transferRoot)];let closed=false;
  const select=name=>{organizerRoot.hidden=name!=='organize';transferRoot.hidden=name!=='transfer';organizeButton.setAttribute('aria-selected',String(name==='organize'));transferButton.setAttribute('aria-selected',String(name==='transfer'));};
  const organize=()=>select('organize'),transfer=()=>select('transfer');select('organize');
  organizeButton.addEventListener('click',organize);transferButton.addEventListener('click',transfer);
  return ()=>{if(closed)return;closed=true;organizeButton.removeEventListener('click',organize);transferButton.removeEventListener('click',transfer);cleanups.forEach(cleanup=>cleanup());};
}
