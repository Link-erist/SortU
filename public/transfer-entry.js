import {mountWorkspaces} from './workspaces.js';
const cleanup=mountWorkspaces({organizerRoot:document.getElementById('organizer-root'),transferRoot:document.getElementById('transfer-root'),organizeButton:document.getElementById('tab-organize'),transferButton:document.getElementById('tab-transfer'),transcribeRoot:document.getElementById('transcribe-root'),transcribeButton:document.getElementById('tab-transcribe')});
window.addEventListener('pagehide',cleanup,{once:true});
