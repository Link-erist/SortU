# Offline browser file transfer design

## Intent and approval state

Build the transfer subsystem of the existing AppBuildersHackathon PWA for a hackathon demonstration. The user approved WebRTC provided it works offline and stays lightweight. Browser-only and explicit file selection remain constraints. This document makes that approach concrete for review before an implementation plan. It does not claim a working transfer implementation or verified device throughput.

The other requested file-manager features remain in the overall project scope. This subsystem neither implements nor removes organization, renaming, exclusions, proposal approval, automatic organization, local AI, or timestamped transcription.

## Architecture decision

Use browser RTCPeerConnection and a reliable, ordered RTCDataChannel. Set iceServers to an empty list. Do not use internet signaling, public STUN, TURN, or a cloud file relay. Both prepared devices must remain on a local network that permits peer communication. Being on the same Wi-Fi does not guarantee connectivity on guest or isolated networks.

Alternatives considered: the existing File Transfer Go host simplifies pairing and storage but requires a Windows server; cloud signaling simplifies pairing but requires internet when establishing a session. Neither fits the current constraints.

Vercel serves the initial PWA installation and updates. Cache every transfer asset locally, including QR support. Each device must prepare the current PWA while online before an offline session. The same cached HTTPS origin remains the app origin offline. A new device cannot first install from Vercel with no internet.

## User flow

1. Open Transfer and choose Send or Receive. Show capability checks and preparation status in plain language.
2. Sender creates a session and displays a pairing QR. Receiver scans it and displays a reply QR. Sender scans the reply. Explain that the two-way exchange is needed for offline pairing.
3. Wait for ICE gathering to finish before creating each pairing payload. Include the complete offer or answer and connection candidates. QR encoding must support multiple frames when necessary; provide paste/import of the complete pairing payload as a fallback. A room PIN alone is not sufficient.
4. Show a matching session verification code on both devices. Users verify the code before approving the session. Derive it from the complete offer and answer, including their advertised transport fingerprints, with a cryptographic digest. Reset verification whenever pairing changes.
5. Sender explicitly selects files. Share a manifest of file IDs, display names, relative paths when supplied by the picker, and sizes. Never scan an unselected directory or automatically expose received files to another peer.
6. Receiver reviews the manifest and accepts selected files. No bytes are sent before acceptance. Show that files stay on the participating devices.
7. Show per-file and overall progress, speed, cancel, and clear connection failures. Distinguish received, verified, and saved states.
8. Verify received bytes against the sender's digest, then offer a save/export action. Do not claim completion until verification and the chosen save path succeed.

## Transfer protocol and reliability

Separate control messages from binary chunks using a versioned protocol with strict validation. Give every session, transfer, and file an ID. Bound manifest entries, message lengths, sizes, offsets, and session timeouts. Reject unknown protocol versions and invalid state transitions.

Start with 32 KiB payload chunks, reduced if required by the negotiated channel message limit. Keep only a bounded amount queued, initially 1 MiB, and wait for bufferedAmountLow before replenishing. These are initial tuning values, not throughput promises.

Use receiver acknowledgments to record confirmed offsets. Do not acknowledge a chunk before its receiving storage operation succeeds. Sequential file transfers are the default to keep memory predictable. Compute incremental SHA-256 in a worker using a reviewed, locally bundled implementation so hashing does not require loading the entire file at once.

Completion is idempotent: repeating a completion request returns its existing result rather than duplicating output. On a lost response, request transfer status. Cancellation releases partial storage and rejects further chunks for that transfer.

If a connection drops, allow re-pairing and resume only while both app pages retain the transfer state and selected source files. Verify the stored prefix and source identity before resuming. Do not advertise recovery after reload, app termination, or source-file loss in this release. If recovery fails, explain that a restart is required rather than silently skipping bytes.

Borrow manifest, offset, integrity, admission, conflict, and completion principles from the File Transfer project. Reimplement them for browser transport and browser storage. Native Windows atomic publication and disk-reserve logic are not portable browser behavior.

## Saving and resource limits

Choose the receiver's storage route before accepting bytes. Use a user-approved streaming save destination when supported; otherwise stage in browser private storage and provide an explicit export. Detect storage support, quota, and permission errors and fail before transfer where possible.

For a basic download fallback that must assemble a Blob, initially limit each file to 64 MiB and process one file at a time. This is a proposed safety limit requiring review, not a claim that all browsers safely handle that size. Stream-capable receivers may accept larger files subject to storage checks; do not declare a tested maximum until measured. Display the applicable limit before sending.

Keep both or skip are default conflict choices. Never overwrite a user file automatically. Private browser staging is not the user's Downloads folder and must not be described as a completed export.

## Lightweight implementation boundaries

Keep the existing plain HTML/CSS/JavaScript PWA. No framework migration, backend, account system, WebRTC abstraction framework, or installed companion service is needed for this subsystem. Use focused modules for pairing, protocol, sender/receiver state, storage, hashing, and UI.

Bundle only the QR encoder/decoder and incremental hashing support required for this flow, with licenses documented. Use browser QR detection when available, with a bundled decoder fallback. Audit dependency sizes and choose small implementations; report actual added compressed asset size after implementation rather than inventing a size budget result.

No AI models are downloaded by the Transfer page. Model preparation belongs to the separate AI subsystem. Keep camera scanning active only during pairing, stop streams on exit, and release file buffers and object URLs after use.

## Security and platform constraints

WebRTC encrypts the transport, but users must still confirm the paired device and incoming files. Treat filenames and paths as untrusted: reject traversal, absolute paths, control characters, and invalid manifest combinations; render names as text. Never execute or render transferred active content automatically.

Browsers may require the app to stay in the foreground, particularly on mobile. Report interruption instead of promising background transfers. File picking, directory picking, saving, private storage, camera access, and browser lifecycle differ across Windows, Android, macOS, and iOS. Capability checks must explain missing capabilities rather than assuming an operating-system label guarantees support.

Initial physical demo targets are Windows Chrome/Edge and an actual compatible Android Chrome device. macOS/iOS require separate testing before verified support is claimed. An unsupported AI capability does not by itself disable a functioning transfer capability.

## Verification and acceptance

- Preserve existing PWA installation and offline-cache checks, adding every new transfer asset to cache coverage.
- Test invalid messages and paths, consent before bytes, bounded queues, offset handling, integrity failures, cancellation cleanup, repeated completion, and status recovery.
- Verify the actual QR offer/reply exchange between devices with internet disconnected and local Wi-Fi active. Test multi-frame pairing and the fallback. Same-browser tabs alone are insufficient evidence.
- Send files in both directions between Windows and Android, confirm byte-identical saved outputs, and exercise the actual mobile save path.
- Interrupt a transfer, re-pair while pages remain open, and verify resume or an explicit safe restart. Reject mismatched source data.
- Measure end-to-end throughput through verified saving, memory use, and storage failures. Report device/browser/network details with results. No 5 to 20 MB/s guarantee is made.
- Check disconnected/isolated networks, unsupported APIs, rejected permissions, mobile background interruption, insufficient storage, and receiver cancellation.

## Sources

- Local File Transfer README and linked verification documents: C:/Users/Linkerist/Documents/Devving/File Transfer/README.md
- WebRTC signaling: https://webrtc.org/getting-started/peer-connections
- Local peer configuration: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection
- Buffering and message limits: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
- Data channel protocol: https://www.rfc-editor.org/rfc/rfc8831

## Review outcome

Self-review: scope is the transfer subsystem only; installation prerequisites, two-way pairing, consent, resource bounds, saving semantics, resume limits, and physical verification requirements are explicit. Product code has not been changed by this design.
