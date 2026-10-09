// Desktop-only startup script, injected by the portable app (desktop/src-tauri/src/main.rs). Not part of the PWA.
// On first launch it copies each bundled model folder into this app's own model cache, then runs the PWA's normal
// preparation, which re-verifies every file's size and hash. It reuses the PWA modules and changes none of them.
(() => {
  const MODEL_ORIGIN = 'http://model.localhost/';
  // Bundled folders next to the executable, and the PWA modules that prepare each model.
  const BUNDLES = [
    {folder: 'model', name: 'Local AI', manifest: '/ai/model.json', runtime: '/ai/runtime.js', factory: 'createLocalRuntime'},
    {folder: 'transcribe-model', name: 'transcription', manifest: '/transcribe/model.json', runtime: '/transcribe/runtime.js', factory: 'createTranscribeRuntime'}
  ];
  if (window.top !== window || location.origin !== 'http://tauri.localhost') return;
  const status = (message, error = false) => {
    const element = document.getElementById('ai-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = error ? 'error' : 'ready';
  };
  // Returns true when it installed something, so the page reloads once to pick up the ready state.
  async function installBundle(bundle, modules) {
    const base = `${MODEL_ORIGIN}${bundle.folder}/`;
    const marker = await fetch(base + 'ai-organizer-model.json').catch(() => null);
    if (!marker?.ok) return false; // Not bundled: the normal Prepare/Load buttons still work.
    const manifest = await (await fetch(bundle.manifest)).json();
    await modules.checkFolderMarker(new Map([[modules.MARKER, new File([await marker.text()], modules.MARKER)]]), manifest);
    const missing = [];
    for (const entry of modules.modelFolderEntries(manifest)) if (!await (await caches.open(entry.scope)).match(entry.url)) missing.push(entry);
    if (!missing.length) return false;
    const runtimeModule = await import(bundle.runtime);
    const release = await modules.acquireExportLock('organizer-ai');
    let runtime;
    try {
      for (const [index, entry] of missing.entries()) {
        status(`Installing the bundled ${bundle.name} model (${index + 1}/${missing.length}). This happens once.`);
        const response = await fetch(base + entry.path);
        if (!response.ok) throw new Error(`The bundled ${bundle.folder} folder is missing ${entry.path}.`);
        await (await caches.open(entry.scope)).put(entry.url, response);
      }
      status(`Checking the bundled ${bundle.name} model`);
      runtime = runtimeModule[bundle.factory]({onProgress: progress => status(progress.stage)});
      await runtime.prepare();
      return true;
    } finally {
      try { await runtime?.unload(); } catch {}
      runtime?.dispose();
      release();
    }
  }
  async function installBundledModels() {
    const [folder, resources] = await Promise.all([import('/ai/model-folder.js'), import('/transfer/resources.js')]);
    const modules = {...folder, acquireExportLock: resources.acquireExportLock};
    let installed = false;
    for (const bundle of BUNDLES) installed = await installBundle(bundle, modules) || installed;
    // Reload so the page re-checks readiness and opens with Local AI and transcription on.
    if (installed) location.reload();
  }
  const start = () => installBundledModels().catch(error => status(`Bundled model could not be installed: ${error.message}`, true));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
