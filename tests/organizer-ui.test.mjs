import test from 'node:test';import assert from 'node:assert/strict';
const button=()=>{const handlers=new Map();return {attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){handlers.set(k,v);},removeEventListener(k,v){if(handlers.get(k)===v)handlers.delete(k);},click(){handlers.get('click')?.();}};};
test('pages mount once, keep their state while hidden and clean up only on teardown',async()=>{
 const {mountPages}=await import('../public/workspaces.js');const organizerRoot={hidden:true,selection:['kept']},transferRoot={hidden:false,active:true},organizeButton=button(),transferButton=button();let mounts=0,cleanups=0;
 const mount=()=>{mounts++;return()=>cleanups++;};
 const cleanup=mountPages({pages:[{id:'organize',root:organizerRoot,nav:organizeButton,mount},{id:'transfer',root:transferRoot,nav:transferButton,mount}]});
 assert.equal(organizerRoot.hidden,false);assert.equal(transferRoot.hidden,true);assert.equal(mounts,2);assert.equal(organizeButton.attrs['aria-current'],'page');
 transferButton.click();assert.equal(transferRoot.hidden,false);organizeButton.click();transferButton.click();assert.equal(mounts,2);assert.equal(cleanups,0);assert.deepEqual(organizerRoot.selection,['kept']);assert.equal(transferRoot.active,true);
 cleanup();cleanup();assert.equal(cleanups,2);organizeButton.click();assert.equal(organizerRoot.hidden,true);
});
test('link buttons open a page, the initial page is shown first and missing pages are skipped',async()=>{
 const {mountPages}=await import('../public/workspaces.js');const home={hidden:true},settings={hidden:true},homeNav=button(),settingsNav=button(),openSettings=button();
 const cleanup=mountPages({initial:'home',pages:[{id:'home',root:home,nav:homeNav},{id:'missing',root:null,nav:button()},{id:'settings',root:settings,nav:settingsNav,links:[openSettings]}]});
 assert.equal(home.hidden,false);openSettings.click();assert.equal(settings.hidden,false);assert.equal(home.hidden,true);assert.equal(settingsNav.attrs['aria-current'],'page');assert.equal(homeNav.attrs['aria-current'],'false');
 cleanup.select('home');assert.equal(home.hidden,false);cleanup();
});
