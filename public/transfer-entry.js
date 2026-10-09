import {mountTransfer} from './transfer/ui.js';
const root=document.getElementById('transfer-root');
if(root){const cleanup=mountTransfer(root);window.addEventListener('pagehide',cleanup,{once:true});}
