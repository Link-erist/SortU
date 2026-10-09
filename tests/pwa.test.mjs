import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://app.example';
const source = (file) => existsSync(file) ? readFileSync(file, 'utf8') : '';

function worker(network = async () => new Response('online')) {
  const handlers = new Map();
  const stores = new Map();
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const cacheApi = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(paths) {
          for (const path of paths) store.set(key(path), new Response(`cached ${path}`));
        },
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response.clone()); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  vm.runInNewContext(source('public/sw.js'), {
    self: { location: { origin }, addEventListener: (type, fn) => handlers.set(type, fn), clients: { claim: async () => {} } },
    caches: cacheApi, fetch: network, URL, Response, Promise
  });
  return {
    stores,
    async lifecycle(type) {
      assert.ok(handlers.has(type), `worker must handle ${type}`);
      let pending;
      handlers.get(type)({ waitUntil: (p) => { pending = p; } });
      await pending;
    },
    async request(path, mode = 'navigate', method = 'GET') {
      assert.ok(handlers.has('fetch'), 'worker must handle fetch');
      let response;
      const pending = [];
      handlers.get('fetch')({
        request: { url: new URL(path, origin).href, mode, method },
        respondWith: (p) => { response = p; }, waitUntil: (p) => pending.push(p)
      });
      const result = await response;
      await Promise.all(pending);
      return result;
    }
  };
}

// Catches missing fallback, stale navigations, and deletion of someone else's cache.
test('offline navigation returns the installed page', async () => {
  const sw = worker(async () => { throw new Error('offline'); });
  await sw.lifecycle('install');
  assert.equal(await (await sw.request('/?from=homescreen')).text(), 'cached /');
});

test('online navigation returns fresh content, then caches it for offline reload', async () => {
  let offline = false;
  const page = '<meta name="app-shell-version" content="v5">fresh page';
  const sw = worker(async () => {
    if (offline) throw new Error('offline');
    return new Response(page);
  });
  await sw.lifecycle('install');
  assert.equal(await (await sw.request('/')).text(), page);
  offline = true;
  assert.equal(await (await sw.request('/')).text(), page);
});

// Catches mixing newly deployed markup with an older active worker's cached assets.
test('an active worker keeps the old shell coherent while a new release waits', async () => {
  let offline = false;
  const sw = worker(async () => {
    if (offline) throw new Error('offline');
    return new Response('<meta name="app-shell-version" content="v6">new markup needing v6 assets');
  });
  await sw.lifecycle('install');
  assert.equal(await (await sw.request('/')).text(), 'cached /');
  assert.equal(await (await sw.request('/styles.css', 'cors')).text(), 'cached /styles.css');
  offline = true;
  assert.equal(await (await sw.request('/')).text(), 'cached /');
});

test('cached app assets remain available offline', async () => {
  const sw = worker(async () => { throw new Error('offline'); });
  await sw.lifecycle('install');
  for (const path of ['/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/mark.svg', '/transfer-entry.js', '/transfer/pairing.js', '/transfer/qr.js', '/transfer/ui.js', '/transfer/resources.js', '/transfer/protocol.js', '/transfer/engine.js', '/transfer/storage.js', '/transfer/hash.js', '/transfer/hash-worker.js', '/vendor/qrcodegen.js', '/vendor/jsqr.js', '/vendor/sha256.js']) {
    assert.equal(await (await sw.request(path, 'cors')).text(), `cached ${path}`);
  }
});

test('activation deletes old app caches and preserves unrelated caches', async () => {
  const sw = worker();
  sw.stores.set('appbuildershackathon-v0', new Map());
  sw.stores.set('another-app-v1', new Map());
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.stores.has('appbuildershackathon-v0'), false);
  assert.equal(sw.stores.has('another-app-v1'), true);
  assert.equal(sw.stores.size, 2);
});

test('worker leaves cross-origin requests and writes to the browser', async () => {
  const sw = worker();
  assert.equal(await sw.request('https://other.example/file', 'cors'), undefined);
  assert.equal(await sw.request('/', 'cors', 'POST'), undefined);
});

function app({ standalone = false, registrationFails = false, workerVersion = 'v5' } = {}) {
  const handlers = new Map();
  const button = { hidden: true, disabled: false, addEventListener: (type, fn) => handlers.set(`button:${type}`, fn) };
  const status = { textContent: 'Getting ready', dataset: {} };
  const elements = { 'install-button': button, 'app-status': status };
  const context = {
    window: {
      isSecureContext: true,
      matchMedia: () => ({ matches: standalone }),
      addEventListener: (type, fn) => handlers.set(type, fn)
    },
    navigator: {
      serviceWorker: {
        register: async () => { if (registrationFails) throw new Error('unavailable'); },
        ready: Promise.resolve({ active: { postMessage(_message, ports) { ports[0].postMessage({version: workerVersion}); } } })
      }
    },
    document: { getElementById: (id) => elements[id], querySelector: () => ({content:'v5'}) },
    MessageChannel: class {
      constructor() {
        this.port1 = {onmessage: null, close() {}};
        this.port2 = {postMessage: data => queueMicrotask(() => this.port1.onmessage?.({data})), close() {}};
      }
    }, setTimeout, clearTimeout,
    console: { warn() {} }
  };
  vm.runInNewContext(source('public/app.js'), context);
  return {
    button, status,
    async fire(type, event = {}) {
      assert.ok(handlers.has(type), `app must handle ${type}`);
      await handlers.get(type)(event);
    },
    async flush() { await new Promise((resolve) => setImmediate(resolve)); }
  };
}

const promptEvent = (outcome) => ({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome }) });

// Catches unusable install controls and a false offline-ready message on failure.
test('without an install prompt the control stays hidden', async () => {
  const ui = app();
  await ui.flush();
  assert.equal(ui.button.hidden, true);
  assert.equal(ui.status.textContent, 'Available offline');
});

test('a browser prompt enables installation, dismissal waits for a new prompt', async () => {
  const ui = app();
  await ui.fire('beforeinstallprompt', promptEvent('dismissed'));
  assert.equal(ui.button.hidden, false);
  await ui.fire('button:click');
  assert.equal(ui.button.hidden, true);
  await ui.fire('beforeinstallprompt', promptEvent('accepted'));
  assert.equal(ui.button.hidden, false);
  await ui.fire('appinstalled');
  assert.equal(ui.button.hidden, true);
});

test('standalone app never offers another install prompt', async () => {
  const ui = app({ standalone: true });
  await ui.fire('beforeinstallprompt', promptEvent('accepted'));
  assert.equal(ui.button.hidden, true);
});

test('failed worker registration does not claim offline availability', async () => {
  const ui = app({ registrationFails: true });
  await ui.flush();
  assert.equal(ui.status.textContent, 'Offline mode unavailable');
});

test('an older active worker does not claim the new transfer assets are ready offline',async()=>{
  const ui=app({workerVersion:'v1'});await ui.flush();
  assert.equal(ui.status.dataset.state,'pending');assert.match(ui.status.textContent,/Close all app windows/);
});
