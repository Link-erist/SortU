# Transcription Workspace Plan

Branch: `feat/transcription`. Base: `86593ce`.

## Decisions (user, 2026-10-10)

- Whisper **Small**: `Xenova/whisper-small`, pinned at revision `2d67713f236afa48a18992566e7647f6ca848e13`, with an fp16 encoder (176.6 MB) and a q4 merged decoder (233.2 MB). That is about 413 MB including the config and tokenizer files.
- A **separate Transcribe workspace**, next to Organize and Transfer.
- The **user picks one or more formats**: SRT, WebVTT, and plain text with `[hh:mm:ss]` timestamps.
- A **separate download** from the organizer model, prepared when the workspace is first used. Save to a folder and load from a folder are supported, the same as for the organizer.
- Browsers: transcription is offered wherever it can actually run, including browsers rejected for the organizer, if they pass the capability check. Otherwise it explains why not.
- The portable app bundles this model too. That is the feature-parity rule.

## Guarantees (same as Local AI)

- No network after preparation. Only pinned URLs are allowed, every file is size- and hash-verified on each cold load, and the network is refused offline.
- **No CDN:** transformers.js would load the onnxruntime engine from jsdelivr by default. The app sets a local loader instead, and supplies the 27 MB engine binary from the verified, pinned download (`wasmBinary`).
- Recordings are read only. Transcripts are new files, and the originals are never changed. Only selected files are processed.

## Tasks

1. **Vendoring and manifest.**
   - Bundle transformers.js 4.3.0 locally.
   - Copy the onnxruntime asyncify loader (53 KB, shell-cached).
   - Pin the engine binary and the model files in `public/transcribe/model.json`, with sizes and hashes from the Hugging Face API and the local file.
   - Generalize the transport and model-folder code so the engine library entry is optional and same-origin pinned artifacts are allowed.
2. **Worker and runtime.**
   - The worker handles prepare, verifyOffline, transcribe, and cancel.
   - It sets `env.fetch` to the verifying transport, turns off remote and browser caches, sets local `wasmPaths`, and passes `wasmBinary` from the transport.
   - It runs the ASR pipeline on WebGPU, with 30 s chunks, overlapping stride, segment timestamps, and an optional language.
   - Only one job runs at a time. Each job has a revision id, and cancel terminates the worker.
3. **Audio input.**
   - Decode the audio or video track with the browser, then resample to 16 kHz mono.
   - Limits: 200 MiB per file and 30 minutes per file, because decoding holds the full track in memory.
   - Clear errors for an unsupported codec, a file with no audio track, or a file that is too long.
4. **Formatters.** Pure SRT, VTT, and TXT writers from timestamped segments. These handle overlapping chunk boundaries, missing end times, and escaping.
5. **Workspace UI.**
   - A Transcribe tab with:
     - a setup card (compatibility check, about 440 MB, Prepare, Load from folder, Save to folder);
     - file selection (audio and video only);
     - format checkboxes and a language picker (Auto plus common languages);
     - Transcribe, per-file progress and cancel;
     - results with a preview, per-file downloads, and a ZIP of everything.
   - Shell v8 becomes v9.
6. **Save and load the transcription model folder,** using the generalized model-folder code with its own marker.
7. **Verification.**
   - Unit tests for formatters, limits, the manifest, the transport, and the worker protocol.
   - A real browser check: synthetic speech made with Windows text-to-speech from a fictional script, transcribed offline. The check covers the word-overlap score, timestamp ordering, all three formats, zero network requests, and cancellation.
8. **Portable app.** Bundle `transcribe-model/` in the ZIP, install it on first launch, rebuild, and re-test.

## Risks

- Large files: decoding a whole track uses a lot of memory, hence the 30-minute limit. Streaming decode would be a later improvement.
- Speed: Whisper Small on an integrated GPU may be slower than real time. Each run will be measured and reported.
- Language quality: Tagalog accuracy is unknown, so it will be measured rather than assumed.
