# Local AI Organizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the selected native execution method with one independent whole-branch reviewer.

**Goal:** Generate content-dependent file organization proposals locally in the browser, then reuse explicit approval and byte-preserving copy exports.

**Architecture:** A dedicated WebLLM worker performs bounded guide interpretation and sequential file inference. Independent extraction and suggestion validators feed the existing organizer session; the model never owns approval or file writes. Model preparation uses pinned artifacts and reusable runtime caches, with offline readiness proven by cold worker initialization and generation when network transport is forbidden.

**Tech Stack:** Existing static HTML/JavaScript PWA; Node >=22.13.0; esbuild 0.25.12; @mlc-ai/web-llm 0.2.85; @huggingface/tokenizers 0.2.0; pdfjs-dist 6.4.299; Qwen2.5-1.5B-Instruct-q4f16_1-MLC. No framework migration, inference backend, cloud fallback, or API keys.

**Spec:** `docs/superpowers/specs/2026-10-09-local-ai-organizer-design.md`, approved by the user. Immutable artifact metadata: `docs/superpowers/plans/2026-10-09-local-ai-organizer-artifacts.json`.

## Global Constraints

- Base: `11d0bba` on `feat/organizer-core`; baseline 55 tests. Create a local `feat/local-ai-organizer` branch at execution time. Preserve unrelated `docs/research/` and `outputs/` files.
- Browser-only, offline after preparation, Windows first. Android AI requires capability/load checks and separate physical acceptance. Rules mode remains available when AI is unavailable.
- Keep 100-file selection, opaque revision-bound approval, Windows-safe paths, unchanged source extensions, original-byte exports, report reservation and existing 64 MiB ZIP/shared download bounds.
- No source content reads in Rules mode before export. Local AI mode reads only included selected sources. Resolve exclusions before extraction. File text cannot authorize actions.
- UTF-8 text: `.txt`, `.md`, `.csv`, `.json`, `.log`; 64 KiB source-read ceiling. PDFs: <=10 MiB, first 20 pages, <=32,000 extracted characters, one parser job at a time. No OCR, image analysis, DOCX, chatbot UI, or transcription in this milestone.
- Guides retain 8 KiB typed/32 KiB README bounds. Never silently truncate a guide to fit inference. Preserve explicit directive/manual-control precedence and explicit automatic-ignore behavior.
- Model context override 4,096 tokens. Reserve 512 generated tokens and 128 safety tokens; complete serialized prompt <=3,456 tokens. Temperature 0; one file request at a time. Per-file inference watchdog 120 seconds, PDF watchdog 30 seconds; preparation has cancel and 90-second no-progress timeout.
- Raw output <=8 KiB UTF-8; category 1..60 characters, suggested stem 1..100, reason <=300. No commands, arbitrary URLs or tools. Invalid output cannot become approval.
- Clear content snippets and guides from worker state at job completion/cancel/reset. Do not persist them or write them to logs/reports. Reusable model assets are separate from the app-shell release cache.
- All expensive model preparation/inference uses the existing page-wide export lock. Unload and terminate the inference worker before releasing the lock and before ZIP construction. Cancel does not revoke another workspace's downloads.
- Actual artifacts: model revision `9bd564b064631febf14deadcac492efb761d60c3`; library revision `025bcaf3780fa8254f5e5efd3bfea0a5397248f4`, path `web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm`. Runtime 0.2.85 uses this library generation. Pin these URLs, not `main`.
- Metadata lists 36 required model files totaling 880,161,741 bytes, including 30 weight shards totaling 868,547,584 bytes; library 5,225,782 bytes. Download size is not RAM usage. Do not download the model during planning or automatically on app startup.

## Review Focus

