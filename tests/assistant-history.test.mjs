import test from 'node:test';import assert from 'node:assert/strict';
import {HISTORY_KEY,MAX_ENTRIES,clearHistory,loadHistory,saveHistory} from '../public/assistant/history.js';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
test('history round-trips, keeps the newest entries and can be cleared',()=>{
 const storage=memory();saveHistory(storage,Array.from({length:MAX_ENTRIES+5},(_,i)=>({role:i%2?'assistant':'user',text:`m${i}`})));
 const loaded=loadHistory(storage);assert.equal(loaded.length,MAX_ENTRIES);assert.equal(loaded.at(-1).text,`m${MAX_ENTRIES+4}`);
 assert.deepEqual(clearHistory(storage),[]);assert.deepEqual(loadHistory(storage),[]);
});
test('damaged or blocked storage gives an empty history instead of an error',()=>{
 const storage=memory();storage.setItem(HISTORY_KEY,'{bad');assert.deepEqual(loadHistory(storage),[]);
 storage.setItem(HISTORY_KEY,JSON.stringify([{role:'system',text:'x'},{role:'user',text:5},{role:'user',text:'ok'}]));assert.deepEqual(loadHistory(storage),[{role:'user',text:'ok'}]);
 const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
 assert.deepEqual(loadHistory(blocked),[]);assert.equal(saveHistory(blocked,[{role:'user',text:'hi'}]).length,1);assert.deepEqual(clearHistory(blocked),[]);
});
