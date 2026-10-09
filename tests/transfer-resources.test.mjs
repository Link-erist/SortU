import test from 'node:test';import assert from 'node:assert/strict';
test('download memory budget blocks aggregate overflow and releases credits',async()=>{
 const {createDownloadBudget}=await import('../public/transfer/resources.js');const budget=createDownloadBudget(4);const first=await budget.reserve(3);let settled=false;
 const secondPromise=budget.reserve(2).then(lease=>{settled=true;return lease;});await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.equal(budget.used,3);
 first.release();const second=await secondPromise;assert.equal(budget.used,2);second.release();assert.equal(budget.used,0);
 await assert.rejects(()=>budget.reserve(5),/limit/i);
});
test('canceled budget wait does not retain reservations',async()=>{
 const {createDownloadBudget}=await import('../public/transfer/resources.js');const budget=createDownloadBudget(4);const lease=await budget.reserve(4);const controller=new AbortController();
 const waiting=budget.reserve(1,controller.signal);controller.abort();await assert.rejects(()=>waiting,/cancel/i);assert.equal(budget.used,4);lease.release();assert.equal(budget.used,0);
});

test('releasing one owner preserves another workspace export and export lock is cancelable',async()=>{
 const {createDownloadBudget,acquireExportLock}=await import('../public/transfer/resources.js');const budget=createDownloadBudget(4);const organizer=await budget.reserve(2,undefined,'organizer');const transfer=await budget.reserve(2,undefined,'transfer');budget.releaseOwner('transfer');assert.equal(budget.used,2);organizer.release();transfer.release();assert.equal(budget.used,0);
 const release=await acquireExportLock('organizer');const controller=new AbortController();const waiting=acquireExportLock('transfer',controller.signal);controller.abort();await assert.rejects(()=>waiting,/cancel/i);release();const next=await acquireExportLock('transfer');next();
});
