# AI-First Organizer Plan

Branch: `feat/transcription` (the AI-first change lands first; transcription follows on the same branch).
Base: `46160ce` (reload banner, shell v7).

## Decisions (user, 2026-10-10)

- **Local AI is the product.** On a supported browser, first-time visitors see a setup screen before the organizer. It shows the compatibility check, the download size (about 885 MB), and two choices: Prepare, or Load from folder.
- **Supported browsers:** Chrome and Edge on desktop, and Chrome on Android. The app states this plainly.
  - Firefox and older Safari are told the organizer is not supported. Transcription is offered there only if it can actually run.
  - Android stays unclaimed until it passes a test on a real phone.
- **Fallback (option 1):** a supported browser on a device that can't run the model gets "Basic organization (names and metadata only)". It is clearly labelled as a fallback, not offered as an equal mode. Transfer never needs AI.
- **Downloads:** the organizer model (885 MB) and the transcription model (about 410 MB) are prepared separately, each when its workspace is first used.
- **What the AI sees for each file:**
  - its original folder path, type, size and modified date;
  - the user's naming and grouping rules, given as constraints;
  - the names of the other files in the batch;
  - the file content.
- **Rules still win:** an explicit manual rule overrides an AI suggestion, as today.
- **Content formats read:**
  - text, CSV and PDF (as today);
  - .docx, .pptx and .xlsx;
  - .odt, .odp and .ods.

  Legacy .doc, .ppt and .xls files use metadata only, labelled "older format, content not read".
- **Categories:** a preset list that the user can edit (add, rename, remove). It is saved locally, and the AI prefers it.
- **Subfolders:** two levels, category then topic (for example `School/Biology` or `Invoices/Acme Supplies`).
- **Grouping:** after every file is read, one review pass looks at all the suggested folders together and merges near-duplicates (for example, `Atlas Project` and `Project Atlas`).

## Tasks

### 1. Office and OpenDocument text extraction
- Bundle fflate's unzip and inflate (fflate 0.8.3 is already a dependency) as a local vendor module, so it works offline.
- Add `public/ai/office.js`, which extracts text with bounded reads:
  - .docx: `word/document.xml` paragraphs;
  - .pptx: slide XML text, in slide order;
  - .xlsx: shared strings, sheet names, and headers plus the first rows;
  - .odt, .odp, .ods: `content.xml`.
- Enforce the same limits as today: input size cap, total uncompressed cap (to block ZIP bombs), entry-count cap, a timeout, and cancellation. Output goes into the existing text budget.
- Legacy .doc, .ppt and .xls return metadata-only evidence with a clear label.
- Tests use fictional fixtures generated in tests, including a ZIP bomb, a corrupt archive, an encrypted (non-ZIP) file and the size caps.

### 2. Richer AI input
- The file prompt gains a compact metadata block: path, extension, size, modified date and the rules constraints. The guide prompt gains the user's category list.
- The response adds an optional `topic` (the subfolder, two levels at most). Schema, validation and invisible-character stripping apply to it, the same as `category`.
- A batch-context line lists other filenames, capped and truncated by token budget, never by content.
- The prompt token budget stays enforced. Tests cover truncation order: content is cut first, and metadata and the guide are never cut.

### 3. Editable category list
- The preset list is persisted locally per browser. UI: add, rename and remove, plus reset to defaults.
- Prompt and coordinator use the user list. Near-match spelling normalization switches to the user list.

### 4. Review (merge) pass
- After all files are read, one extra model call receives only the distinct `category/topic` pairs with counts, never file content. It returns a merge map.
- The merge map is validated: it may only map existing pairs onto existing pairs or onto a normalized form. It cannot invent paths or move files outside their category, unless one category is a near-duplicate of another.
- The coordinator applies the merge. The proposal shows "grouped with N similar files".

### 5. Proposal integration
- Targets become `Category/Topic/stem.ext`. Rules still override: manual `groupBy` and naming beat AI.
- Collision handling (`keepBoth`), path validation and approval revocation are unchanged.

### 6. AI-first UI and setup screen
- Compatibility gate:
  - an unsupported browser shows "not supported", plus the list of supported browsers;
  - a supported browser on an incapable device sees the reason and is offered basic organization;
  - a capable device gets the setup screen.
- Setup screen: size, Prepare, Load from folder, progress, cancel. Once prepared it goes straight to the organizer on later visits.
- The Rules/Local AI mode selector is removed. "Basic organization" exists only as the fallback path. Shell v7 becomes v8.

### 7. Verification
- Unit tests for each task. The browser regressions (organizer, AI UI, Transfer) are updated for the new first-run flow.
- Real-model run on Edge with the existing 12 fixtures, plus new .docx, .pptx, .xlsx, .odt and nested-folder fixtures. Scored by folder, topic and stem.
- Target: improve on the current 8/10 on the original 10 clear fixtures, and get correct two-level grouping for related files.
- Results are recorded honestly in `docs/local-ai-progress.md`. No result is relabelled as a pass.

## Risks

- **Prompt length:** extra metadata and batch context lengthen prompts, which means slower analysis and less room for content. Mitigation: hard caps, and content is cut first.
- **The review pass:** a 1.5B model may merge wrongly. Mitigation: strict validation of the merge map, and the user reviews every path before approval.
- **Long runs:** the Edge crash at about 10 minutes still affects long batches. It is out of scope here, but runs will be timed and reported.
