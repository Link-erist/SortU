// Dark is the default; only an explicit "light" choice is stored. Storage can throw when site data is blocked.
export function readTheme(win=window) {try{return win.localStorage.getItem('theme')==='light'?'light':'dark';}catch{return 'dark';}}
export function saveTheme(win,theme) {try{if(theme==='light')win.localStorage.setItem('theme','light');else win.localStorage.removeItem('theme');}catch{}}
export function applyTheme(doc,theme) {doc.documentElement.dataset.theme=theme==='light'?'light':'dark';}
