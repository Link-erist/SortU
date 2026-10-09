# Organizer Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already chose native implementation in this session followed by one independent whole-change review; retain that method.

**Goal:** Make file organization the primary PWA workflow, with safe proposals, renaming, exclusions, and approved exports that preserve source bytes.

**Architecture:** Inventory selected File references without reading their contents; apply explicit deterministic rules to build a validated before/after proposal. Bind approval to an immutable revision, then copy only approved included files through a ZIP worker or a new user-selected output subfolder. Keep Transfer mounted as a secondary workspace and share export resource limits.

**Tech Stack:** Existing plain HTML/CSS/JavaScript PWA, Node test runner, native file APIs, existing SHA-256 worker and download budget, locally bundled fflate 0.8.3 streaming ZIP subset. Confirm the pinned package at acquisition time; no runtime CDN or cloud API.

**Spec:** `docs/superpowers/specs/2026-10-09-organizer-core-design.md`, approved by the user.

## Global Constraints

- Organize is the default workspace; Transfer is secondary. Switching workspaces retains both sessions and never silently cancels a transfer.
- This milestone is rules-based, not local AI. Retain the provisional title AppBuildersHackathon and label actual evidence honestly.
- Only explicitly selected files are accessible. Originals are never renamed, moved, rewritten, or deleted. Exclusions are applied before any file content reads.
- Inventory limit: 100 files. Guide limit: 32 KiB UTF-8; typed instructions: 8 KiB. No File bytes in localStorage or persistent application state.
- Guide directives: Group by, Naming, Exclude. Unknown/conflicting instructions must be resolved or explicitly replaced with automatic rules.
- Automatic categories: Documents, Images, Audio, Video, Archives, Code, Other. Naming tokens: {stem}, {category}, {index}, {date}. Preserve original extensions, including documented compound extensions.
- Target segments: at most 120 characters; relative paths: at most 240 characters. Reject traversal, unsafe separators, Windows reserved names, trailing dots/spaces, and control characters. Compare collisions using Unicode NFC plus case-insensitive keys.
- Selection, rules, exclusions, guide changes, and target edits invalidate approval. No export before approval of the current exact proposal.
- ZIP download ceiling: 64 MiB final archive, including headers/report. Source reads: 32 KiB; at most one worker input chunk outstanding. Folder exports stream sequentially to a fresh session subfolder.
- Reuse the same page-wide 64 MiB download-URL budget as Transfer. Serialize heavy export construction; do not describe the budget as total browser RAM.
- Include the reserved organization-report.json path, with before/after paths, active rules, exclusions, and byte checksums, without source or guide content.
- Cache all new assets before claiming offline readiness. Keep existing PWA and transfer checks passing. Physical Windows/Android acceptance remains distinct from automated browser checks.
- Preserve unrelated `docs/research/` and `outputs/` files. Work locally; publication remains a separate explicit decision.

## Review Focus

1. Source filenames that differ only by Unicode or case, or target file/directory prefixes, must not overwrite or make export fail unexpectedly (Task 2).
2. A guide with unsupported text mixed among valid directives must not be silently marked applied; exclusions must never cause a content read (Tasks 1 and 2).
3. Edits or resets during an export must not mutate the approved snapshot or produce a stale result; cancellation must stop further writes (Tasks 2, 4, and 5).
4. ZIP headers, Unicode names, the reserved report path, and active Transfer downloads must not bypass archive or aggregate resource limits (Tasks 3 and 4).
5. User-selected destinations that already contain similarly named folders, or permissions that fail midway, must retain originals and unrelated output while reporting partial copies (Task 4).

## File Map and Shared Types