1. Exclusion interpretation can leak content if extraction starts before confirmation. Task 4 must prove zero file reads while guide exclusions are unresolved.
2. A stale worker can replace an edited proposal after cancellation. Task 4 must reject messages from old request IDs and session revisions.
3. The app can falsely claim offline AI from partial caches or a setup marker. Task 1 and Task 6 must test fresh worker initialization and generation with all network requests denied, including missing/corrupted artifacts.
4. Token budget estimates can discard guide requirements or miscount multilingual input. Task 3 must compare the pinned tokenizer/template against runtime token usage and never truncate guide text.
5. Parser/model failure or Transfer cleanup can leave locks, workers, snippets or download URLs alive. Tasks 2, 4 and 5 must test timeout, GPU loss, queued cancellation and owner-specific cleanup.

## File Responsibilities and Contracts

- `public/ai/model.json`: deployable audited model/runtime configuration generated from planning metadata; source URLs, sizes, revision, hashes and required capabilities. Weight bytes stay outside Git.
- `public/ai/capabilities.js`: secure-context/WebGPU/feature/limit checks; allocation and warmup remain the final capability gate.
- `public/ai/transport.js`: pinned GET allowlist, progress/byte/hash accounting, runtime cache checks, network-forbidden offline mode. No guide/file data in requests.
- `public/ai/runtime.js` and `runtime-worker.js`: `createLocalRuntime({signal,onProgress,workerFactory?}) -> {prepare(),verifyOffline(),generate(request),unload(),dispose()}`. Worker requests `{v:1,id,revision,type,payload}`; replies echo ID/revision. One outstanding inference request.
- `public/ai/extract.js`, `pdf.js`: `extractContent(entry,{signal,onProgress,pdfFactory?}) -> {fileId,text,status,truncated,evidence}`; statuses `text|no-text|unsupported|error`. Text never accompanies excluded rows.
- `public/ai/prompts.js`, `schema.js`: bounded prompt construction/tokenization and strict guide/suggestion validation.
- `public/ai/organize.js`: `createAiOrganizer({runtimeFactory,extractor}) -> {analyze(inputs,{signal,onProgress,onGuideReview}),dispose()}`; consumes inventory/rules/exclusions/guidance/revision and returns validated suggestions plus non-content evidence.
- `public/organizer/proposal.js`: add `beginAnalysis(context) -> ticket` and `acceptAnalysis(ticket,{suggestions,evidence,model}) -> Proposal`; privately bind ticket to session inputs/version. Preserve existing `approve()` and `resolveApproval()` authority.
- `public/ai/ui.js`: model/mode/guidance status and job controls; `mountAiControls(root,callbacks) -> {getMode(),analyze(inputs),cancel(),dispose()}`. Existing organizer UI owns inventory/proposals/approval/export.
- `scripts/vendor-ai.mjs`: reproducible local runtime/tokenizer/PDF workers, necessary fonts/CMaps/WASM assets, licenses and asset hashes. No runtime CDN imports.
- Tests in `tests/ai-*.test.mjs`; real model/browser acceptance in `scripts/check-ai-organizer-browser.mjs`; user evidence in `docs/verification.md`; ledger in `docs/local-ai-progress.md`.

## Task 1: Pinned Runtime, Capability Gate and Honest Preparation

**Files:** Create model configuration, capabilities, transport, runtime client/worker, vendor script, `tests/ai-runtime.test.mjs`. Modify package manifests, Node engine floor, vendor manifest/license files. Do not yet change default UI behavior.

**Interfaces:** Runtime client contract above. `checkAiCapabilities(navigatorLike,{secureContext,model}) -> Promise<{supported,reason,features,limits}>`. `createModelTransport({manifest,offline,onProgress,signal}) -> {fetch,verifyCachedArtifacts,dispose}`.

