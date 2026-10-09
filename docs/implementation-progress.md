# Execution ledger: offline WebRTC transfer

Plan: docs/superpowers/plans/2026-10-09-offline-webrtc-transfer.md
Base: 24fb4197bf163b3924ec7afdf20d26b55d7141c0
Branch: feat/offline-webrtc-transfer

Baseline: npm test, 10 passed, 0 failed.
Ruling: Use the existing checkout on a new feature branch, preserving all untracked research/design files. The user approved execution in this session; a separate checkout would omit the approved uncommitted artifacts.
Ruling: Use this tracked ledger and native Node/PowerShell checks instead of POSIX-only bookkeeping helpers on Windows.
Pre-flight: pairing produces a channel and verification flag consumed by engine; storage produces a staged sink consumed by engine; protocol supplies IDs/chunks used by both peers; UI consumes all interfaces. No conflicting signatures found.
Task 1: in progress. Physical LAN gate requires devices, and will remain explicit if unavailable.
Tasks 1-5: implemented; npm test at this checkpoint: 27 passed, 0 failed. Physical verification remains open.
Ruling: QR/cache/UI integration was consolidated in Task 5 rather than building and discarding a temporary pairing-only interface. Pairing was independently tested first with real Edge peers.
Ruling: encodePairing returns a Promise because its frame digest uses native SHA-256. All callers await it.
Ruling: Ordinary OPFS download export materializes at most the approved 64 MiB fallback into independent bytes before deleting its backing entry. Browser integration reproduced a canceled download before the change and verified the saved hash afterward.
Ruling: Browser offline emulation inhibits ICE. Use it for cached reload; block HTTP with routing for the subsequent transfer while retaining local sockets. Physical WAN-disconnected verification remains a separate gate.
Task 6: local browser acceptance passes for 1 MiB plus empty file; no page errors; desktop/mobile-width captures; physical gates pending. Independent code review pending.
Final review: independent reviewer completed read-only review of 24fb4197..93b6c762 and reported three actionable issues. All three are reproduced by regression tests and fixed in one follow-up pass; no unresolved reported code issue remains.
Ruling: Recovery preserves accepted data on inactivity, refuses to skip an unsaved verified file, and restarts the sender after that file is exported. Invalid/corrupted protocol input still aborts rather than resuming unsafe state.
Ruling: Bound retained download object URLs to 64 MiB total. Credits release after 60 seconds or explicit session exit; an export can wait for credits. This does not claim total browser RAM is 64 MiB. Session-exit guidance tells users to finish downloads first.
Task 6: full same-PC Edge UI check also passes for 64 MiB plus empty file with independent saved hashes, no page errors, and no mobile-width overflow. Approximately 0.75 MB/s displayed; this is below the earlier planning estimate and is not a LAN benchmark.
Physical gates remain untested: Windows/Android WAN-disconnected pairing and transfer, camera scanning, mobile resource use, large user-selected streaming destinations, and other operating systems.
Final release candidate: shell v3. Do not publish or claim hardware acceptance from local mocks or desktop viewport checks.
Ruling: The 30-second connection deadline starts only after the sender applies the reply; QR exchange retains the approved five-minute window. A regression caught the premature deadline before finalization.
Final local verification: npm test, 36 passed / 0 failed; syntax checks and git diff --check passed. Transfer script footprint: 197,724 raw bytes / 71,663 gzip bytes. Physical acceptance remains open; feature is kept on its local branch until publication is chosen.
