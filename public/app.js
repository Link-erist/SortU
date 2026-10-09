const installButton = document.getElementById('install-button');
const appStatus = document.getElementById('app-status');
let installPrompt = null;
let installed = window.matchMedia('(display-mode: standalone)').matches;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (installed) return;
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch (error) {
    console.warn('Installation prompt unavailable.', error);
  } finally {
    installButton.disabled = false;
    installButton.hidden = !installPrompt || installed;
  }
});

window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  installButton.hidden = true;
});

async function prepareOfflineAccess() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    appStatus.textContent = 'Offline mode unavailable';
    appStatus.dataset.state = 'unavailable';
    return;
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    appStatus.textContent = 'Available offline';
    appStatus.dataset.state = 'ready';
  } catch (error) {
    appStatus.textContent = 'Offline mode unavailable';
    appStatus.dataset.state = 'unavailable';
    console.warn('Offline setup unavailable.', error);
  }
}

prepareOfflineAccess();