- [ ] Write tests named `rejects unsupported adapters without downloading`, `only pinned artifacts can be fetched`, `cancel releases worker and outstanding requests`, `a setup marker cannot establish readiness`, and `missing or corrupted artifacts fail offline initialization`. Assert unknown models/URLs fail, selected text never appears in URLs, false ready states are impossible, stale replies are ignored, and cancel rejects all pending operations.
- [ ] Run `node --test tests/ai-runtime.test.mjs`; confirm failures arise from the missing feature.
- [ ] Pin the three new development dependencies exactly. Bundle worker/runtime and tokenizer locally using esbuild, copying all PDF support assets for Task 2. Store licenses and computed SHA-256 values in the vendor manifest. Pin public model URLs using the reviewed metadata, retain shard SHA-256/LFS values and immutable Git OIDs, and verify downloaded non-LFS bytes against their Git blob OIDs; compute SHA-256 for the deployable manifest after retrieval. No unbounded whole-weight hashing.
- [ ] Implement capability checks without guessing GPU memory. Require `shader-f16` for this q4f16 profile and enforce actual runtime model limits. Instantiate the runtime only after explicit preparation/load.
- [ ] Use the pinned runtime's `cacheBackend: 'cache'` and preserve its artifact/cache-key format. Inspect packaged cache APIs before wiring transport; validate all required config/tokenizer/shard/library keys rather than relying on `hasModelInCache` alone. Use incremental response-stream byte/hash accounting with backpressure. Failed/canceled preparation never writes a success marker; invalidate only this pinned model's incomplete/corrupt entries, never unrelated caches.
- [ ] Implement an offline transport that permits matching prepared cached responses and refuses network fallback. `verifyOffline()` creates a fresh worker, initializes this model and completes a bounded JSON warmup using that transport. Full app reload with blocked network is independently required in Task 6. Successful preparation and offline verification are distinct states.
- [ ] Run task tests and `npm test`. Record the shipped asset sizes and explicit preparation footprint, then commit only Task 1 files locally.

## Task 2: Bounded Selected-File Text and PDF Extraction

**Files:** Create extraction/PDF modules and `tests/ai-extract.test.mjs`; add known PDF/text fixtures under `tests/fixtures/ai/`.

**Interfaces:** Extraction result above. `extractIncluded(inventory,{excludedIds,patterns,signal,onProgress}) -> async iterator<ExtractionResult>` uses existing `resolveIncluded()` and yields one included source at a time.

- [ ] Write tests for a source whose full read methods throw but bounded `slice` succeeds, multibyte UTF-8 cut at the read ceiling, invalid UTF-8, NUL-heavy binary text, empty files, unsupported types, and excluded sources whose every read method throws. Assert at most 65,536 source bytes are read and exclusions yield no content result.
- [ ] Add PDF tests for text extraction, >10 MiB rejection before reads, first-20-page/32,000-character limits, encrypted/corrupt/image-only PDFs, parser timeout and cancel. Assert no document links/scripts/attachments are fetched or executed and no originals are written.
- [ ] Run `node --test tests/ai-extract.test.mjs`; confirm expected failures.
- [ ] Implement streaming UTF-8 decoding with explicit truncation status. Use PDF.js `getDocument({data,...})` plus `getTextContent()`, local worker/support URLs, `isEvalSupported:false`, no interactive rendering or script execution. Destroy loading/document tasks on completion/cancel/error, and terminate stalled worker jobs via the watchdog. A PDF at the 10 MiB limit can be read in full for parsing, but only one PDF buffer is retained.
- [ ] Run task tests, verify the parser offline with real PDF bytes, rerun the suite, and commit the extraction change.

## Task 3: Token-Bounded Guidance and Suggestion Contracts

**Files:** Create prompts/schema modules and `tests/ai-prompts.test.mjs`, `tests/ai-schema.test.mjs`.

**Interfaces:** `buildPrompt({kind,guide,entry,text,rules},tokenizer) -> {messages,promptTokens,truncated}`. `validateGuidance(raw) -> {summary,grouping,naming,exclusionPatterns,needsConfirmation,blockedReason}`. `validateSuggestion(raw,{fileId}) -> {fileId,category,stem,reason,sufficient}`.

