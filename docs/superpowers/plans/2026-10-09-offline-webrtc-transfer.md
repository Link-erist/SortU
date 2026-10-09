# Offline WebRTC Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight, consent-based offline LAN file transfer to the existing PWA.

**Architecture:** Exchange complete WebRTC offer/answer information through two-way QR pairing, with no internet signaling or ICE servers. Transfer selected files in bounded chunks and verify bytes before saving or exporting. Keep the existing static PWA and isolate pairing, protocol, storage, hashing, engine, and UI.

**Tech Stack:** Plain JavaScript modules, native WebRTC, browser storage and file APIs, Web Workers, Node's existing test runner. Locally bundle Nayuki QR encoding, jsQR scanning fallback, and the SHA-256 subset of noble-hashes. Pin upstream revisions or versions and retain licenses when acquiring dependencies; no runtime CDN requests.

**Spec:** `docs/superpowers/specs/2026-10-09-offline-webrtc-transfer-design.md` (user approved).

## Global Constraints

- Browser-only; no companion executable, backend, cloud relay, STUN, TURN, account system, or framework migration.
- `iceServers: []`; reliable, ordered data channel; explicit pairing verification and receiver consent before file bytes.
- Initial payload chunks 32 KiB, reduced by negotiated message limits; initially 1 MiB queued maximum.
- Basic Blob export fallback capped at 64 MiB per file; sequential transfers.
- Incremental SHA-256 in a worker; preserve file contents; names and paths are untrusted.
- Resume only with retained page state, selected source, verified stored prefix, and new verified pairing. No reload recovery claim.
- Cache all modules, workers, and dependencies before claiming offline readiness. Camera and buffers are released on exit/cancel.
- Windows Chrome/Edge and actual compatible Android Chrome are initial physical acceptance targets; other platforms remain unverified until tested.
- All other requested file-manager features remain in scope for subsequent subsystems. This plan implements transfer only.
- Preserve existing installation behavior and unrelated research files. Do not push or publish during plan creation.

## Review Focus

1. Swapped, stale, or mixed QR frames must never pair the wrong session (Task 1).
2. Browser downloads do not provide proof that the user saved the file; distinguish export requested from confirmed saved (Tasks 3 and 5).
3. Storage loss or revoked permissions after acceptance must stop sending acknowledgments and clean up safely (Tasks 3 and 4).
4. Reconnection with a changed file or duplicate completion must not corrupt or duplicate output (Task 4).
5. Camera denial, interrupted mobile lifecycle, and older cached shells must show recovery guidance rather than false readiness (Tasks 1 and 5).

## File Map and Shared Types

- `public/transfer/pairing.js`: peer creation, complete descriptions, verification code, pairing expiry.
- `public/transfer/qr.js`: QR rendering, frame assembly, scanner lifecycle, paste/import parsing.
- `public/transfer/protocol.js`: wire messages, binary frames, validation, limits.
- `public/transfer/storage.js`: receiver admission, staged sink, commit/export/abort.
- `public/transfer/hash.js`, `hash-worker.js`: incremental hashing and bounded worker requests.
- `public/transfer/engine.js`: sender and receiver state, consent, acknowledgments, recovery.
- `public/transfer/ui.js`: transfer page and controls.
- `public/vendor/`: pinned browser-ready dependencies plus license notices.
- Existing `public/index.html`, `styles.css`, `app.js`, `sw.js`: UI entry, styling, boot, offline caching.
- `tests/transfer-*.test.mjs`: deterministic protocol/component tests. `docs/verification.md`: browser and physical evidence.

Use JSDoc types. `Manifest = { transferId: string, files: FileEntry[] }`; `FileEntry = { id: string, name: string, path: string, size: number }`. IDs are UUID strings. `PairingPayload = { version: 1, pairingId: string, role: 'offer'|'answer', expiresAt: number, description: RTCSessionDescriptionInit }`. Keep transfer IDs separate from pairing IDs to support re-pairing.

