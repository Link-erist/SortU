# SortU

A Progressive Web App centered on private file organization, with browser-only LAN file transfer as a secondary workspace. Plain HTML, CSS, and JavaScript with locally bundled ZIP, QR, and hashing libraries. Deployment needs no build step or runtime CDN.

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

The tests exercise organizer rules, safe proposals, approval invalidation, exclusions, bounded ZIP export, verified copies, workspace ownership, and PWA/transfer behavior. Native installation and physical LAN compatibility still need device checks.

## Deploy to Vercel with GitHub

1. Commit and push the project to [Link-erist/SortU](https://github.com/Link-erist/SortU). Use `main` as the production branch once the code is ready there.
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

Visit once online on EACH device and wait for **Available offline**. The worker precaches both workspaces, workers, bundled libraries, page, styles, manifest, and icons. A subsequent offline reload returns the cached app. First visits need a connection. A cache may be removed by the browser, storage pressure, or clearing site data, so offline access is not permanent storage.

The page checks the network first; local app assets use a versioned cache. When changing cached files, **increment `APP_VERSION` in `public/sw.js` and the `app-shell-version` meta tag in `public/index.html` together**, for example to `v2`. Keep that meta tag's attribute order as written. While the next worker waits, the active worker keeps its previous page when the network delivers a different shell version, preventing new markup from mixing with old assets. A new worker normally waits until all old app tabs/windows close. Close them and reopen to activate the new version. Old caches belonging to this app are then removed. No forced reload is used.

To check offline behavior manually: visit online, wait for the offline-ready status, reload once, enable Offline in browser developer tools' Network panel, and reload again. Confirm the page and styles load, then disable Offline. Do not disable the service worker or use bypass-for-network when checking its fallback.

## Current scope and browser limits

This feature branch implements rules-based organization and renaming of exported copies, plus file transfer. Local AI, content understanding, chatbot, PDF content analysis, and timestamped transcription remain subsequent subsystems. This rules-based milestone alone does not meet the hackathon's local AI inference requirement. Installing a PWA does not grant unrestricted file access or native background operation. File picking and saving vary across browsers. Browser-local storage can be cleared; browser installation does not make it a backup. The existing production URL is not updated until this feature is published.

## Organize files privately

1. Open **Organize**, then select 1 to 100 files or a folder. Only these selected files are accessible. Uncheck any files to exclude them. Inventory and proposals use names, extensions, and last-modified metadata without reading file contents.
2. Use automatic defaults or choose grouping by type, modified year, or original folders. Preserve names, normalize them, or use `{stem}`, `{category}`, `{index}`, and `{date}` in a naming template. Extensions are retained. `{date}` uses the selected file's last-modified date in the device's time zone.
3. Optionally provide supported directives in the instruction box (8 KiB UTF-8) or a `.txt`/`.md` README guide (32 KiB). For example:

   ```text
   Group by: type
   Naming: project_{stem}_{index}
   Exclude: *.tmp, private*
   ```

   Unsupported prose or conflicting guides block the proposal. **Use automatic settings and ignore guides** explicitly bypasses guide instructions and resets manual settings. Manually excluded files stay excluded. Manually changed controls override matching guide directives and are identified in the active rules summary. Exclusion patterns support `*` and `?`, at most 20 patterns of 256 characters each.
4. Generate a proposal, review the original and proposed paths, edit if needed, and explicitly approve. Changes to selection, settings, instructions, or target paths invalidate approval. Unsafe Windows paths, collisions, and file/directory conflicts block approval. Automatic collisions receive deterministic keep-both suffixes.
5. Download a ZIP, or on browsers exposing folder-writing support choose a parent folder. Folder export creates a new `Organized-<date>-<uuid>` subfolder, copies bytes, and independently rereads and verifies each saved file. Originals are not moved, rewritten, or deleted. A failure reports the partial output folder instead of deleting it. ZIP export reports **download requested** because the app cannot confirm browser saving finished.
6. Or choose **Reorganize this folder in place** (Chrome and Edge on computers, and the portable app; not Android, where the browser cannot write to folders). Pick the folder the files came from. Before anything changes, SortU checks that every selected file is still there and unchanged and that no proposed path is already taken, then lists every move for you to confirm. Each file is copied, re-read and checked, and only then is the original removed; folders left empty are removed too. `SortU-restore-log.json` is written in the folder first and updated after each move, so **Restore original layout** can move everything back, even after a reload (choose the same folder). Saving copies stays the default.

The **Proposed changes** panel shows **Before** (original paths) and **After** (the new folder tree with file counts) side by side. Select a file on either side to highlight it on both.

ZIP output is capped at **64 MiB including archive overhead and the organization report**. The conservative admission estimate can reject a selection slightly below that ceiling. Folder export streams files sequentially and has no app-wide byte cap, subject to browser permissions and disk capacity. Both export modes read in 32 KiB chunks. The report includes metadata, rules, excluded paths, and SHA-256 checksums, with a 512 KiB report cap. It does not include guide text or file contents.

Organizer and Transfer retain their sessions when switching tabs. Export construction is serialized across both workspaces. Retained download buffers share a 64 MiB budget and release after up to 60 seconds; this is not a total browser RAM guarantee. Ending Transfer releases only Transfer downloads. Clearing Organizer releases only Organizer downloads. Wait for downloads before clearing or closing.

Android uses the capabilities its browser actually provides. ZIP export and standard file selection are the portable routes; direct folder saving is offered only when supported. Mobile viewport tests do not prove physical Android support or acceptable memory use. Keep this app in the foreground during jobs.

The organizer ZIP vendor is the stored-entry subset of fflate 0.8.3, bundled locally with its MIT license. Run `node scripts/vendor-organizer.mjs` after installing development dependencies to regenerate it. Runtime operations use no CDN or server API. Model inference is not part of this version.

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
2. Open **Transfer**. Choose **Send files** on one device and **Receive files** on the other.
3. Receiver scans every sender QR frame. Sender then scans every receiver reply frame. Complete pairing JSON can be pasted/imported if camera access is unavailable. Pairing expires after five minutes.
4. Compare the verification code and confirm it on BOTH devices.
5. Sender selects files and can uncheck exclusions. Receiver reviews and accepts selected files. No file bytes are sent before approval.
6. Receiver saves each verified file before the next file starts. A browser download is labeled **Download requested**, because the app cannot confirm the browser completed it. Check Downloads yourself.

Ordinary download export is limited to **64 MiB per file**. Windows browsers that support private storage and a user-selected streaming destination can handle larger files, subject to actual storage. This is capability-based, not an Android version promise. Keep both pages open and in the foreground. Guest Wi-Fi, client isolation, firewall settings, and browser suspension can prevent or interrupt transfers.

On interruption, keep the pages and selected source files open, re-pair and confirm again, then use **Resume retained transfer** on the receiver. The stored prefix must match. Reload recovery is not supported. Cancel or end the session to discard partial receiving storage. Incoming files are never executed automatically.

Download object URLs share a 64 MiB memory budget. Large batches can wait up to 60 seconds for earlier download buffers to be released. Wait for browser downloads to finish before ending the session or closing the page; ending the session releases retained URLs. This bounds retained exports, not total browser memory.

## Transfer development and disclosure

Bundled dependencies: Nayuki QR Code generator, jsQR 1.4.0, and the SHA-256 subset of noble-hashes 2.0.1. Versions, hashes, and licenses are in `public/vendor/manifest.json` and `public/vendor/LICENSES.txt`. esbuild 0.25.12 is a development bundler. No model or AI service is used by transfer. Development is AI-assisted through Codex; the transfer subsystem is new, while the PWA shell predates this feature.

`node scripts/measure-transfer-assets.mjs` reports raw and gzip script sizes. To rebuild the pinned vendor assets, run `npm ci` and `node scripts/vendor-transfer.mjs` while online. Deployment uses committed browser-ready files instead.

The optional `scripts/check-transfer-browser.mjs` uses Playwright and installed Microsoft Edge. Install Playwright in your development environment or set `PLAYWRIGHT_MODULE` to its module path, start `npm start`, then run the script. It tests cached offline reload, blocks HTTP during pairing/transfer, downloads and independently hashes the result, and captures desktop/mobile-width screenshots under ignored `work/evidence/`. It is a same-PC browser check, not a physical LAN benchmark.
