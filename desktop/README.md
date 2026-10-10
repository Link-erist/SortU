# Portable desktop app

A portable Windows build of the SortU PWA, made with Tauri 2. It is kept separate from the PWA:

- `public/` is the PWA and contains no desktop code. The desktop app shows those same files unchanged.
- `desktop/` holds everything desktop-only:
  - `src-tauri/`: the Rust shell. It opens the window, keeps browser storage in `data/` next to the `.exe` (nothing in AppData), and serves the bundled `model/` and `transcribe-model/` folders read-only at `http://model.localhost/<folder>/`. Nothing else next to the exe is reachable.
  - `web/desktop-bootstrap.js`: injected into the app window. On first launch it copies each bundled model (organizer and transcription) into the app's model cache and runs the PWA's normal preparation, which re-verifies every file. It only imports PWA modules; it doesn't change them.
  - `scripts/package-portable.mjs`: builds the release ZIP.

## Build the release ZIP

You need Rust (MSVC toolchain) and `cargo install tauri-cli --version "^2" --locked`.

1. Get saved model folders. In the PWA, prepare Local AI and transcription, then use Save model to a folder for each. Alternatively, with the models prepared in the test profile, run `node scripts/save-model-folder.mjs ai/model.json work/model-folder` and `node scripts/save-model-folder.mjs transcribe/model.json work/transcribe-model-folder`.
2. Build the exe: `cd desktop/src-tauri` then `cargo tauri build --no-bundle`.
3. Package: from the repo root, `node desktop/scripts/package-portable.mjs [organizerModelFolder] [transcribeModelFolder]`.

The script checks every model file against the pinned sizes and hashes in `public/ai/model.json` before zipping. The output is `desktop/dist/SortU-portable-<version>.zip` (git-ignored). Publish it as a GitHub Release asset; it is too large for the website host.

## ZIP layout

```
SortU-portable-<version>/
  SortU.exe
  README.txt
  model/              saved organizer model folder (ai-organizer-model.json, model/, library/)
  transcribe-model/   saved transcription model folder (same layout)
  data/               created on first launch; delete the whole folder to uninstall
```
