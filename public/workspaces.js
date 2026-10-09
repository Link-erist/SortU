import {mountOrganizer} from './organizer/ui.js';
import {mountTransfer} from './transfer/ui.js';
import {mountTranscribe} from './transcribe/ui.js';
// Pages: [{id, root, nav, links, mount}]. Each page mounts once and keeps its state while hidden; switching only
// changes visibility. `nav` is the sidebar button (marked aria-current); `links` are other buttons that open the page.
export function mountPages({pages,initial=pages[0]?.id}) {
 const active=pages.filter(page=>page.root),cleanups=active.map(page=>page.mount?.(page.root)).filter(Boolean),handlers=[];let closed=false;
 const select=name=>{if(closed||!active.some(page=>page.id===name))return;for(const page of active){page.root.hidden=page.id!==name;page.nav?.setAttribute('aria-current',page.id===name?'page':'false');}globalThis.scrollTo?.(0,0);};
 for(const page of active)for(const button of [page.nav,...(page.links||[])].filter(Boolean)){const handler=()=>select(page.id);button.addEventListener('click',handler);handlers.push([button,handler]);}
 select(initial);
 const cleanup=()=>{if(closed)return;closed=true;for(const [button,handler] of handlers)button.removeEventListener('click',handler);cleanups.forEach(fn=>fn());};
 return Object.assign(cleanup,{select});
}
// The app's pages. Settings holds the model controls that the Organization and Transcription pages use.
export function mountWorkspaces(doc=document,{organizerMount=mountOrganizer,transferMount=mountTransfer,transcribeMount=mountTranscribe}={}) {
 const $=id=>doc.getElementById(id),settingsRoot=$('settings-root'),links=name=>[...doc.querySelectorAll(`[data-go="${name}"]`)];
 return mountPages({initial:'home',pages:[
  {id:'home',root:$('home-root'),nav:$('tab-home'),links:links('home')},
  {id:'organize',root:$('organizer-root'),nav:$('tab-organize'),links:links('organize'),mount:root=>organizerMount(root,{settingsRoot})},
  {id:'transcribe',root:$('transcribe-root'),nav:$('tab-transcribe'),links:links('transcribe'),mount:root=>transcribeMount(root,{settingsRoot})},
  {id:'transfer',root:$('transfer-root'),nav:$('tab-transfer'),links:links('transfer'),mount:root=>transferMount(root)},
  {id:'settings',root:settingsRoot,nav:$('tab-settings'),links:links('settings')}
 ]});
}
