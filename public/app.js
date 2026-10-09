const installButton = document.getElementById('install-button');
const appStatus = document.getElementById('app-status');
const updateBanner = document.getElementById('update-banner');
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

// A new release waits until every tab closes. Offer a one-click switch instead.
function watchForUpdates(registration) {
  if (!registration) return;
  let requested = false;
  const offer = () => { if (registration.waiting && navigator.serviceWorker.controller) updateBanner.hidden = false; };
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(); });
  });
  document.getElementById('reload-app').addEventListener('click', () => {
    requested = true;
    registration.waiting?.postMessage({type: 'SKIP_WAITING'});
  });
  // Only reload for a switch the user asked for; the first install also changes the controller.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!requested) return;
    requested = false;
    location.reload();
  });
  offer();
}

async function prepareOfflineAccess() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    appStatus.textContent = 'Offline mode unavailable';
    appStatus.dataset.state = 'unavailable';
    return;
  }
  try {
    watchForUpdates(await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }));
    const registration = await navigator.serviceWorker.ready;
    const version = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {channel.port1.close();channel.port2.close();reject(new Error('Offline worker version unavailable.'));}, 3000);
      channel.port1.onmessage = event => {clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(event.data.version);};
      registration.active.postMessage({type: 'APP_VERSION'}, [channel.port2]);
    });
    const expectedVersion = document.querySelector('meta[name="app-shell-version"]').content;
    if (version !== expectedVersion) {
      appStatus.textContent = 'Update prepared. Close all app windows and reopen.';
      appStatus.dataset.state = 'pending';
      return;
    }
    appStatus.textContent = 'Available offline';
    appStatus.dataset.state = 'ready';
  } catch (error) {
    appStatus.textContent = 'Offline mode unavailable';
    appStatus.dataset.state = 'unavailable';
    console.warn('Offline setup unavailable.', error);
  }
}

prepareOfflineAccess();