- `public/organizer/inventory.js`: metadata-only inventory, extension classification, manual/wildcard exclusions.
- `public/organizer/rules.js`: guide parser, controls, supported naming/grouping configuration.
- `public/organizer/planner.js`: deterministic proposed folders/names, reasons, suffix collisions.
- `public/organizer/proposal.js`: path validation, canonical revisions, immutable approval snapshots.
- `public/organizer/archive.js`, `archive-worker.js`: streamed ZIP and incremental checksums with bounded input/output.
- `public/organizer/export.js`: approved-source resolution, ZIP download/folder export, cancellation and truthful results.
- `public/organizer/ui.js`, `public/workspaces.js`: organizer workflow and persistent secondary Transfer navigation.
- Modify `public/index.html`, `styles.css`, `app.js`, `sw.js`, `transfer-entry.js`, and `transfer/resources.js` only as needed for integration and resource sharing.
- `public/vendor/zip.js`, license/manifest updates, and `scripts/vendor-organizer.mjs`: pinned browser-ready ZIP subset.
- `tests/organizer-*.test.mjs`, existing transfer/PWA tests: meaningful regression coverage.
- `scripts/check-organizer-browser.mjs`, `docs/verification.md`, `README.md`: browser evidence and honest limits.

JSDoc types:

- `Inventory = {id: string, entries: InventoryEntry[]}`. Entry: `{id, file: File, sequence, name, sourcePath, size, type, lastModified, category, extension, stem}`.
- `Rules = {groupBy: 'type'|'year'|'folders', naming: 'normalize'|'preserve'|'template', template: string, patterns: string[], timeZone: string}`.
- `GuideResult = {rules: Partial<Rules>, unsupported: string[], errors: string[], source: 'typed'|'readme'}`.
- `Proposal = {revision: string, inventoryId: string, rows: ProposalRow[], rules: Rules, warnings: string[]}`. Row: `{fileId, sourcePath, targetPath, included, operation, reason}`.
- `ApprovedExport` is an opaque session-issued capability, not a caller-constructed JSON object. Its resolved snapshot contains frozen copies of included rows/rules and the selected File references.
- Export result: `{state: 'download-requested'|'saved'|'partial'|'canceled', outputName?, completedPaths: string[], checksums: Record<string,string>, error?}`.

## Task 1: Metadata Inventory and Explicit Rules

**Files:** Create `inventory.js`, `rules.js`, `tests/organizer-inventory.test.mjs`, `tests/organizer-rules.test.mjs`.

**Interfaces:** `createInventory(files, {idFactory?}) -> Inventory`; `splitName(name) -> {stem,extension}`; `classify(entry) -> {category,reason}`; `resolveIncluded(inventory, {excludedIds,patterns}) -> {included,excluded}`. `parseGuide(text, {source}) -> GuideResult`; `resolveRules({guides,controls,automatic}) -> {rules,errors,warnings}`.

- [ ] Write tests for empty and 101-file selections, repeated basenames, .env dotfiles, .tar.gz/.TAR.GZ, unknown extensions, zero-byte files, and stable source order. Use selected File objects whose `slice`, `stream`, `arrayBuffer`, and `text` throw if called; inventory/exclusion operations must still succeed without reads.
- [ ] Write guide tests asserting exact parsed type/year/folders grouping and naming templates, UTF-8 byte ceilings, conflicting repeated directives, unsupported prose mixed with valid directives, unknown tokens, explicit automatic fallback, and visible manual overrides. Bound patterns to 20 entries of at most 256 characters; `*` and `?` only, no regex evaluation. Case-insensitive pattern matching uses normalized source paths and basenames.
- [ ] Run `node --test tests/organizer-inventory.test.mjs tests/organizer-rules.test.mjs`; confirm expected failures before writing implementations.
- [ ] Implement metadata-only selection, longest compound-extension matching, explicit category maps, and a bounded wildcard matcher. Limit source relative paths to 1,024 characters to bound inventory/report metadata; show oversized-source-path errors before planning. File content is not needed for any operation in this task.
- [ ] Implement the documented directives, defaults, and unresolved-instruction blocking. `{date}` uses browser last-modified in the captured local time zone; zero is a valid epoch value, not a missing date. Unknown/invalid values produce Unknown-date with a warning, never an invented creation date.
- [ ] Run task tests and `npm test`; expect all pass. Commit only this task's verified files locally.