## Task 1: Offline Pairing and QR Exchange

**Files:** Create `pairing.js`, `qr.js`, QR vendor assets/notices, `tests/transfer-pairing.test.mjs`. Add a minimal Transfer pairing view to `index.html`, `styles.css`, and bootstrap through `app.js`; cache its assets in `sw.js` and preserve the existing tests.

**Interfaces:** `createPairing({role, payload?, peerFactory?, clock?}) -> Promise<PairingSession>`; session exposes `payload`, `peer`, `channelReady: Promise<RTCDataChannel>`, `applyAnswer(payload)`, `verificationCode() -> Promise<string>`, and `close()`. `encodePairing(payload) -> string[]`; `createFrameCollector() -> {add(text): PairingPayload|null, reset()}`; `scanPairing(video, onPayload) -> Promise<stopFunction>`.

- [ ] Write tests that assert no ICE servers, ordered/reliable channel, complete ICE before export, answer belongs to offer, identical verification code on both ends, changed fingerprint changes code, timeout closes peer, and late callbacks after close have no effect. Add frame roundtrip, duplicate/reordered frames, mixed IDs, oversize input, expired payload, and malformed descriptions.
- [ ] Run `node --test tests/transfer-pairing.test.mjs`; confirm failure for missing implementation.
- [ ] Implement pairing with a 30-second ICE timeout and 5-minute payload expiry. Bound pairing JSON to 128 KiB, at most 256 QR frames, and at most 800 ASCII characters per frame including its envelope. Encode UTF-8 JSON as base64url; bind frame count/order/content digest to the pairing ID. Show frame progress and previous/next controls. Do not parse incomplete payloads or merge conflicting frames. Validate a data-channel-only description and refuse embedded external ICE configuration.
- [ ] Vendor dependencies from upstream, record versions/revisions/checksums/licenses, and test QR encode/decode roundtrip with the bundled fallback. Stop camera tracks when scanning ends; handle denial with paste/import guidance. Cache all added assets with a coherent shell-version increment; update version-dependent fixtures.
- [ ] Run pairing tests and `npm test`; expect all pass. In two browser pages, complete real offer/answer exchange and compare verification codes. Then test actual Windows/Android QR pairing with WAN disconnected. If physical access is unavailable, record that gate as pending rather than claiming compatibility. If real pairing fails, resolve it before building transfer around it.
- [ ] Commit only this task's files after checks pass, if executing within the user's authorized publication scope; do not push automatically.

## Task 2: Validated Wire Protocol

**Files:** Create `protocol.js` and `tests/transfer-protocol.test.mjs`.

**Interfaces:** `validateManifest(value) -> Manifest`; `parseControl(text) -> ControlMessage`; `encodeChunk({transferId,fileId,offset}, bytes) -> ArrayBuffer`; `decodeChunk(buffer) -> {transferId,fileId,offset,bytes}`; exported `LIMITS`.

- [ ] Write tests: reject traversal and absolute paths, control characters, duplicate IDs/normalized paths, negative/unsafe sizes/offsets, unsupported versions, unknown message types, invalid acceptance IDs, oversized controls/chunks, truncated headers; roundtrip binary payload unchanged. Assert limits and valid zero-byte files.
- [ ] Run `node --test tests/transfer-protocol.test.mjs`; confirm failing implementation imports/assertions.
- [ ] Implement versioned JSON controls: `manifest`, `accept`, `reject`, `ack`, `complete`, `completed`, `status`, `cancel`, `resume`, `error`. Limit controls to 128 KiB, manifest to 100 files, names to 255 characters, paths to 1,024 characters; enforce safe integers and uniqueness. Define a fixed binary header containing version, transfer/file UUIDs, and offset so bytes cannot be confused with control text. Derive payload size from negotiated message capacity after subtracting the actual header length.
- [ ] Run protocol tests and `npm test`; expect all pass. Commit scoped verified changes.

## Task 3: Bounded Hashing and Receiver Storage

