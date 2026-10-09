# AppBuildersHackathon

A one-page Progressive Web App with private, browser-only LAN file transfer. Plain HTML, CSS, and JavaScript with small, locally bundled QR and hashing libraries. Deployment needs no build step or runtime CDN.

**Live app:** https://appbuildershackathon.vercel.app/

**Vercel project:** https://vercel.com/link-erists-projects/appbuildershackathon

The GitHub repository is linked to Vercel, with `main` as the production branch. Pushes to `main` automatically deploy updates.

## Preview locally

Use Node.js 22 or newer. In PowerShell, from this repository:

```powershell
npm start
```

Open **http://127.0.0.1:4173**. Keep the terminal running. Stop it with Ctrl+C. No `npm install` is needed. This loopback address qualifies for local PWA testing.

```powershell
npm test
```

The tests exercise PWA behavior, pairing validation, QR decoding, protocol validation, consent, integrity, cancellation, and same-page resume. Native installation and physical LAN compatibility still need device checks.

## Deploy to Vercel with GitHub

1. Commit and push the project to [Link-erist/AppBuildersHackathon](https://github.com/Link-erist/AppBuildersHackathon). Use `main` as the production branch once the code is ready there.
2. Sign in to [Vercel](https://vercel.com/new) and import that GitHub repository. If it is missing, grant the Vercel GitHub integration access to this repository.
3. Choose **Other** for Framework Preset, repository root for Root Directory, no Build Command, and **public** for Output Directory. `vercel.json` already supplies these static-site settings; no environment variables are required.
4. Deploy, then visit the generated **HTTPS** URL. Confirm the production branch in the project's Git settings is **main**.
5. Once the GitHub integration is connected, pushes to the production branch deploy production updates; other branches and pull requests can produce previews. No GitHub Actions workflow or deployment token is needed.

This project's account import is complete. The steps above are retained for recreating the setup elsewhere. Local configuration alone does not establish the account connection. See [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github) and [project configuration](https://vercel.com/docs/project-configuration).

## Install on Windows or Android

- **Windows Chrome/Edge:** Open the deployed URL and use the address-bar installation icon or the browser's app installation menu. The page also offers **Install app** when the browser supplies an installation prompt.
- **Android Chrome:** Open the deployed URL and select **Install app** from Chrome's menu or tap the page's button when shown. Menu wording can vary by browser version.
- Already-installed apps and browsers without a prompt keep the page's install button hidden. The website remains usable.

Installation needs HTTPS or localhost. Double-clicking `index.html` opens a `file://` page, which is not a working PWA preview. Plain HTTP from a computer's LAN IP is also unsuitable for Android PWA testing; use the deployed HTTPS URL.

## Offline and updates

Visit once online on EACH device and wait for **Available offline**. The worker precaches the complete transfer interface, workers, bundled libraries, page, styles, manifest, and icons. A subsequent offline reload returns the cached app. First visits need a connection. A cache may be removed by the browser, storage pressure, or clearing site data, so offline access is not permanent storage.

The page checks the network first; local app assets use a versioned cache. When changing cached files, **increment `APP_VERSION` in `public/sw.js` and the `app-shell-version` meta tag in `public/index.html` together**, for example to `v2`. Keep that meta tag's attribute order as written. While the next worker waits, the active worker keeps its previous page when the network delivers a different shell version, preventing new markup from mixing with old assets. A new worker normally waits until all old app tabs/windows close. Close them and reopen to activate the new version. Old caches belonging to this app are then removed. No forced reload is used.

To check offline behavior manually: visit online, wait for the offline-ready status, reload once, enable Offline in browser developer tools' Network panel, and reload again. Confirm the page and styles load, then disable Offline. Do not disable the service worker or use bypass-for-network when checking its fallback.

## Current scope and browser limits

This feature branch adds file transfer. It does not yet implement AI, organization, renaming, or transcription; those remain subsequent subsystems. Installing a PWA does not grant unrestricted file access or native background operation. File picking and saving vary across browsers. Browser-local storage can be cleared; browser installation does not make it a backup. The existing production URL is not updated until this feature is published.

See [MDN installability guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [service worker guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Project files

- `public/`: everything deployed, including the web manifest and service worker.
- `scripts/serve.mjs`: localhost preview server. Development only.
- `scripts/create-icons.ps1`: recreates the PNG icons on Windows. The artwork fits the maskable safe zone.
- `tests/pwa.test.mjs`: browser-API behavior harness; no external packages.
- `vercel.json`: static output and service worker cache headers.
- `docs/superpowers/`: approved design and implementation plan.

## Verification status

Automated tests and browser results are recorded in `docs/verification.md`. Physical Windows-to-Android LAN transfer, camera-based pairing, native installation, and large-file streaming still need device checks.

## Transfer files without internet

1. Prepare the current app release on both devices while online. Then connect both devices to the same local Wi-Fi with peer communication enabled. Internet access is not needed during pairing or transfer.
2. Choose **Send files** on one device and **Receive files** on the other.
3. Receiver scans every sender QR frame. Sender then scans every receiver reply frame. Complete pairing JSON can be pasted/imported if camera access is unavailable. Pairing expires after five minutes.
4. Compare the verification code and confirm it on BOTH devices.
5. Sender selects files and can uncheck exclusions. Receiver reviews and accepts selected files. No file bytes are sent before approval.
6. Receiver saves each verified file before the next file starts. A browser download is labeled **Download requested**, because the app cannot confirm the browser completed it. Check Downloads yourself.

Ordinary download export is limited to **64 MiB per file**. Windows browsers that support private storage and a user-selected streaming destination can handle larger files, subject to actual storage. This is capability-based, not an Android version promise. Keep both pages open and in the foreground. Guest Wi-Fi, client isolation, firewall settings, and browser suspension can prevent or interrupt transfers.

On interruption, keep the pages and selected source files open, re-pair and confirm again, then use **Resume retained transfer** on the receiver. The stored prefix must match. Reload recovery is not supported. Cancel or end the session to discard partial receiving storage. Incoming files are never executed automatically.

## Transfer development and disclosure

Bundled dependencies: Nayuki QR Code generator, jsQR 1.4.0, and the SHA-256 subset of noble-hashes 2.0.1. Versions, hashes, and licenses are in `public/vendor/manifest.json` and `public/vendor/LICENSES.txt`. esbuild 0.25.12 is a development bundler. No model or AI service is used by transfer. Development is AI-assisted through Codex; the transfer subsystem is new, while the PWA shell predates this feature.

`node scripts/measure-transfer-assets.mjs` reports raw and gzip script sizes. To rebuild the pinned vendor assets, run `npm ci` and `node scripts/vendor-transfer.mjs` while online. Deployment uses committed browser-ready files instead.

The optional `scripts/check-transfer-browser.mjs` uses Playwright and installed Microsoft Edge. Install Playwright in your development environment or set `PLAYWRIGHT_MODULE` to its module path, start `npm start`, then run the script. It tests cached offline reload, blocks HTTP during pairing/transfer, downloads and independently hashes the result, and captures desktop/mobile-width screenshots under ignored `work/evidence/`. It is a same-PC browser check, not a physical LAN benchmark.
