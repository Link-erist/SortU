import test from 'node:test';import assert from 'node:assert/strict';
const memory=()=>{const items=new Map();return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,String(value)),removeItem:key=>items.delete(key),items};};
test('defaults are the preset list with Other last',async()=>{
 const {loadCategories,DEFAULT_CATEGORIES}=await import('../public/organizer/categories.js');const list=loadCategories(memory());
 assert.deepEqual(list,[...DEFAULT_CATEGORIES]);assert.equal(list.at(-1),'Other');assert.ok(list.includes('Invoices'));
});
test('saved lists are cleaned: trimmed, de-duplicated ignoring case, Other kept last',async()=>{
 const {saveCategories,loadCategories}=await import('../public/organizer/categories.js');const storage=memory();
 assert.deepEqual(saveCategories(storage,'  Projects \nCourses\nprojects\n\nOther\nClients'),['Projects','Courses','Clients','Other']);
 assert.deepEqual(loadCategories(storage),['Projects','Courses','Clients','Other']);
});
test('unsafe or excessive categories are refused with a clear message',async()=>{
 const {saveCategories}=await import('../public/organizer/categories.js');const storage=memory();
 for(const [text,message] of [['a/b',/slash|character/i],['..',/name/i],['x'.repeat(41),/40/],[Array.from({length:31},(_,i)=>'C'+i).join('\n'),/30/],['\n \n',/at least one/i],['Bad‮name',/character/i]])
  assert.throws(()=>saveCategories(storage,text),message,text.slice(0,20));
 assert.equal(storage.items.size,0);
});
test('reset restores defaults; damaged or unavailable storage falls back to defaults',async()=>{
 const {saveCategories,loadCategories,resetCategories,DEFAULT_CATEGORIES}=await import('../public/organizer/categories.js');const storage=memory();
 saveCategories(storage,'Projects');assert.deepEqual(resetCategories(storage),[...DEFAULT_CATEGORIES]);assert.deepEqual(loadCategories(storage),[...DEFAULT_CATEGORIES]);
 storage.setItem('organizer-categories','{not json');assert.deepEqual(loadCategories(storage),[...DEFAULT_CATEGORIES]);
 const broken={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
 assert.deepEqual(loadCategories(broken),[...DEFAULT_CATEGORIES]);assert.deepEqual(loadCategories(undefined),[...DEFAULT_CATEGORIES]);
});
