import {mountWorkspaces} from './workspaces.js';
import {mountShell} from './shell/shell.js';
const cleanupShell=mountShell(document),cleanup=mountWorkspaces(document);
window.addEventListener('pagehide',()=>{cleanup();cleanupShell();},{once:true});