## Task 2: Valid Proposals and Revision-Bound Approval

**Files:** Create `planner.js`, `proposal.js`, `tests/organizer-planner.test.mjs`, `tests/organizer-proposal.test.mjs`.

**Interfaces:** `buildProposal(inventory, rules, exclusions) -> Proposal`; `validateTarget(path) -> string`; `validateProposal(proposal, inventory) -> void`; `createOrganizerSession() -> Session`. Session exposes `setInputs({inventory,rules,exclusions,guideResolved})`, `generate()`, `editTarget(fileId,path)`, `approve() -> ApprovedExport`, `resolveApproval(permit) -> ApprovedSnapshot`, and `reset()`.

- [ ] Write tests with literal expected paths: `Annual Report.PDF` becomes `Documents/annual-report.PDF`; already-consistent stems remain meaningful; preserve naming keeps original names; stable indices use 001, 002 in selection order; unknown files use Other; year grouping uses valid last-modified data. Excluded rows never receive executable export assignments.
- [ ] Test Windows device names, absolute/drive/traversal paths, control characters, trailing dots/spaces, length limits, Unicode/case collisions, and file/directory prefix conflicts. Reserve organization-report.json and any conflicting prefix; default keep-both suffixes must be stable and shown in the proposal before approval.
- [ ] Test that every input/target change invalidates earlier approval; unresolved guides cannot approve; fake serialized permits, foreign inventory IDs, unknown file IDs, altered approved rows, and all-excluded exports are rejected. Approval contains frozen row/rule copies and the exact selected File references, not a live mutable proposal.
- [ ] Run `node --test tests/organizer-planner.test.mjs tests/organizer-proposal.test.mjs`; confirm failure.
- [ ] Implement proposal construction and path validation. Sanitization belongs to automatic planning with a visible reason; manual edits are validated and reported, never silently repaired after approval. Use canonical row/rule serialization plus input revision to bind approval; keep issued permits in a private registry so fabricated JSON cannot authorize export.
- [ ] Run task tests and `npm test`; expect all pass. Commit scoped verified changes.

## Task 3: Shared Export Resources and Streaming ZIP Worker

**Files:** Create `archive.js`, `archive-worker.js`, `scripts/vendor-organizer.mjs`, bundled ZIP subset/notices, `tests/organizer-archive.test.mjs`; modify `transfer/resources.js`, `transfer/storage.js`, and resource tests for page-wide serialization.

**Interfaces:** `createArchive({maxBytes,onChunk,workerFactory?}) -> {addEntry({path,size,date}), write(bytes), endEntry(), finish(), cancel()}`; each method returns a Promise acknowledging that operation. `estimateArchiveBytes(entries, reportBytes) -> number`. Extend resources with `acquireExportLock(owner,signal?) -> Promise<releaseFunction>`; preserve existing `downloadBudget.reserve(bytes,signal)` lease behavior.

