# AppBuildersHackathon: initial one-page PWA

## Goal

Create a simple website from scratch in the empty AppBuildersHackathon repository. The visible page heading, browser title, and installed app name will be AppBuildersHackathon. Preserve the earlier goal of installation on Windows Chrome/Edge and Android Chrome, plus offline access after the first successful online visit.

## Recommended approach

Use plain HTML, CSS, and JavaScript with no framework or production dependencies. Vite would add a build step without helping this single page; Next.js would add unnecessary application structure. Reconsider a framework when real application features need it.

## Page

One responsive page with a small geometric app mark, the exact requested title, a short welcome sentence, and an install button shown when the browser supplies an installation prompt. Use a clean light background, dark text, and one blue accent. Include accessible focus states, readable mobile sizing, and system fonts. Avoid placeholder navigation, fake features, login, and dashboards.

## PWA behavior

- A web app manifest supplies the name, stable app identity, start URL, scope, standalone display, colors, and local 192px/512px PNG icons including a maskable icon.
- Register a same-origin service worker on HTTPS or localhost. Cache the page and all required local assets during installation. No external fonts or CDN resources are required.
- Use network-first navigation with a cached page fallback, and a small versioned cache for app assets. Remove old app cache versions on activation. Let waiting workers activate through the normal lifecycle, avoiding forced reloads.
- Hide the install button when installation is unavailable or the page is already running standalone. Browser installation menus remain an alternative.
- Do not claim unrestricted filesystem access. Installation does not grant native file management, background scanning, local AI, or transcription. Those future capabilities require separate designs and browser/device checks.

## Files

`public/index.html`, `public/styles.css`, `public/app.js`, `public/sw.js`, `public/manifest.webmanifest`, local icons, `vercel.json`, and a concise `README.md`. Keep development-only tooling outside `public/`.

## Deployment

Configure Vercel to serve `public/` without a framework build. Document importing the GitHub repository into Vercel and selecting main as the production branch. Live account connection and remote publication must be distinguished from local deployment preparation. GitHub-to-Vercel auto-deploy is enabled by connecting the repository in the Vercel account, not by a local configuration file alone.

## Verification

Serve the production directory over localhost, check manifest fields and icon dimensions, inspect desktop/mobile layouts, and verify real service worker registration, cached resources, and offline reload in a browser where available. Check install-prompt handling. Report any unavailable physical Android or production HTTPS checks explicitly. Opening the HTML through file:// is not a valid PWA test.

## Review state

Approved by the user, implemented, committed to GitHub main, and deployed to Vercel. See `docs/verification.md` for evidence and remaining device checks.