- [ ] Write tests asserting malformed JSON, unexpected properties, repeated/unknown IDs, >8 KiB output, path separators/drive paths, extension replacement fields, executable fields, and >60/100/300-character values are rejected. Parsed objects are data only and are never merged into application configuration.
- [ ] Add exact token-budget tests for English, Filipino, Chinese, emoji, long guides and document injection. Assert mandatory constraints plus the complete guide fit before content is added, prompt <=3,456 tokens, output reserve 512, and overlong guides throw a shorten-guide error rather than being truncated.
- [ ] Run `node --test tests/ai-prompts.test.mjs tests/ai-schema.test.mjs`; confirm failures.
- [ ] Load the pinned Qwen tokenizer/config through the prepared cache. Render the pinned Qwen message template exactly and count tokens with @huggingface/tokenizers; verify token parity with runtime-reported prompt usage during Task 6. Truncate only the document excerpt, using token-aware bounded search. Treat a parity mismatch as a failed release gate, not a reason to weaken the budget.
- [ ] Use strict JSON schema response formatting where the pinned runtime supports it, still applying independent validators. Guide output cannot include content-modifying actions or access expansion. Prompt-injection handling is enforced by application authority boundaries; never claim that a system prompt guarantees model obedience.
- [ ] Run task tests and the suite; commit validated prompt/response contracts.

## Task 4: Content Analysis Into Revision-Bound Proposals

**Files:** Create organize coordinator, modify organizer proposal/planner helpers for AI suggestions, add `tests/ai-organize.test.mjs` and proposal regressions.

**Interfaces:** Coordinator and private session tickets above. `onGuideReview(interpretation) -> Promise<{confirmed:boolean,excludedIds:string[]}>` resolves before extraction when exclusion intent requires confirmation.

- [ ] Write tests named `unresolved guide exclusions cause zero reads`, `late worker results cannot replace a newer proposal`, `AI cannot include excluded or unknown IDs`, `manual rules override AI intent visibly`, `unsupported files retain metadata evidence`, and `worker failure leaves no approved export`. Include fabricated/stale tickets and cancellation while waiting for the shared export lock.
- [ ] Run `node --test tests/ai-organize.test.mjs tests/organizer-proposal.test.mjs`; confirm the new failures.
- [ ] Implement strict guide interpretation before extraction. Manual/pattern exclusions remain authoritative. Any natural-language exclusion interpretation is confirmed against the selected metadata list before file reads; requests that depend on reading potentially excluded contents block until the user makes an explicit selection.
- [ ] Acquire `acquireExportLock('organizer-ai',signal)` for model load/inference. Process one included source at a time, dispose each snippet after response validation, and unload/dispose runtime in `finally` before releasing the lock. Enforce watchdogs, request IDs and immutable revision tickets; cancellation never applies partial suggestions as a complete proposal.
- [ ] Construct category/stem paths in application code, append the original extension, sanitize automatic suggestions visibly, resolve case/NFC/file-directory collisions and reserve the report path using existing helpers. If evidence is insufficient, use a clearly labeled metadata-only row. Reject missing/repeated analyzed IDs. Validate the entire proposal before display. Do not expose permits to the worker.
- [ ] Bind model identity, evidence and guide interpretation digest to proposal revision. Reports may include these bounded fields but no content or raw guide. Ensure manual target edits still invalidate approval, and export still resolves only privately issued current permits.
- [ ] Run task tests and the suite, including original-byte exports; commit coordinator/session changes.

## Task 5: Organizer AI Controls and Offline Shell

**Files:** Create AI UI module and `tests/ai-ui.test.mjs`; modify organizer UI, HTML/styles, worker asset list, vendor/cache tests, verification documentation.

**Interfaces:** AI UI contract above, connected to the current organizer session. Existing workspace mounting is retained once per page.

- [ ] Write behavior tests for explicit preparation only, separate shell/model readiness, Rules mode no reads/downloads, ignored-guide fallback, >8 KiB multilingual instructions, locked settings while analyzing, cancel/reset, guide review before extraction, and unsupported GPU with working Rules exports. Exercise the actual DOM in the browser rather than duplicating implementation in a fake DOM.
- [ ] Run applicable unit/browser tests; confirm new controls are missing before implementation.
- [ ] Add Rules / Local AI mode selection, Prepare local AI (with ~885 MB model/library metadata estimate), actual progress, canceled/failed/unavailable states, interpreted-guide review, Analyze and propose, per-file evidence labels and cancellation. Do not expose runtime jargon in primary user actions.
- [ ] Update inventory wording per mode and preserve original review/edit/approve/export controls. Mode/guide/selection/manual-setting edits revoke approval. UI job generation numbers prevent stale callbacks from claiming completion. Both workspaces persist across navigation; transfer cleanup cannot terminate an organizer job or revoke its URLs.
- [ ] Advance paired shell version v4 to v5. Cache all local AI/PDF/runtime workers/support assets needed offline. Keep runtime model caches outside `appbuildershackathon-` shell eviction ownership, and do not cache user content. Model weights are prepared separately, not precached on initial page load.
- [ ] Run the suite plus organizer/Transfer browser regressions, inspect keyboard access and desktop/390px layouts, and commit UI/offline integration.

