// Chat history kept in this browser only. Storage can be missing or throw (blocked site data); history then lasts
// for this visit. Entries are validated on load so a damaged value cannot break the page.
export const HISTORY_KEY='organizer-assistant-history',MAX_ENTRIES=50,MAX_TEXT=1200;
export function loadHistory(storage) {
 try{const value=JSON.parse(storage?.getItem(HISTORY_KEY)||'[]');if(!Array.isArray(value))return [];
  return value.filter(entry=>entry&&['user','assistant'].includes(entry.role)&&typeof entry.text==='string').slice(-MAX_ENTRIES).map(entry=>({role:entry.role,text:entry.text.slice(0,MAX_TEXT)}));}
 catch{return [];}
}
export function saveHistory(storage,entries) {
 const kept=entries.slice(-MAX_ENTRIES).map(entry=>({role:entry.role,text:String(entry.text).slice(0,MAX_TEXT)}));
 try{storage?.setItem(HISTORY_KEY,JSON.stringify(kept));}catch{}return kept;
}
export function clearHistory(storage) {try{storage?.removeItem(HISTORY_KEY);}catch{}return [];}
