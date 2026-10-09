# Portable desktop app

A portable Windows build of the AI Organizer PWA, made with Tauri 2. It is kept separate from the PWA:

- `public/` is the PWA and contains no desktop code. The desktop app shows those same files unchanged.
- `desktop/` holds everything desktop-only:
  - `src-tauri/`: the Rust shell. It opens the window, keeps browser storage in `data/` next to the `.exe` (nothing in AppData), and serves the bundled `model/` folder read-only at `http://model.localhost/`.
  - `web/desktop-bootstrap.js`: injected into the app window. On first launch it copies the bundled model into the app's model cache and runs the PWA's normal preparation, which re-verifies every file. It only imports PWA modules; it doesn't change them.
  - `scripts/package-portable.mjs`: builds the release ZIP.

## Build the release ZIP

You need Rust (MSVC toolchain) and `cargo install tauri-cli --version "^2" --locked`.

1. Get a saved model folder: in the PWA, choose Local AI, then Prepare local AI, then Save model to a folder. Alternatively, `scripts/check-ai-model-folder-browser.mjs` writes one to `work/model-folder`.
2. Build the exe: `cd desktop/src-tauri` then `cargo tauri build --no-bundle`.
3. Package: from the repo root, `node desktop/scripts/package-portable.mjs [path/to/saved/model/folder]`.

The script checks every model file against the pinned sizes and hashes in `public/ai/model.json` before zipping. The output is `desktop/dist/AI-Organizer-portable-<version>.zip` (git-ignored). Publish it as a GitHub Release asset; it is too large for the website host.

## ZIP layout

```
AI-Organizer-portable-<version>/
  AI Organizer.exe
  README.txt
  model/              saved model folder (ai-organizer-model.json, model/, library/)
  data/               created on first launch; delete the whole folder to uninstall
```
