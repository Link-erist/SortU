# Local AI Organizer: proposed next milestone

Status: written design approved by the user on October 9, 2026. Implementation-plan review is pending. Product implementation, dependency installation, model downloads, and publication have not started.
Date: October 9, 2026.
Base: organizer branch `feat/organizer-core`, commit `ed0d5d2`.

## Goal and intended demo

Make file organization the meaningful local AI feature. A user selects mixed documents, excludes private files, and optionally provides instructions or a README. The app extracts bounded text from included supported files, runs a language model in the browser, and proposes useful folders and consistent names. The user reviews and approves before exporting byte-preserving copies.

The demo must work with network requests blocked after preparation, including a fresh app reload and model initialization. Existing rules-only organization and Transfer remain usable without downloading a model. No file content leaves the device.

The user's constraints remain browser-only, offline after preparation, midrange Windows as the first target, and capability restrictions on Android. All original features remain in the overall product scope. This milestone adds text/PDF content organization and natural-language guides. Image understanding, broader document formats, chatbot UI, and timestamped transcription follow as separate milestones.

## Approach and alternatives

Recommended: WebLLM with quantized Qwen 2.5 1.5B, executed in a dedicated worker. Reuse the existing organizer proposal validator and copy exporter. Use PDF.js for embedded PDF text and native decoding for bounded plain-text formats. Keep the existing static site and development bundling approach.

