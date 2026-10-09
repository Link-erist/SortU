# Verification: AppBuildersHackathon

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
