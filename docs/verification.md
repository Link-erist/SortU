# Verification: AppBuildersHackathon

Checked on October 9, 2026, in the AI Organizer checkout.

## Passed

- `npm test`: 10/10 tests pass. Initial nine behavior tests failed before their implementation. The update-coherence regression failed before its fix and now passes.
- JavaScript syntax checks for the app script, worker, and preview server.
- HTTP checks: shell files return 200; manifest has the expected content type, name, identity, start URL, scope, and standalone display; all declared icons are valid PNG files of the advertised dimensions.
- Preview server rejects directory traversal (403), root-level development documentation (404), and POST (405).
- Desktop in-app browser: exact document title and heading, loaded SVG icons, readable layout, and Available offline status.
- Mobile viewport 390x844: no horizontal overflow. Narrow viewport 320x740: no horizontal overflow, with 305px usable document width after the scrollbar.
- Real offline reload: stopped the preview server, reloaded the page in the in-app browser, and confirmed the final version tag, title, styled heading, loaded SVG icons, and Available offline status. Repeated after the review fix and closing the previous app tab.
- Independent code review found one update-coherence defect. A two-version regression reproduced it; the version guard now preserves the active worker's shell when a new release is waiting.

## Limits and remaining checks

- Direct inspection of worker registrations/cache entries is unavailable through the browser tool's DOM-only evaluation. Successful worker readiness and the real stopped-server reload provide behavioral evidence of registration and caching.
- Native installation into Windows Chrome/Edge and a physical Android Chrome device has not been performed. Prompt handling is tested in a browser-API harness; mobile viewport checks are not physical Android checks.
- Vercel configuration is prepared and checked against current official documentation. No live Vercel build, public HTTPS installability check, GitHub push, or GitHub-to-Vercel account connection has been performed.
- Runtime worker-version activation across two live deployments is covered by the regression harness, not a deployed two-release browser test.

## Updates

Advance `APP_VERSION` in `public/sw.js` and the paired HTML meta tag together when changing the cached shell. Close all previous app tabs/windows to activate the next worker normally. Offline availability depends on the browser retaining this app's cache.

## Local state

Implementation is in the dedicated checkout on `feat/simple-pwa`, with no commits or remote publication yet. The preview uses http://127.0.0.1:4173. The repository began empty, so there is no existing main commit to merge into or compare against.
