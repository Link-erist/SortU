import {browserSupport,checkAiCapabilities} from '../ai/capabilities.js';
import {compatibilityVerdict} from './compat.js';
import {applyTheme,readTheme,saveTheme} from './theme.js';
// App chrome that is not a workspace: the device compatibility verdict, theme, mobile menu and storage use.
export function mountShell(doc=document,{win=window,nav=navigator}={}) {
 const removers=[],listen=(element,event,fn)=>{if(!element)return;element.addEventListener(event,fn);removers.push(()=>element.removeEventListener(event,fn));};
 // Theme: dark unless this browser saved light.
 const themeSelect=doc.getElementById('theme-select');
 if(themeSelect){themeSelect.value=readTheme(win);listen(themeSelect,'change',()=>{saveTheme(win,themeSelect.value);applyTheme(doc,themeSelect.value);});}
 // Mobile: the sidebar opens as a menu and closes after choosing a page.
 const shell=doc.getElementById('app-shell'),toggle=doc.getElementById('menu-toggle');
 const setMenu=open=>{shell.dataset.menu=open?'open':'closed';toggle?.setAttribute('aria-expanded',String(open));};
 listen(toggle,'click',()=>setMenu(shell.dataset.menu!=='open'));
 for(const button of doc.querySelectorAll('.sidebar-nav button'))listen(button,'click',()=>setMenu(false));
 setMenu(false);
 void showCompatibility(doc,win,nav);void showStorage(doc,nav);
 return ()=>removers.splice(0).forEach(remove=>remove());
}
async function showCompatibility(doc,win,nav) {
 let verdict;
 try {
  const transcribeManifest=await fetch('/transcribe/model.json').then(response=>response.json()).catch(()=>({}));
  const [organizer,transcribe]=await Promise.all([checkAiCapabilities(nav,{secureContext:win.isSecureContext}),checkAiCapabilities(nav,{secureContext:win.isSecureContext,model:transcribeManifest})]);
  verdict=compatibilityVerdict({support:browserSupport(nav),organizer,transcribe});
 } catch(error) {verdict={level:'unsupported',title:'Check failed',summary:`The device check could not finish: ${error.message}`,reasons:[],transcribe:{supported:false,text:''}};}
 const dot=doc.getElementById('compat-dot'),label=doc.getElementById('compat-label');
 if(dot)dot.dataset.level=verdict.level;if(label)label.textContent=verdict.title;
 for(const card of doc.querySelectorAll('[data-compat]')) {
  card.dataset.level=verdict.level;card.querySelector('[data-compat-title]').textContent=verdict.title;card.querySelector('[data-compat-summary]').textContent=verdict.summary;
  const list=card.querySelector('[data-compat-reasons]');list.replaceChildren(...[...verdict.reasons,verdict.transcribe.text].filter(Boolean).map(text=>{const item=doc.createElement('li');item.textContent=text;return item;}));
 }
}
async function showStorage(doc,nav) {
 const element=doc.getElementById('storage-usage');if(!element)return;
 try{const {usage=0,quota=0}=await nav.storage.estimate();element.textContent=`This app uses ${(usage/1e6).toFixed(0)} MB of storage on this device${quota?` (about ${(quota/1e9).toFixed(0)} GB available to it)`:''}.`;}
 catch{element.textContent='Storage use is not available in this browser.';}
}
