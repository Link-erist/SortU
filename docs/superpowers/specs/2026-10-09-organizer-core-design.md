# Organizer core design

Date: October 9, 2026. Status: concrete design for user review. Product code has not changed for this milestone.

## Purpose and priority

File organization is the core product. The user approved proceeding to the next milestone after transfer: design the organizer and build a safe proposal-and-export workflow before adding a large local model. Keep the provisional title AppBuildersHackathon until a system name is chosen.

The main journey is: select files, analyze available evidence, propose organization and renaming, review exclusions and changes, approve, then export organized copies. Transfer is a secondary workspace. Chatbot and timestamped transcription remain supporting features for later milestones. No original requested feature is removed from the overall project scope.

## Chosen approach

Add a deterministic organizer engine to the existing plain JavaScript PWA. Reuse validated path principles, incremental hashing, bounded export-resource handling, and service-worker caching from transfer where appropriate, without making organization depend on a peer connection.

Alternatives considered:

- Local AI first would immediately support broader instructions, but makes the first usable organizer depend on unverified device memory and inference performance.
- Directly moving and renaming originals would resemble a native file manager, but requires broader permissions and creates unnecessary destructive operations.
- Proposal-first organization with exported copies produces a usable, testable core and a safe execution boundary for later AI. This is the recommended approach.

This milestone is explicitly rules-based. It is not sufficient by itself to satisfy the hackathon's meaningful local AI requirement. Local model integration follows as a separate subsystem, using this proposal interface. Do not display fake AI labels, confidence percentages, or claims of semantic analysis.

## Interface and user flow

Default workspace: Organize. Secondary navigation: Transfer. Preserve installation controls and offline preparation status. Switching to Transfer does not clear the organizer selection; switching back does not silently cancel an active transfer. Release resources only through explicit reset/end or page lifecycle cleanup.

Desktop layout:

1. Files panel: Add files, optional Add folder where supported, a list with original relative path, type, size, and include/exclude checkbox. File picking is local selection, not uploading to a server.
2. Organization panel: Automatic defaults, optional grouping and naming controls, an instruction field, and an optional README guide input. Show the actual active rules before generating a proposal.
3. Proposal panel: original path, proposed path, operation, reason, and exclusion status. Include an output folder-tree preview and counts of organized, renamed, unchanged, and excluded files.
4. Review controls: edit target paths, resolve conflicts, regenerate, then Approve and export. Export is unavailable until a valid current proposal exists.

On mobile, use the same stages in a vertical layout. A table may become file cards, but before/after paths and reasons must remain visible. Do not make hover interactions necessary. Keep labels, keyboard access, focus handling, and accessible progress/error messages.

## Selection and resource boundaries

Retain File objects only for explicitly selected files. Folder picking imports only the folder the user selected and its browser-supplied relative paths. Do not scan device roots, follow arbitrary filesystem paths, or reopen previously selected files without an appropriate current handle or permission.

Initial inventory limit: 100 files. This is a proposed demo limit, not a tested maximum. Reject a selection that exceeds it before analysis. Keep file contents out of application state and localStorage. A reload loses the selection and approval; explain that users must reselect files. Do not promise persistent access.

Analyze sequentially or with a small bounded queue. Reuse a worker for hashing and ZIP work. No model downloads, OCR engines, PDF renderers, or media decoders are loaded by the organizer foundation. Report actual shipped size and memory observations after implementation.

## Automatic organization and renaming

With no instructions, propose type-based folders: Documents, Images, Audio, Video, Archives, Code, and Other. Use an explicit extension mapping, with MIME only as a supporting hint; unrecognized types go to Other. Never execute a file to determine its type. The proposal reason names the evidence, for example, "PDF extension; grouped under Documents."

Default renaming normalizes whitespace and separators to a consistent convention while retaining the meaningful original stem and original extension. It does not invent subjects, dates, or document meanings. Files already consistent may keep their names; explain unchanged rows. Preserve compound extensions such as .tar.gz through a documented mapping.

