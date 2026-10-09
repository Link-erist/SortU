# AppBuildersHackathon

A simple one-page Progressive Web App. Plain HTML, CSS, and JavaScript with no production dependencies or build step.

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

The tests exercise installation UI behavior and the service worker's offline fallback and cache cleanup. Browser checks are still needed for native installation.

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

Visit once online and wait for **Available offline**. The worker precaches the page, styles, script, manifest, and all icons. A subsequent offline reload returns the cached page. First visits need a connection. A cache may be removed by the browser, storage pressure, or clearing site data, so offline access is not permanent storage.

The page checks the network first; local app assets use a versioned cache. When changing cached files, **increment `APP_VERSION` in `public/sw.js` and the `app-shell-version` meta tag in `public/index.html` together**, for example to `v2`. Keep that meta tag's attribute order as written. While the next worker waits, the active worker keeps its previous page when the network delivers a different shell version, preventing new markup from mixing with old assets. A new worker normally waits until all old app tabs/windows close. Close them and reopen to activate the new version. Old caches belonging to this app are then removed. No forced reload is used.

To check offline behavior manually: visit online, wait for the offline-ready status, reload once, enable Offline in browser developer tools' Network panel, and reload again. Confirm the page and styles load, then disable Offline. Do not disable the service worker or use bypass-for-network when checking its fallback.

## Current scope and browser limits

This version is just the landing page and PWA foundation. It does not organize files, transfer files, run an AI model, record audio, or transcribe speech. Installing a PWA does not grant unrestricted file access or native background operation. Future file features require user selection and permissions with different API support on desktop and Android. Browser-local storage can be cleared; browser installation does not make it a backup. Device capabilities and model/storage requirements must be checked before adding local AI or transcription.

See [MDN installability guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [service worker guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Project files

- `public/`: everything deployed, including the web manifest and service worker.
- `scripts/serve.mjs`: localhost preview server. Development only.
- `scripts/create-icons.ps1`: recreates the PNG icons on Windows. The artwork fits the maskable safe zone.
- `tests/pwa.test.mjs`: browser-API behavior harness; no external packages.
- `vercel.json`: static output and service worker cache headers.
- `docs/superpowers/`: approved design and implementation plan.

## Verification status

Automated tests and browser results are recorded in `docs/verification.md`. The live HTTPS page loads with Available offline status. Native installation on Windows Chrome/Edge and physical Android devices still needs a device check.
