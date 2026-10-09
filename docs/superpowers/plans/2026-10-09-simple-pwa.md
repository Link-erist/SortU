# AppBuildersHackathon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for direct execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved simple, installable one-page AppBuildersHackathon website.

**Architecture:** A static public directory contains the page, styles, browser script, manifest, icons, and service worker. Vercel serves that directory without a build. The service worker caches the same-origin app shell for offline reload after an online visit.

**Tech Stack:** HTML, CSS, JavaScript, Web App Manifest, Service Worker API; Node.js built-in test runner for behavior tests and a local static preview server.

**Spec:** `docs/superpowers/specs/2026-10-09-simple-pwa-design.md`

## Global Constraints

- Page heading, browser title, and installed app name: AppBuildersHackathon.
- One responsive page, system fonts, clean light background, dark text, one blue accent.
- No framework or production dependencies, no placeholder navigation, fake features, login, or dashboard.
- Windows Chrome/Edge and Android Chrome are the target installation browsers.
- Offline access is available after the first successful online visit; do not promise native filesystem privileges or future AI features.
- Keep development-only tooling outside public; distinguish local readiness from remote publication and live account integration.

## Review Focus

1. No install prompt or already installed: keep the install button hidden and the page usable.
2. Failed service worker registration: preserve the working page without a misleading offline claim.
3. Offline reload: return the cached page and required assets after a successful initial visit.
4. Unrelated caches: remove only previous versions of this app's cache.
5. Small screens and keyboard navigation: no horizontal overflow; controls have visible focus and usable targets.

## Task 1: Page and PWA foundation

**Files:** Create `public/index.html`, `public/styles.css`, `public/app.js`, `public/sw.js`, `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/mark.svg`, `tests/pwa.test.mjs`, `scripts/serve.mjs`, `package.json`, `.gitignore`.

**Interfaces:** HTML references same-origin CSS, app script, manifest, and icons. The app script registers `/sw.js` and handles `beforeinstallprompt` and `appinstalled`. The worker handles install, activate, and fetch events. `npm start` serves public on localhost; `npm test` runs Node's behavior tests.

- [x] Add tests that run the worker event handlers in an isolated browser-API harness: successful navigation returns network content, failed navigation returns cached content, asset requests fall back to cache, and activation preserves unrelated caches.
- [x] Add install-UI tests: absent prompt hides the button, standalone mode hides it, a supplied prompt enables installation, dismissal allows a later prompt, and appinstalled hides it.
- [x] Run `npm test` before implementation and confirm failures reflect missing app behavior.
- [x] Implement the responsive page, prompt handling, manifest, and worker. Use versioned app caches, network-first navigation, cached local assets, and normal worker updates without forced reloads.
- [x] Generate the geometric mark and correctly sized PNG icons; keep maskable artwork within the safe zone.
- [x] Run `npm test` and JavaScript syntax checks; confirm all tests pass and manifest asset paths resolve.
- [x] Serve public on localhost and inspect the real browser at desktop and mobile dimensions. Verify service worker registration and cached asset contents. Exercise a real offline reload if available; otherwise explicitly record that limitation.

## Task 2: Deployment preparation and handoff

**Files:** Create `vercel.json`, `README.md`; update this plan's completed steps and the design's review state.

**Interfaces:** Vercel serves `public/` as the output directory, with service worker revalidation headers. README explains the existing repository's Vercel import settings and production branch main.

- [x] Configure static Vercel output and prevent stale service worker caching at the HTTP layer.
- [x] Document `npm start`, `npm test`, installation through browser menus, HTTPS/localhost requirements, and why file:// is not a valid PWA preview.
- [x] Document Vercel GitHub import, Framework Preset Other, public output, no framework build, main production branch, and automatic deployments after account connection.
- [x] Record offline, update-lifecycle, browser storage eviction, and permission limits. Keep Android and public HTTPS verification marked unverified unless actually exercised.
- [x] Run the full suite again after final changes, review the files against the approved design, and report results plus unresolved remote deployment checks. Keep remote publication separate from this local implementation.

## Plan self-review

The plan covers the approved page, PWA behavior, file layout, deployment preparation, and verification. Each review condition has a behavior test or browser check. There are no additional product features. Direct execution is recommended because these two tasks share a small app shell and introduce no framework integration.

## Execution state

Approved by the user for direct execution. Both implementation tasks are complete locally. All listed checks were performed or their tooling/device limitations were recorded in `docs/verification.md`. Tests pass 10/10. Independent review's update-coherence finding was reproduced and fixed. Remote publication and physical-device installation remain separate checks.