The current upstream model configuration lists `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`. Its listed memory estimate is 1,629.75 MB; the 3B variant is 2,504.76 MB. These are upstream estimates, not measured browser RAM or hardware guarantees. WebLLM requires WebGPU. Its runtime caches model assets, but cache presence alone does not prove offline inference. Sources: [model configuration](https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts), [runtime setup](https://webllm.mlc.ai/docs/user/get_started.html), [cache configuration](https://webllm.mlc.ai/docs/user/advanced_usage.html).

Alternative 1: a smaller classifier or embedding model through Transformers.js. This could lower requirements, but cannot replace general instruction interpretation and useful name generation by itself. Consider it later if the target-device evaluation rejects the recommended model. [Transformers.js capabilities](https://github.com/huggingface/transformers.js).

Alternative 2: Ollama with Qwen 3B or a larger model. This changes the browser-only constraint by requiring a local service. It is not the selected approach. A cloud model also fails the fully offline operation requirement.

Do not download both model profiles by default. Start by evaluating the 1.5B profile. A 3B option requires separate measured evidence before being added to the supported configuration.

## Device gate and preparation

The app checks secure context, WebGPU adapter availability, required model features and device limits, then offers an explicit model-preparation action. Browser or OS names alone do not establish compatibility. Do not infer available GPU memory from system RAM or `navigator.deviceMemory`.

Preparation displays model identity, download progress, actual downloaded bytes, storage errors, and cancel. Pin the runtime, model revision, tokenizer/config files, and matching model-library artifact in an audited manifest during implementation planning. Bundle application/runtime scripts locally. Model weights may be obtained from a fixed upstream location during preparation, with no selected-file data in requests. No arbitrary URLs from guides or model output may be fetched.

Keep model caches separate from the versioned app-shell cache so a shell update does not delete prepared weights. Request persistent storage where available and report the browser's decision honestly. A setup marker is informational; the authoritative readiness check is successful initialization and generation using prepared assets with network access unavailable. Missing assets or eviction return the state to preparation-required.

Supported AI device means the model successfully loads and completes the bounded inference check. GPU allocation failure or device loss stops the job, releases model resources, and leaves rules mode available with an explicit AI-unavailable message. No automatic cloud fallback. Android support is limited to devices that pass these checks and later physical testing. Rules-mode availability is not represented as successful local AI support.

## Content extraction and exclusions

Explicitly choose AI-assisted organization before any source content is read. Resolve manual and deterministic wildcard exclusions first. Excluded files never enter extraction, prompts, AI analysis, or export. Arbitrary natural-language instructions cannot widen access beyond selected files.

Initial inputs: UTF-8 `.txt`, `.md`, `.csv`, `.json`, and `.log`, plus PDFs with embedded text. Plain-text input reads at most 64 KiB per file and records truncation; binary/invalid text is reported instead of treated as meaningful content. PDFs are limited to 10 MiB, the first 20 pages, and 32,000 extracted characters. Use a PDF worker with bounded concurrency, cancellation, and a watchdog. Do not render pages for OCR in this milestone.

PDF.js is a separate parser: the language model receives extracted text, not arbitrary PDF bytes. Encrypted, damaged, scanned, or image-only PDFs show explicit unavailable/no-text outcomes. Unsupported formats retain a visible metadata-based proposal. PDF runtime and required parsing assets must be bundled for offline use. PDF document scripts, links, and attachments are not executed or fetched. [PDF.js examples](https://mozilla.github.io/pdf.js/examples/).

Process one file at a time. Hold extracted snippets only in session memory, clear them on reset/cancel/reload, and exclude them from reports, logs, localStorage, and persistent databases. Existing selected File references remain the export sources; never write extracted or generated text back into originals.

## Inference and guide interpretation

Instructions are optional. With no guide, the model proposes a subject category and a descriptive filename stem using the bounded excerpt and metadata. With a guide, interpret organizational preferences and naming intent first, show the interpretation, and use it consistently for included files.

Existing explicit directives and manually changed controls retain deterministic precedence. Manual exclusions and pattern exclusions are authoritative. If a free-form guide requests ambiguous exclusion, present an interpretation for user confirmation before reading file contents. Unsupported actions, such as deleting files, changing contents, running scripts, or accessing other folders, block application and receive a visible explanation. Choosing rules mode remains an explicit option.

File content is untrusted evidence, never instructions for the application. Separate system constraints, user guidance, and document text in prompts. Model output is bounded structured data containing only a selected file ID, suggested category, suggested filename stem, short explanation, and whether the evidence was sufficient. It contains no commands, URLs to retrieve, or executable operations.

Use a 4,096-token context ceiling for the initial profile, reserve output tokens, and enforce the actual prompt budget before inference. Truncate content excerpts visibly to fit. If the full user guide and mandatory constraints cannot fit, stop and request a shorter guide; never silently discard part of the guide. Keep prompts and responses bounded, and process files sequentially. No conversation history grows implicitly across file analysis. The model may abstain when evidence is missing or weak.

## Proposal authority and validation

Add a controlled session method for accepting AI suggestions. Do not expose approval creation to a worker or accept a raw model-generated proposal as an export capability.

The main application validates suggestion schema, IDs, lengths, row membership, and allowed fields. It constructs target paths itself, preserves original extensions, handles collisions deterministically, and applies existing Windows-safe path and report-reservation rules. Then validate the complete proposal against the current inventory before showing it.

Bind extraction, guidance, exclusions, model identity, and accepted suggestions to a session revision. Any file, setting, guide, exclusion, or target change invalidates the job and prior approval. Late worker messages cannot replace a newer proposal. Manual edits continue to require fresh approval. Model suggestions never cause automatic export.

Show evidence labels: AI based on extracted text, AI based on a truncated excerpt, metadata-only fallback, and excluded. Do not invent confidence percentages or present generated reasoning as verified facts. Export reports may contain bounded model identity and proposal reasons, but no document excerpts or raw guide text.

## Organizer interface

Keep Organize as the landing workspace. Add Rules / Local AI modes, model preparation status, an Analyze and propose action, cancellation, and per-file evidence/error status. Retain the same review, edit, approval, ZIP and folder-export sequence. Warn before expensive preparation; do not start large model downloads on page load.

During analysis, lock the relevant settings or explicitly cancel before changing them. Switching to Transfer preserves both workspaces. Serialize model preparation/inference with heavy export construction to avoid overlapping major allocations. Release/unload the inference engine before large ZIP construction where runtime memory cannot be held safely. Clear user content separately from reusable model assets.

Update the existing inventory wording: AI mode reads included supported files for analysis; rules mode remains metadata-only until export. Distinguish app-shell readiness from AI-model readiness.

## Acceptance and honest limits

1. Real browser inference, not mocked output: unrelated documents with opaque filenames receive content-dependent proposals, while a control set with swapped contents produces appropriate changed suggestions.
2. Prepare online, block network requests, reload, initialize the model, analyze text and PDF fixtures, approve, and export. Independently verify unchanged exported bytes.
3. Excluded sources throw on all read methods in tests. No excluded content appears in extraction or prompts. Prompt-injection fixtures cannot authorize expanded access or writes.
4. Invalid/unknown model IDs, unexpected fields, bad JSON, unsafe paths, extension changes, missing/repeated rows, oversized responses, stale results, cancellation, GPU loss, and missing cached assets fail safely with clear status.
5. Evaluate at least 12 document fixtures including ambiguous text and a scanned PDF. Record expected versus observed subject categories and naming usefulness. Successful model loading alone does not establish useful organization.
6. Measure download size, initialization time, per-file inference time, and memory where a supported tool exists. Mark unmeasured metrics unverified. Demonstrate on the actual midrange Windows demo machine before claiming readiness. Physical Android remains a separate gate.
7. Rerun the current 55-test baseline, organizer export/browser checks, Transfer regression, offline cache coherence, syntax checks, and independent code review after implementation.

No new product dependencies or model assets were installed for this design. No AI performance or compatibility benchmark has been run. The user approved this written design; the next gate is review of the implementation plan.