**Files:** Create `storage.js`, `hash.js`, `hash-worker.js`, SHA-256 vendor subset/notices, `tests/transfer-storage.test.mjs`, `tests/transfer-hash.test.mjs`.

**Interfaces:** `createHasher() -> {update(bytes): Promise<void>, digest(): Promise<string>, dispose()}`; `hashPrefix(fileOrBlob, length) -> Promise<string>`. `prepareSink(entry, {mode, destination?, adapters?}) -> Promise<ReceiveSink>`; sink exposes `write(offset, bytes)`, `confirmedOffset`, `hashPrefix(length)`, `finish(expectedDigest)`, `export()`, `abort()`. Finish returns `{state:'verified', size}`; export returns `{state:'saved'|'export-requested', name}`. Storage adapter injection enables deterministic fault tests.

- [ ] Write tests for standard SHA-256 known vectors split into chunks, empty files, worker disposal/error, sequential writes, wrong offsets, quota/write failures, cancel cleanup, digest mismatch, no publication before verification, and the 64 MiB Blob ceiling. Assert exactly-at-limit allowed and above-limit rejected; no whole-file read in hashing.
- [ ] Run the two task test files; confirm failure.
- [ ] Implement one outstanding hash-worker request at a time with bounded buffers. Use OPFS staging when available, otherwise bounded in-memory staging. Prefer a user-selected streaming destination when supported; retain a private staging representation as needed for prefix verification. Check estimated storage, available APIs, and destination permissions before consent, then handle failures during writes too. Admission estimates are not guarantees.
- [ ] Commit streaming output only after digest verification; abort staged output on failure. Never silently overwrite. Reuse existing destinations only following explicit approval; otherwise keep both or skip. Do not mark staging as Downloads. In a basic download path, use `export-requested`, because browser download completion cannot be observed reliably. Revoke object URLs after a safe lifecycle and clear staging on cancel/end.
- [ ] Run hashing/storage tests and `npm test`; expect all pass. Exercise real OPFS and file-save APIs in a browser, including denied permission and unavailable API fallback. Record actual added compressed dependency size. Commit scoped verified changes.

## Task 4: Consent, Transfer Engine, and Resume

**Files:** Create `engine.js` and `tests/transfer-engine.test.mjs`.

**Interfaces:** `createTransferEngine({role, channel, pairingVerified, sinkFactory, hasherFactory, onEvent, clock?}) -> Engine`. Engine exposes `offer(files)`, `accept(fileIds, sinks)`, `reject()`, `cancel(transferId)`, `reconnect(channel, pairingVerified)`, `resume()`, `close()`. Events include `manifest`, `progress`, `paused`, `verified`, `saved`, `export-requested`, `error`.

- [ ] Write controlled-channel tests: no payload before verified pairing and consent; declined files never sent; never exceed 1 MiB queued; reduce 32 KiB chunks for negotiated limits; ACK only after a successful sink write; monotonic progress; zero-byte completion; cancellation during write; duplicate/stale messages; lost completion response resolved by status; changed source/prefix rejected on resume.
- [ ] Run engine tests; confirm failure.
- [ ] Implement sequential state transitions: offered, accepted, transferring, paused, verified, saved/export-requested, canceled/error. Maintain a bounded sliding window and a 256 KiB buffered-low threshold. ACK cumulative offsets; sender's displayed completed bytes follow confirmed receiver offsets rather than buffered sends. Do not ACK verification/commit failures as completion.
- [ ] On channel loss, stop sends and retain only current session state. Re-pair and reverify before resume. Exchange confirmed offset and stored-prefix digest, recompute that source prefix before continuing, and reject identity/prefix mismatches. Support repeat `complete` and `status` using stored results. Limit inactivity to 60 seconds during active transfer; pause with guidance rather than silently discarding a recoverable session.
- [ ] Run engine tests and `npm test`; expect all pass. Transfer generated fixtures between two real browser peers and compare independent SHA-256 values. Interrupt, re-pair, resume, and cancel. Commit scoped verified changes.

