// The user's preferred folder categories for AI organization, kept in this browser only.
import {CATEGORIES} from '../ai/schema.js';
export const DEFAULT_CATEGORIES=Object.freeze([...CATEGORIES]);
const KEY='organizer-categories',MAX_COUNT=30,MAX_LENGTH=40;
function clean(names) {
 const list=[],seen=new Set();
 for(const raw of names) {
  const name=String(raw).replace(/\s+/g,' ').trim();if(!name)continue;
  if(name.length>MAX_LENGTH)throw new Error(`Category names can be at most ${MAX_LENGTH} characters.`);
  if(/[\\/:*?"<>|]|[\u0000-\u001f\u007f]|\p{Cf}/u.test(name))throw new Error(`"${name.slice(0,20)}" contains a character that cannot be used in folder names (such as a slash).`);
  if(/^\.+$/.test(name))throw new Error('Choose a real category name, not dots.');
  const key=name.toLowerCase();if(seen.has(key)||key==='other')continue;seen.add(key);list.push(name);
 }
 if(!list.length)throw new Error('Keep at least one category.');
 if(list.length+1>MAX_COUNT)throw new Error(`Use at most ${MAX_COUNT} categories, including Other.`);
 return [...list,'Other'];
}
export function loadCategories(storage) {
 try {const saved=JSON.parse(storage?.getItem(KEY)??'null');if(Array.isArray(saved))return clean(saved);}catch{}
 return [...DEFAULT_CATEGORIES];
}
// Accepts the textarea contents (one category per line); throws before storing anything if invalid.
export function saveCategories(storage,text) {
 const list=clean(String(text).split('\n'));
 try{storage?.setItem(KEY,JSON.stringify(list));}catch{throw new Error('This browser blocked saving settings. The list applies until you reload.');}
 return list;
}
export function resetCategories(storage) {
 try{storage?.removeItem(KEY);}catch{}
 return [...DEFAULT_CATEGORIES];
}