Controls allow grouping by type, last-modified year, or keeping the selected folder structure; naming may preserve the original name or use a template with {stem}, {category}, {index}, and {date}. The extension is appended automatically and is not changeable through these tokens. Index numbering is stable in original selection order, displayed with at least three digits. Date means the browser-reported last-modified date in the user's local time zone, never an inferred creation date; missing or invalid dates use Unknown-date and a warning.

Manual exclusion and optional filename/path wildcard exclusions run before proposal generation. Support only simple * and ? wildcards, with a bounded pattern length/count; do not accept arbitrary regular expressions. Excluded files are neither content-read for analysis nor exported. Show their exclusion reason. No organization instructions are required, but file selection and approval are still required.

## Instructions and README guides

Keep typed instructions and uploaded guide text as local inputs. This foundation can apply a small documented directive format, such as:

    Group by: type
    Naming: project_{stem}_{index}
    Exclude: *.tmp, private/*

Recognize Group by, Naming, and Exclude only in this milestone. Limit guide content to 32 KiB UTF-8 and typed instructions to 8 KiB. Accept .txt and .md guides; display them as plain text. A guide selected through the guide picker is configuration, not automatically an output file. The user can separately include it in the ordinary file selection if desired.

Show parsed directives and unsupported instructions. Do not silently claim to apply arbitrary natural language. If instructions cannot be applied, the user can revise the directives or explicitly choose automatic organization. An unresolved guide cannot be represented as successfully applied. Conflicting repeated directives are errors, not silent last-value wins. Manual controls changed after a guide are shown as explicit overrides in the rules summary.

Guide text and future file contents cannot authorize deleting originals, changing payloads, uploading to a service, or accessing unselected files. Later local AI may interpret richer instructions but must return the same validated proposal structure.

## Proposal contract and approval

Proposal input includes selected inventory IDs, source File references, active rules, guide interpretation status, and exclusions. Each proposed row has file ID, source relative path, target relative path, reason, included flag, and operation classification. The proposal is data, not executable code or shell commands.

Validate every target before review/export: relative paths only; no traversal, drive paths, control characters, unsafe separators, Windows reserved basenames, trailing dots/spaces, or malformed segments. Bound segment lengths to 120 characters and relative paths to 240 characters in this initial milestone; actual output APIs may still impose additional constraints and must report those errors.

Detect collisions using Unicode NFC plus case-insensitive comparisons to protect Windows output. Keep both is the default through stable numeric suffixes; users may instead exclude a row or edit its target. Never overwrite one included source with another, and never replace an existing destination automatically.

Any selection, rule, exclusion, guide, or target edit invalidates prior approval. Generate a fresh canonical proposal revision and validate it again. Approval applies only to that exact revision and File-object inventory. Do not export a stale proposal or silently modify an approved proposal to fix a conflict. A reviewed unchanged file can still be included in the organized copy.

## Exporting organized copies

Always export copies. This milestone does not rename or move originals in place.

- Portable route: ZIP containing the approved target paths and original file bytes. Use a locally bundled, pinned fflate streaming ZIP subset in a worker. Prefer stored entries initially to avoid unnecessary compression CPU and unpredictable output size.
- Desktop enhancement: where directory writing is supported, ask the user to choose an output parent and create a new unique session subfolder. Write only that new subfolder, never overwrite existing files, and stream copies sequentially. Missing or revoked permission stops the export with a partial-output report.

Use 32 KiB source reads and bounded worker queues. The in-memory/download ZIP route is limited to 64 MiB final archive size, including entry headers and report metadata. Estimate the uncompressed archive overhead before generation and reject oversized selections early; enforce the output ceiling during generation as well. This is a proposed safety ceiling, not evidence that every Android device can handle it. Larger batches require a supported streaming output route or splitting the selection; no universal large-file claim.

Share the page's aggregate download-URL budget with Transfer rather than creating an independent unbounded pool. Document that this budget does not equal total browser RAM. Do not permit simultaneous heavy organizer export and transfer export to bypass resource limits. Wait or show clear busy guidance instead of accumulating whole files.

Include a bounded organization-report.json describing approved rules, before/after paths, exclusions, and source-byte checksums. Reserve that report path so an incoming filename cannot overwrite it. Do not embed unnecessary source content or guide content in the report.

Hash source bytes while copying. Automated tests independently extract ZIP entries or read written copies and verify their hashes against the selected sources. For folder export, verify written bytes before reporting success where readable output handles permit it. Do not report a byte-preservation claim for outputs that failed verification. Source-read changes/errors stop the affected export rather than silently substituting different files.

Basic browser downloads are labeled Download requested, not Saved. A user-selected streaming output can be labeled Saved only after writes close successfully. Show partial failures and cancellations honestly. Clean up owned temporary data; never delete originals or unrelated destination files. If a partially created output folder remains after failure, name it and let the user inspect it instead of deleting a potentially modified folder recursively.

## Offline and platform behavior

Cache every organizer module, worker, and bundled ZIP dependency before claiming the new shell is prepared offline. Keep version-coherent service-worker behavior and the older-worker readiness check. No runtime CDN, cloud AI, or server-side file upload is used.

Windows Chrome/Edge are the first physical demo target. Android uses ordinary file picking and ZIP export unless the required APIs are detected. Folder selection and writable-directory access are enhancements, not assumptions based on an OS name. Preserve working Transfer capability separately from organizer or future AI capability checks.

The first organizer milestone uses only filename, type, size, last-modified metadata, selected paths, rules, and user review. Semantic PDF/DOCX extraction, image understanding, richer natural-language guides, chatbot, and transcription remain planned local-AI work. The UI must distinguish those future capabilities from currently implemented evidence.

## Module boundaries

- Inventory: selected File references, stable IDs, basic metadata, exclusions.
- Rules and guide parser: deterministic configuration and unsupported-instruction reporting.
- Planner: default organization, naming templates, reasons, collision resolution.
- Proposal validator: paths, rows, exclusions, revisions, and approval eligibility.
- Exporter and worker: approved copy/ZIP operations, progress, integrity, cancellation, resource budget.
- UI: default Organize workspace, explicit review, exports, and secondary Transfer navigation.

Later AI consumes bounded selected-file evidence and produces candidate rows. It cannot invoke the exporter directly, override exclusions, or skip validation/approval.

## Acceptance checks

1. With only selected files, automatic grouping and consistent naming produce a clear before/after proposal without instructions.
2. Supported guide directives affect the proposal; unknown or contradictory instructions are surfaced and never falsely marked applied.
3. Excluded files are not read for analysis, renamed, organized, or exported.
4. Windows reserved names, traversal, case/Unicode collisions, invalid tokens, missing dates, duplicate input names, dotfiles, and compound extensions are handled deterministically.
5. Selection/rule/guide/exclusion/target edits invalidate approval; stale or tampered proposals cannot export.
6. No export occurs before approval. Original File content remains unchanged; extracted outputs have independent matching hashes.
7. ZIP/folder output contains only included files at approved paths plus the reserved report. Output conflicts never silently overwrite files.
8. Cancellation, source-read failures, quota exhaustion, permission errors, and worker failure release owned resources and report partial results honestly.
9. Cache preparation and offline reload load the complete organizer without network dependencies. Existing transfer and PWA tests remain passing.
10. Verify actual Windows and compatible Android export, memory behavior, and folder permissions before claiming device support. A desktop mobile viewport is not Android evidence.

## Primary references

- Streaming ZIP subset: https://github.com/101arrowz/fflate
- User-approved filesystem access: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- Existing scope research: docs/research/2026-10-09-offline-file-manager.md (recommendations must be reverified at AI implementation time).

## Self-review and next handoff

Scope is the safe organizer core, not a claim that the full AI file manager is implemented. The design preserves original bytes, optional guidance, exclusions, automatic defaults, and proposal approval. Browser limitations, resource ceilings, and future AI boundaries are explicit. User review of this written design precedes the organizer implementation plan.