- [ ] Write archive tests using independent ZIP extraction and Node SHA-256: Unicode paths, binary and empty entries, original compound extensions, entry order, CRC/integrity, truncated/error/cancel cases, and archive size ceiling including the report. Excluded fixtures throw on content access and must never be passed to the worker.
- [ ] Write resource tests asserting Organizer and Transfer share the same download credits and heavy-export lock, waits are cancelable, lock ownership releases on failure, and session teardown in one workspace does not revoke another workspace's active downloads.
- [ ] Run `node --test tests/organizer-archive.test.mjs tests/transfer-resources.test.mjs`; confirm relevant failures.
- [ ] Bundle only fflate Zip/ZipPassThrough support and use the existing SHA-256 subset inside the worker. Pin upstream package/integrity/license. Do not install a framework or runtime model. Worker messages are versioned and bounded, with at most one 32 KiB input chunk outstanding; progress/cancel must stay responsive.
- [ ] Estimate stored ZIP output conservatively from source sizes, UTF-8 target names, per-entry local/central headers/descriptors, and report bytes; test estimates against real Unicode archives. Prebuild the report shape with a fixed 64-character checksum placeholder for every included file so later digest insertion cannot increase the reserved size. Enforce 64 MiB actual output while streaming regardless of the estimate. Bound the report to 512 KiB UTF-8 and reject a report/selection that exceeds the budget before writing.
- [ ] Acquire the heavy-export lock before constructing or materializing whole export buffers. Reserve shared download credits for the conservative ZIP bound before accumulating output and retain the lease through the download URL lifetime. Folder export holds the construction lock but does not allocate a whole-archive lease. Transfer export uses the same lock before existing Blob materialization. Add per-owner release so ending a transfer does not invalidate organizer downloads; full page teardown may release all owners. Define `downloadBudget.reserve(bytes,signal,owner)` and `downloadBudget.releaseOwner(owner)` while keeping callers that omit owner compatible; use a stable owner ID per workspace session.
- [ ] Run task tests and `npm test`; expect all pass. Record actual vendor payload size and hashes, then commit scoped verified changes.

## Task 4: Approved Copy Export and Byte Verification

**Files:** Create `export.js`, `tests/organizer-export.test.mjs`.

**Interfaces:** `exportApproved(session, permit, {mode:'zip'|'folder', parentHandle?, signal?, onProgress?, adapters?}) -> Promise<ExportResult>`; `buildReport(snapshot,checksums) -> Uint8Array`. Adapters are real I/O boundaries for ZIP worker, folder operations, and browser download handling; keep test-only behavior out of production modules.

- [ ] Write tests for no approval/stale/fabricated permits, excluded sources that throw on reads, exact approved paths and checksums, zero-byte files, reserved report contents, and no reads/writes outside selected File objects and the new output subfolder.
- [ ] Test unique subfolder collisions and file/directory conflicts before writes. Inject permission revocation, source-read failure, disk/quota/write failure, and cancellation mid-copy; assert no original/unrelated deletion, accurate completed paths, and partial results naming the created subfolder. Independently read written copies and compare their hashes.
- [ ] Run `node --test tests/organizer-export.test.mjs`; confirm failure.
- [ ] Resolve the permit once into an immutable snapshot, then read/copy included files sequentially in 32 KiB chunks. Hash bytes while copying. Folder mode creates `Organized-<local-date>-<random-session-id>` only after confirming the candidate subfolder does not exist. Retry name collisions; never merge into existing output. Close and independently re-read/hash each written file before reporting saved.
- [ ] ZIP mode hashes included payloads, appends the bounded report with those checksums, and finishes through Task 3's worker. Download result is `download-requested`; never claim the browser saved it. Retain a per-owner URL lease for at most 60 seconds and describe any wait for budget clearly. Failure/cancel releases the lock, worker, and reservations; retain/report user-visible partial output rather than recursively deleting folders.
- [ ] Run task tests and `npm test`; expect all pass. Commit scoped verified changes.

## Task 5: Organizer-First Interface and Offline Integration

**Files:** Create `ui.js`, `workspaces.js`, `tests/organizer-ui.test.mjs`; modify `index.html`, `styles.css`, `transfer-entry.js`, `sw.js`, and PWA fixtures. Keep install logic in `app.js` intact unless an integration defect needs a targeted fix.

**Interfaces:** `mountOrganizer(root,{sessionFactory?,exporter?}) -> cleanupFunction`; `mountWorkspaces({organizerRoot,transferRoot,organizerMount,transferMount}) -> cleanupFunction`. Mount each workspace once; switch visibility without resetting either workflow.

