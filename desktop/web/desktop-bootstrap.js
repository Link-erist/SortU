// Desktop-only startup script, injected by the portable app (desktop/src-tauri/src/main.rs). Not part of the PWA.
// On first launch it copies the bundled model/ folder into this app's own model cache, then runs the PWA's normal
// preparation, which re-verifies every file's size and hash. It reuses the PWA modules and changes none of them.
(() => {
  const MODEL_ORIGIN = 'http://model.localhost/';
  if (window.top !== window || location.origin !== 'http://tauri.localhost') return;
  const status = (message, error = false) => {
    const element = document.getElementById('ai-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = error ? 'error' : 'ready';
  };
  async function installBundledModel() {
    const marker = await fetch(MODEL_ORIGIN + 'ai-organizer-model.json').catch(() => null);
    if (!marker?.ok) return; // No bundled model next to the app: the normal Prepare/Load buttons still work.
    const {MARKER, checkFolderMarker, modelFolderEntries} = await import('/ai/model-folder.js');
    const manifest = await (await fetch('/ai/model.json')).json();
    await checkFolderMarker(new Map([[MARKER, new File([await marker.text()], MARKER)]]), manifest);
    const entries = modelFolderEntries(manifest), missing = [];
    for (const entry of entries) if (!await (await caches.open(entry.scope)).match(entry.url)) missing.push(entry);
    if (!missing.length) return;
    const {acquireExportLock} = await import('/transfer/resources.js');
    const {createLocalRuntime} = await import('/ai/runtime.js');
    const release = await acquireExportLock('organizer-ai');
    let runtime;
    try {
      for (const [index, entry] of missing.entries()) {
        status(`Installing the bundled AI model (${index + 1}/${missing.length}). This happens once.`);
        const response = await fetch(MODEL_ORIGIN + entry.path);
        if (!response.ok) throw new Error(`The bundled model folder is missing ${entry.path}.`);
        await (await caches.open(entry.scope)).put(entry.url, response);
      }
      status('Checking the bundled AI model');
      runtime = createLocalRuntime({onProgress: progress => status(progress.stage)});
      await runtime.prepare();
      // Reload so the page re-checks readiness and opens the organizer with Local AI on.
      location.reload();
    } finally {
      try { await runtime?.unload(); } catch {}
      runtime?.dispose();
      release();
    }
  }
  const start = () => installBundledModel().catch(error => status(`Bundled AI model could not be installed: ${error.message}`, true));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
