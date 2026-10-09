import test from 'node:test';import assert from 'node:assert/strict';
const button=()=>{const handlers=new Map();return {attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){handlers.set(k,v);},removeEventListener(k,v){if(handlers.get(k)===v)handlers.delete(k);},click(){handlers.get('click')?.();}};};
test('workspace navigation mounts once, preserves both sessions and cleans up only on teardown',async()=>{
  const {mountWorkspaces}=await import('../public/workspaces.js');const organizerRoot={hidden:true,selection:['kept']},transferRoot={hidden:false,active:true},organizeButton=button(),transferButton=button();let mounts=0,cleanups=0;
  const mount=()=>{mounts++;return()=>cleanups++;};
  const cleanup=mountWorkspaces({organizerRoot,transferRoot,organizeButton,transferButton,organizerMount:mount,transferMount:mount});
  assert.equal(organizerRoot.hidden,false);assert.equal(transferRoot.hidden,true);assert.equal(mounts,2);
  transferButton.click();assert.equal(transferRoot.hidden,false);organizeButton.click();transferButton.click();assert.equal(mounts,2);assert.equal(cleanups,0);assert.deepEqual(organizerRoot.selection,['kept']);assert.equal(transferRoot.active,true);
  cleanup();cleanup();assert.equal(cleanups,2);organizeButton.click();assert.equal(organizerRoot.hidden,true);
});
test('a third Transcribe workspace mounts once and switches like the others',async()=>{
 const {mountWorkspaces}=await import('../public/workspaces.js');const organizerRoot={hidden:true},transferRoot={hidden:true},transcribeRoot={hidden:true},organizeButton=button(),transferButton=button(),transcribeButton=button();let mounts=0,cleanups=0;
 const mount=()=>{mounts++;return()=>cleanups++;};
 const cleanup=mountWorkspaces({organizerRoot,transferRoot,transcribeRoot,organizeButton,transferButton,transcribeButton,organizerMount:mount,transferMount:mount,transcribeMount:mount});
 assert.equal(mounts,3);assert.equal(transcribeRoot.hidden,true);
 transcribeButton.click();assert.equal(transcribeRoot.hidden,false);assert.equal(organizerRoot.hidden,true);assert.equal(transferRoot.hidden,true);assert.equal(transcribeButton.attrs['aria-selected'],'true');
 organizeButton.click();assert.equal(transcribeRoot.hidden,true);cleanup();assert.equal(cleanups,3);
});