## Task 6: Real Inference, Offline Reload and Demo Acceptance

**Files:** Create real-model browser script and fixture generator, update verification/README and `docs/local-ai-progress.md`.

- [ ] Create at least 12 explicit synthetic document fixtures with expected subjects: invoices, meeting notes, school assignment, project specification, resume, travel booking, recipes, legal-looking sample text, CSV finances, UTF-8 multilingual note, ambiguous note and scanned/image-only PDF. Include opaque filenames and a swapped-content control set. Keep samples fictional; do not use private user documents.
- [ ] Run on Windows Edge with an actual hardware WebGPU adapter. First log capability limits and model identity, then prepare explicitly. Record actual transferred bytes, cold initialization, per-file inference and parser times. Report memory only where measurable; a viewport or software adapter is not target-device proof.
- [ ] Recreate the browser worker/page with cache retained, block all network requests, and cold-load/generate from the model. Analyze real text/PDF fixtures, confirm guidance/exclusions, edit/approve, download the ZIP, independently extract and compare every included payload with Node SHA-256. Check absence of excluded bytes from worker prompts via a test-only observation boundary, with no production content logging.
- [ ] Record expected/observed subject and filename usefulness per fixture. At least 9 of 10 clear-topic fixtures must receive a suitable subject category and useful safe stem; ambiguous/scanned fixtures must visibly abstain or use metadata evidence. Swapped contents must change the subject suggestion appropriately in at least two opaque-name pairs. Never relabel a poor run as success because generation technically completed.
- [ ] Test missing tokenizer/library/shard caches, corrupted cached bytes, blocked downloads, quota errors, PDF watchdog, GPU loss, queued and in-flight cancellation, excluded throwing sources, oversized/malicious guides, injection documents and stale replies. Verify resources release and Rules/Transfer remain usable afterward.
- [ ] Run `npm test`, JS syntax checks, `git diff --check`, vendor hash verification, `check-organizer-browser.mjs`, and `check-transfer-browser.mjs`. Run the real-model test separately and record its status; unit mocks are not inference evidence.
- [ ] Obtain the selected one independent read-only whole-branch reviewer. Reproduce/fix material findings and rerun affected checks plus the complete suite. Preserve local commits and separate publication from implementation.
- [ ] Record actual demo-machine readiness. If this environment lacks usable hardware or inference quality fails, leave that gate unresolved with diagnostics; do not substitute remote inference. Physical Android/native folder dialogs/LAN hardware remain separately recorded gates.

## Self-Review and Handoff

Coverage: preparation/device/offline assets -> Task 1; selected content/PDF -> Task 2; guide/token/data boundaries -> Task 3; exclusions/revisions/paths/approval -> Task 4; main organizer flow and cache coherence -> Task 5; actual useful inference and unchanged exports -> Task 6. The five Review Focus risks have explicit owning tests. Signatures agree across runtime, coordinator, UI and session tickets.

Execution method remains native implementation in this session, followed by one independent whole-branch review. The plan and artifact metadata are the only new files from planning. No dependencies were installed and no model assets were downloaded. User review of this plan is required before implementation.

Planning sources: [WebLLM 0.2.85 configuration](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts), [pinned model](https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/tree/9bd564b064631febf14deadcac492efb761d60c3), [tokenizer API](https://github.com/huggingface/tokenizers.js), [PDF.js](https://mozilla.github.io/pdf.js/).
