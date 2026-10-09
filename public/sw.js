// Increment APP_VERSION and the matching index.html meta tag together for each release.
const APP_VERSION = 'v8';
const CACHE_PREFIX = 'appbuildershackathon-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const APP_ASSETS = [
  '/ai/capabilities.js',
  '/ai/extract.js',
  '/ai/model-folder.js',
  '/ai/office.js',
  '/organizer/categories.js',
  '/vendor/inflate.js',
  '/ai/model.json',
  '/ai/organize.js',
  '/ai/pdf.js',
  '/ai/prompts.js',
  '/ai/runtime-worker.js',
  '/ai/runtime.js',
  '/ai/schema.js',
  '/ai/transport.js',
  '/ai/ui.js',
  '/vendor/webllm.js',
  '/vendor/tokenizers.js',
  '/vendor/ai-hashes.js',
  '/vendor/AI-LICENSES.txt',
  '/vendor/pdf/pdf.js',
  '/vendor/pdf/pdf.worker.js',
  '/vendor/pdf/cmaps/78-EUC-H.bcmap',
  '/vendor/pdf/cmaps/78-EUC-V.bcmap',
  '/vendor/pdf/cmaps/78-H.bcmap',
  '/vendor/pdf/cmaps/78-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/78-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/78-V.bcmap',
  '/vendor/pdf/cmaps/78ms-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/78ms-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/83pv-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/90ms-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/90ms-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/90msp-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/90msp-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/90pv-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/90pv-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/Add-H.bcmap',
  '/vendor/pdf/cmaps/Add-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/Add-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/Add-V.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-0.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-1.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-2.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-3.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-4.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-5.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-6.bcmap',
  '/vendor/pdf/cmaps/Adobe-CNS1-UCS2.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-0.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-1.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-2.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-3.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-4.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-5.bcmap',
  '/vendor/pdf/cmaps/Adobe-GB1-UCS2.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-0.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-1.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-2.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-3.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-4.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-5.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-6.bcmap',
  '/vendor/pdf/cmaps/Adobe-Japan1-UCS2.bcmap',
  '/vendor/pdf/cmaps/Adobe-Korea1-0.bcmap',
  '/vendor/pdf/cmaps/Adobe-Korea1-1.bcmap',
  '/vendor/pdf/cmaps/Adobe-Korea1-2.bcmap',
  '/vendor/pdf/cmaps/Adobe-Korea1-UCS2.bcmap',
  '/vendor/pdf/cmaps/B5-H.bcmap',
  '/vendor/pdf/cmaps/B5-V.bcmap',
  '/vendor/pdf/cmaps/B5pc-H.bcmap',
  '/vendor/pdf/cmaps/B5pc-V.bcmap',
  '/vendor/pdf/cmaps/CNS-EUC-H.bcmap',
  '/vendor/pdf/cmaps/CNS-EUC-V.bcmap',
  '/vendor/pdf/cmaps/CNS1-H.bcmap',
  '/vendor/pdf/cmaps/CNS1-V.bcmap',
  '/vendor/pdf/cmaps/CNS2-H.bcmap',
  '/vendor/pdf/cmaps/CNS2-V.bcmap',
  '/vendor/pdf/cmaps/ETen-B5-H.bcmap',
  '/vendor/pdf/cmaps/ETen-B5-V.bcmap',
  '/vendor/pdf/cmaps/ETenms-B5-H.bcmap',
  '/vendor/pdf/cmaps/ETenms-B5-V.bcmap',
  '/vendor/pdf/cmaps/ETHK-B5-H.bcmap',
  '/vendor/pdf/cmaps/ETHK-B5-V.bcmap',
  '/vendor/pdf/cmaps/EUC-H.bcmap',
  '/vendor/pdf/cmaps/EUC-V.bcmap',
  '/vendor/pdf/cmaps/Ext-H.bcmap',
  '/vendor/pdf/cmaps/Ext-RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/Ext-RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/Ext-V.bcmap',
  '/vendor/pdf/cmaps/GB-EUC-H.bcmap',
  '/vendor/pdf/cmaps/GB-EUC-V.bcmap',
  '/vendor/pdf/cmaps/GB-H.bcmap',
  '/vendor/pdf/cmaps/GB-V.bcmap',
  '/vendor/pdf/cmaps/GBK-EUC-H.bcmap',
  '/vendor/pdf/cmaps/GBK-EUC-V.bcmap',
  '/vendor/pdf/cmaps/GBK2K-H.bcmap',
  '/vendor/pdf/cmaps/GBK2K-V.bcmap',
  '/vendor/pdf/cmaps/GBKp-EUC-H.bcmap',
  '/vendor/pdf/cmaps/GBKp-EUC-V.bcmap',
  '/vendor/pdf/cmaps/GBpc-EUC-H.bcmap',
  '/vendor/pdf/cmaps/GBpc-EUC-V.bcmap',
  '/vendor/pdf/cmaps/GBT-EUC-H.bcmap',
  '/vendor/pdf/cmaps/GBT-EUC-V.bcmap',
  '/vendor/pdf/cmaps/GBT-H.bcmap',
  '/vendor/pdf/cmaps/GBT-V.bcmap',
  '/vendor/pdf/cmaps/GBTpc-EUC-H.bcmap',
  '/vendor/pdf/cmaps/GBTpc-EUC-V.bcmap',
  '/vendor/pdf/cmaps/H.bcmap',
  '/vendor/pdf/cmaps/Hankaku.bcmap',
  '/vendor/pdf/cmaps/Hiragana.bcmap',
  '/vendor/pdf/cmaps/HKdla-B5-H.bcmap',
  '/vendor/pdf/cmaps/HKdla-B5-V.bcmap',
  '/vendor/pdf/cmaps/HKdlb-B5-H.bcmap',
  '/vendor/pdf/cmaps/HKdlb-B5-V.bcmap',
  '/vendor/pdf/cmaps/HKgccs-B5-H.bcmap',
  '/vendor/pdf/cmaps/HKgccs-B5-V.bcmap',
  '/vendor/pdf/cmaps/HKm314-B5-H.bcmap',
  '/vendor/pdf/cmaps/HKm314-B5-V.bcmap',
  '/vendor/pdf/cmaps/HKm471-B5-H.bcmap',
  '/vendor/pdf/cmaps/HKm471-B5-V.bcmap',
  '/vendor/pdf/cmaps/HKscs-B5-H.bcmap',
  '/vendor/pdf/cmaps/HKscs-B5-V.bcmap',
  '/vendor/pdf/cmaps/Katakana.bcmap',
  '/vendor/pdf/cmaps/KSC-EUC-H.bcmap',
  '/vendor/pdf/cmaps/KSC-EUC-V.bcmap',
  '/vendor/pdf/cmaps/KSC-H.bcmap',
  '/vendor/pdf/cmaps/KSC-Johab-H.bcmap',
  '/vendor/pdf/cmaps/KSC-Johab-V.bcmap',
  '/vendor/pdf/cmaps/KSC-V.bcmap',
  '/vendor/pdf/cmaps/KSCms-UHC-H.bcmap',
  '/vendor/pdf/cmaps/KSCms-UHC-HW-H.bcmap',
  '/vendor/pdf/cmaps/KSCms-UHC-HW-V.bcmap',
  '/vendor/pdf/cmaps/KSCms-UHC-V.bcmap',
  '/vendor/pdf/cmaps/KSCpc-EUC-H.bcmap',
  '/vendor/pdf/cmaps/KSCpc-EUC-V.bcmap',
  '/vendor/pdf/cmaps/LICENSE',
  '/vendor/pdf/cmaps/NWP-H.bcmap',
  '/vendor/pdf/cmaps/NWP-V.bcmap',
  '/vendor/pdf/cmaps/RKSJ-H.bcmap',
  '/vendor/pdf/cmaps/RKSJ-V.bcmap',
  '/vendor/pdf/cmaps/Roman.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UCS2-H.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UCS2-V.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UTF16-H.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UTF16-V.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UTF8-H.bcmap',
  '/vendor/pdf/cmaps/UniCNS-UTF8-V.bcmap',
  '/vendor/pdf/cmaps/UniGB-UCS2-H.bcmap',
  '/vendor/pdf/cmaps/UniGB-UCS2-V.bcmap',
  '/vendor/pdf/cmaps/UniGB-UTF16-H.bcmap',
  '/vendor/pdf/cmaps/UniGB-UTF16-V.bcmap',
  '/vendor/pdf/cmaps/UniGB-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniGB-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniGB-UTF8-H.bcmap',
  '/vendor/pdf/cmaps/UniGB-UTF8-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UCS2-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UCS2-HW-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UCS2-HW-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UCS2-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UTF16-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UTF16-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UTF8-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS-UTF8-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS2004-UTF16-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS2004-UTF16-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS2004-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS2004-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniJIS2004-UTF8-H.bcmap',
  '/vendor/pdf/cmaps/UniJIS2004-UTF8-V.bcmap',
  '/vendor/pdf/cmaps/UniJISPro-UCS2-HW-V.bcmap',
  '/vendor/pdf/cmaps/UniJISPro-UCS2-V.bcmap',
  '/vendor/pdf/cmaps/UniJISPro-UTF8-V.bcmap',
  '/vendor/pdf/cmaps/UniJISX0213-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniJISX0213-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniJISX02132004-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniJISX02132004-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniKS-UCS2-H.bcmap',
  '/vendor/pdf/cmaps/UniKS-UCS2-V.bcmap',
  '/vendor/pdf/cmaps/UniKS-UTF16-H.bcmap',
  '/vendor/pdf/cmaps/UniKS-UTF16-V.bcmap',
  '/vendor/pdf/cmaps/UniKS-UTF32-H.bcmap',
  '/vendor/pdf/cmaps/UniKS-UTF32-V.bcmap',
  '/vendor/pdf/cmaps/UniKS-UTF8-H.bcmap',
  '/vendor/pdf/cmaps/UniKS-UTF8-V.bcmap',
  '/vendor/pdf/cmaps/V.bcmap',
  '/vendor/pdf/cmaps/WP-Symbol.bcmap',
  '/vendor/pdf/standard_fonts/FoxitDingbats.pfb',
  '/vendor/pdf/standard_fonts/FoxitFixed.pfb',
  '/vendor/pdf/standard_fonts/FoxitFixedBold.pfb',
  '/vendor/pdf/standard_fonts/FoxitFixedBoldItalic.pfb',
  '/vendor/pdf/standard_fonts/FoxitFixedItalic.pfb',
  '/vendor/pdf/standard_fonts/FoxitSerif.pfb',
  '/vendor/pdf/standard_fonts/FoxitSerifBold.pfb',
  '/vendor/pdf/standard_fonts/FoxitSerifBoldItalic.pfb',
  '/vendor/pdf/standard_fonts/FoxitSerifItalic.pfb',
  '/vendor/pdf/standard_fonts/FoxitSymbol.pfb',
  '/vendor/pdf/standard_fonts/LiberationSans-Bold.ttf',
  '/vendor/pdf/standard_fonts/LiberationSans-BoldItalic.ttf',
  '/vendor/pdf/standard_fonts/LiberationSans-Italic.ttf',
  '/vendor/pdf/standard_fonts/LiberationSans-Regular.ttf',
  '/vendor/pdf/standard_fonts/LICENSE_FOXIT',
  '/vendor/pdf/standard_fonts/LICENSE_LIBERATION',
  '/vendor/pdf/wasm/jbig2_nowasm_fallback.js',
  '/vendor/pdf/wasm/jbig2.wasm',
  '/vendor/pdf/wasm/LICENSE_JBIG2',
  '/vendor/pdf/wasm/LICENSE_OPENJPEG',
  '/vendor/pdf/wasm/LICENSE_PDFJS_JBIG2',
  '/vendor/pdf/wasm/LICENSE_PDFJS_OPENJPEG',
  '/vendor/pdf/wasm/LICENSE_PDFJS_QCMS',
  '/vendor/pdf/wasm/LICENSE_QCMS',
  '/vendor/pdf/wasm/openjpeg_nowasm_fallback.js',
  '/vendor/pdf/wasm/openjpeg.wasm',
  '/vendor/pdf/wasm/qcms_bg.wasm',
  '/vendor/pdf/wasm/quickjs-eval.js',
  '/vendor/pdf/wasm/quickjs-eval.wasm',
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/icons/mark.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/workspaces.js', '/transfer-entry.js', '/organizer/inventory.js', '/organizer/rules.js', '/organizer/paths.js', '/organizer/planner.js', '/organizer/proposal.js', '/organizer/export.js', '/organizer/archive.js', '/organizer/archive-core.js', '/organizer/archive-worker.js', '/organizer/ui.js', '/vendor/zip.js', '/vendor/ZIP-LICENSE.txt', '/transfer/pairing.js', '/transfer/qr.js', '/transfer/protocol.js',
  '/transfer/engine.js', '/transfer/storage.js', '/transfer/hash.js', '/transfer/hash-worker.js',
  '/transfer/ui.js', '/transfer/resources.js', '/vendor/qrcodegen.js', '/vendor/jsqr.js', '/vendor/sha256.js',
  '/vendor/LICENSES.txt', '/vendor/manifest.json'
];

self.addEventListener('message', event => {
  if (event.data?.type === 'APP_VERSION') event.ports?.[0]?.postMessage({version: APP_VERSION});
  // Sent only when the user clicks Reload on the update banner.
  else if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
          // A waiting worker owns the next shell. Keep this active shell's HTML
          // paired with its cached CSS/JS until all old app windows have closed.
          const html = await response.clone().text();
          if (!html.includes(`<meta name="app-shell-version" content="${APP_VERSION}">`)) {
            return await cache.match('/') || response;
          }
          event.waitUntil(cache.put('/', response.clone()).catch(() => {}));
        }
        return response;
      } catch {
        return await cache.match('/') || Response.error();
      }
    })());
    return;
  }

  if (APP_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.pathname) || fetch(event.request);
    })());
  }
});