## Task 5: Complete UI and Offline Integration

**Files:** Create `ui.js`, `tests/transfer-ui.test.mjs`; modify `index.html`, `styles.css`, `app.js`, `sw.js`, `tests/pwa.test.mjs`, and `README.md`.

**Interfaces:** `mountTransfer(root, {pairingFactory, engineFactory, storageFactory}) -> cleanupFunction`; use Tasks 1 to 4 interfaces. Leave existing install handling intact and mount transfer only when its container exists.

- [ ] Write UI tests: receiver acceptance is required; user text is rendered safely; selection/exclusion and per-device limit shown before transfer; cancellation and disconnect recover controls; camera denial offers fallback; staged/verified/export-requested/saved are distinct; no false saved state after a download request. Extend offline tests to include all worker/module/vendor assets and coherent release versions.
- [ ] Run UI and PWA tests; confirm relevant failures before implementation.
- [ ] Replace the welcome-only hero with a responsive Transfer workspace while keeping title, install button, and app readiness indicator. Show Send/Receive, QR exchange, matching-code confirmation, selected files, receiver approval, limits, progress, speed, cancel, retry pairing, and save/export. Explain preparation and foreground requirements. Directory picking is optional and capability-driven; ordinary file selection remains available.
- [ ] Add lifecycle cleanup and capability reporting. Gate readiness on the installed worker caching this release's transfer assets, not merely an older active worker. Cache vendor/worker files with the updated shell; never runtime-fetch a dependency. Confirm Vercel's existing static configuration still serves the modules without backend changes.
- [ ] Run `npm test`; expect all pass. Inspect desktop/mobile widths, keyboard access, labels, focus, and real camera cleanup in the browser. Reload with network unavailable and complete a peer session without runtime internet requests. Commit scoped verified changes.

## Task 6: End-to-End Evidence and Release Decision

**Files:** Update `docs/verification.md` and `README.md`; create `scripts/measure-transfer-assets.mjs` for reproducible raw/gzip asset totals.

- [ ] Run `npm test` and `node scripts/measure-transfer-assets.mjs`; record results, dependency disclosures, versions, and additional asset size.
- [ ] Prepare the same app release on actual Windows and Android devices. Disconnect router WAN while leaving LAN active. Complete two-way QR pairing and transfers in both directions for empty, small, and 64 MiB fixtures; verify independent saved-file hashes. Exercise streaming above the fallback ceiling only on a capable receiver.
- [ ] Measure elapsed time through verification and actual save where observable, with pairing separately reported. Record device models, browser versions, connection type, bytes, duration, peak observed memory, and storage route. Do not report same-PC results as physical LAN results.
- [ ] Test interrupt/resume, rejection, cancellation, storage exhaustion, camera denial, mobile background interruption, and isolated network failure. Verify all partial resources are cleaned or deliberately retained for same-page recovery.
- [ ] Record each gate as passed, failed, or untested. Physical mobile/browser access may require user participation; retain those gates if unavailable. Do not claim full offline device compatibility or end-to-end speed from mocked tests.
- [ ] Review the complete change against the approved spec, fix material issues, rerun affected checks, and make the verified branch reviewable. Push/deploy only within explicit authorization for this feature; otherwise present the concrete result for publication.

## Self-Review and Handoff

All spec requirements map to Tasks 1 through 6. Shared names and states are consistent. The five review risks have owning tests. The browser download limitation is handled by truthful `export-requested` state rather than an unverifiable saved claim. Dependency acquisition, product code, and physical testing begin only during execution.

Recommended execution: native implementation in this session, because these modules have tightly coupled interfaces and the existing app is small. Use a fresh whole-change reviewer after implementation as required by the execution workflow. Subagent-driven execution is available if the user prefers independent task-by-task review. User review of this plan and selection of execution method are pending.

## Primary Dependency References

- https://github.com/nayuki/QR-Code-generator
- https://github.com/cozmo/jsQR
- https://github.com/paulmillr/noble-hashes