- [ ] Write UI tests asserting Organize is initial view; navigation preserves selection and active transfer; reset invalidates approval; missing folder-writing capability offers ZIP; guide and control overrides are visible; user-derived names/guide text render as text; proposal edits disable export until re-approved; all-excluded and unknown-guide cases block export honestly.
- [ ] Test cancel/reset/edit during an active export. Freeze the job snapshot and either block input changes while exporting or explicitly cancel first; a stale async callback must not claim success for a newer session. Completion wording distinguishes download-requested, verified folder saved, partial, canceled, and errors.
- [ ] Run `node --test tests/organizer-ui.test.mjs tests/pwa.test.mjs`; confirm relevant failures.
- [ ] Implement file/folder selection, include checkboxes, grouping/naming controls, typed directives/README, visible parsed rules, proposal before/after rows, editable target paths, reasons, folder-tree preview, counts, explicit approval, export choices, progress, and cancel/reset. Add a plain rules-based badge and a short supported-guide example. No AI confidence or content-understanding claim.
- [ ] Make Organize the landing view and Transfer a secondary tab; move shared install/offline status outside tab-specific content. Clean up resources only on explicit reset/end or page lifecycle. Folder picking and folder export controls are capability-driven; standard file selection and ZIP remain the portable routes.
- [ ] Cache all new modules/workers/vendor assets, increment the shell version consistently, and preserve older-worker readiness checks. Keep deployment static; add no backend or environment secrets.
- [ ] Run task tests and `npm test`; expect all pass. Inspect keyboard access and desktop/mobile layouts, guide errors, approval state, and nav persistence in the browser. Commit scoped verified changes.

## Task 6: End-to-End Organizer Evidence and Independent Review

**Files:** Create `scripts/check-organizer-browser.mjs`, update `docs/verification.md`, `README.md`, and this milestone's execution ledger.

- [ ] Create a browser check with a generated mixed fixture collection, duplicate names, Unicode names, dotfiles, an empty file, a supported guide, and excluded files. Select through the real picker input; generate/edit/approve a proposal; trigger the actual ZIP download. Independently extract the saved archive and compare file names, included/excluded membership, report data, and Node SHA-256 values.
- [ ] Prepare the app online, then reload with HTTP unavailable and repeat organization/ZIP export from cached assets. Test unknown/conflicting guides, stale approvals, browser download wording, navigation to an active transfer, and input cancellation. Do not use a mocked ZIP worker as end-to-end evidence.
- [ ] Exercise directory export using real browser file APIs where automation permits it; distinguish private-storage adapter checks from user-selected native output dialogs. Physical Windows and compatible Android checks cover real folder permissions, download behavior, measured memory, and the 64 MiB boundary. Mark unavailable device/dialog tests untested rather than passed.
- [ ] Run `npm test`, JavaScript syntax checks, and `git diff --check`. Run the existing transfer browser check when shared resources/navigation change. Measure added raw/gzip assets and record peak observed memory where a supported measurement tool permits it; asset size is not RAM usage.
- [ ] Dispatch one independent read-only whole-change reviewer through the approved execution workflow. Focus the five risks above, approval authority, excluded-file reads, byte preservation, output conflicts, and resource ownership. Reproduce material findings with failing tests, fix them, and rerun affected checks and the full suite.
- [ ] Record fresh evidence and unresolved physical gates. Retain the feature locally for the user's publication decision; do not describe the full AI file manager or hackathon local inference as implemented by this rules-based milestone.

## Self-Review and Handoff

All organizer spec sections map to the six tasks. Shared signatures and permit ownership agree across planner, UI, and exporter. Review risks have owning tests. ZIP size includes metadata, download resources are shared across workspaces, folder output is new rather than merged, and partial outputs are handled without destructive cleanup.

Implementation method is already selected: native execution in this session followed by one independent review. The only pending stage is user review of this written implementation plan. Product code and dependencies have not changed during planning.
