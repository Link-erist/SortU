# Verification: AppBuildersHackathon

## Offline transfer feature, October 9, 2026

### Final review and regression checks

- Independent read-only review identified three issues: verified-but-unsaved resume ordering, destructive inactivity recovery, and aggregate retained download memory. Each now has a failing-before-fix regression that passes. Resume preserves the save gate and resumes the sender after export; inactivity pauses without deleting accepted storage; download URLs share a 64 MiB credit budget and are cleaned on session exit.
- Pairing allows its full five-minute QR exchange window, then the sender has a 30-second local-connect timeout after applying the reply. Both cases are tested. The final shell is v3; the app compares its own HTML version with the active worker before claiming offline readiness.
- Full UI check passed at 64 MiB plus an empty file, with actual saved-file hashes matching: `98dc891b284e4d84ac25b0c0a24fdbe39a7f0dbd643ad5e8aa06e02fc6258254`. No page errors or mobile-width overflow.
- The 64 MiB check displayed approximately 0.75 MB/s for confirmed bytes, including UI preparation time. This is same-PC Edge with HTTP blocked, not a physical LAN speed claim or a validated 5 to 20 MB/s target. Browser storage profiling showed 8 MiB writes taking approximately 213 ms in memory and 416 ms in private storage; no speculative storage batching was introduced.
- Final added transfer scripts/libraries: 197,724 raw bytes, 71,663 gzip bytes, excluding existing shell and license metadata. This is payload footprint, not measured browser RAM.
- Final `npm test`: 36 passed, 0 failed, including bounded sender window, negotiated chunk size, failed-write acknowledgment, pairing deadlines, and old-worker readiness. JavaScript syntax checks and `git diff --check` pass.

The checkpoint below preserves pre-review evidence; final fresh test results are recorded in the execution ledger.

Feature branch: `feat/offline-webrtc-transfer`. These results concern local feature code; they do not mean production has been updated.

- `npm test`: 27 passed, 0 failed at this checkpoint. Missing modules were observed failing before implementation; cancellation-reuse and capability checks failed before their fixes.
- Real headless Edge pages paired with `iceServers: []`, showed matching verification codes, and exchanged data.
- Full UI check: prepared both pages, reloaded with browser offline emulation, then blocked HTTP requests while keeping LAN sockets available. Browser offline emulation also inhibits ICE, so it was not left enabled for pairing. This distinction is recorded rather than equating it with a physical WAN disconnect.
- Receiver approved and verified a 1 MiB file and a zero-byte file. Actual browser downloads were independently checked. SHA-256 for the 1 MiB source and saved output: `631b84027d6b9e52b539c4e8373622d23032dfadc64d60af87339c9037e4f769`.
- No page errors. A 390-pixel-wide viewport had no horizontal overflow. This is desktop Edge at a mobile width, not Android verification.
- Transfer scripts and bundled libraries: 194,569 raw bytes and 70,538 gzip bytes at this checkpoint, excluding existing shell and license metadata. Rerun `node scripts/measure-transfer-assets.mjs` after changes.
- Same-page prefix-verified resume and cancellation followed by another transfer pass deterministic engine tests. Corrupted digest and failed writes do not publish/acknowledge completion.
- Browser export regression: deleting an OPFS backing entry immediately canceled its download. The bounded download fallback now materializes independent bytes before deleting staging; the same full browser check passed afterward.

Remaining gates: physical Windows/Android with WAN disconnected; real camera scanning of multi-frame QRs; 64 MiB mobile export and memory measurement; large-file streaming destination; actual Wi-Fi throughput; mobile background interruption; firewall/client isolation; macOS/iOS; native PWA installation. No verified cross-device speed or universal compatibility is claimed.

The following sections preserve the earlier PWA-shell verification history.

Checked on October 9, 2026, in the AI Organizer checkout.

## Passed

- `npm test`: 10/10 tests pass. Initial nine behavior tests failed before their implementation. The update-coherence regression failed before its fix and now passes.
- JavaScript syntax checks for the app script, worker, and preview server.
- HTTP checks: shell files return 200; manifest has the expected content type, name, identity, start URL, scope, and standalone display; all declared icons are valid PNG files of the advertised dimensions.
- Preview server rejects directory traversal (403), root-level development documentation (404), and POST (405).
- Production HTTPS checks: page, manifest content type and metadata, all PNG dimensions, app assets, and service worker no-cache/no-store headers passed.
- Desktop in-app browser: exact document title and heading, loaded SVG icons, readable layout, and Available offline status.
- Mobile viewport 390x844: no horizontal overflow. Narrow viewport 320x740: no horizontal overflow, with 305px usable document width after the scrollbar.
- Real offline reload: stopped the preview server, reloaded the page in the in-app browser, and confirmed the final version tag, title, styled heading, loaded SVG icons, and Available offline status. Repeated after the review fix and closing the previous app tab.
- Independent code review found one update-coherence defect. A two-version regression reproduced it; the version guard now preserves the active worker's shell when a new release is waiting.

## Limits and remaining checks

- Direct inspection of worker registrations/cache entries is unavailable through the browser tool's DOM-only evaluation. Successful worker readiness and the real stopped-server reload provide behavioral evidence of registration and caching.
- Native installation into Windows Chrome/Edge and a physical Android Chrome device has not been performed. Prompt handling is tested in a browser-API harness; mobile viewport checks are not physical Android checks.
- GitHub publication and the GitHub-to-Vercel account connection are complete. Vercel's production dashboard reports Ready for the app's initial commit, with main as its production branch.
- The HTTPS production page loads in the in-app browser and reports Available offline. Native browser installation remains unverified; this is not a claim that the OS installation flow has been tested.
- Runtime worker-version activation across two live deployments is covered by the regression harness, not a deployed two-release browser test.

## Updates

Advance `APP_VERSION` in `public/sw.js` and the paired HTML meta tag together when changing the cached shell. Close all previous app tabs/windows to activate the next worker normally. Offline availability depends on the browser retaining this app's cache.

## Local state

Implementation is committed and published on `main` in Link-erist/AppBuildersHackathon. The initial app commit is `f155eaa443905e7dd9995906b5c53c75a15dee8c`. The preview uses http://127.0.0.1:4173.

## Deployment

Live site: https://appbuildershackathon.vercel.app/

Dashboard: https://vercel.com/link-erists-projects/appbuildershackathon

Vercel imported the GitHub repository using Other, repository root, public output, and no build/install command. The production dashboard states that pushes to main update production. The connector's team-scoped operations returned 403, so setup was completed through the user's signed-in Vercel browser session. No connector access settings were changed.
