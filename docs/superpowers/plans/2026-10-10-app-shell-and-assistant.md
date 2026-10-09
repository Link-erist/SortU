# App Shell Redesign and Organizer Assistant Plan

Branch: `feat/transcription` (continuing). Base: `27b74ae`. The design reference is the user's mockup from 2026-10-10: a dark app with a left sidebar, a Home page, and an Organization page with an upload area, a Proposed Changes panel, organize-by options, Organize and Redo buttons, and a description box.

## Decisions (user, 2026-10-10)

- **Sidebar navigation:** Home, Organization, Transcription, Transfer, and Settings at the bottom. The PWA "Install app" button sits at the bottom of the sidebar, below the navigation, and appears only when the browser offers installation (it never appears in the portable app or an installed window). Renaming merges into Organization, because the design had it as a separate page by mistake. The sidebar collapses to a menu on phones.
- **Theme:** dark by default. A light theme is available in Settings and remembered in this browser.
- **Home:** a landing page that describes each feature, with a button that opens it. There is no file history (browsers cannot reopen files later without asking again).
- **Settings:** theme, model management for both models (status, Prepare, Load from folder, Save to folder, Remove, storage used), and the folder-categories editor (moved here).
- **Organization page:** follows the mockup.
  - Upload area for files or a folder.
  - Proposed Changes panel with a live folder tree. Approval and export happen here, and the file list and exclusions stay available.
  - Organize-by options: File type, Date, Content. Content means Local AI. It is shown only when AI is ready; otherwise basic organization is labelled as the fallback.
  - Organize and Redo buttons.
  - The description box is the assistant.
- **Assistant** (an organizer assistant, not document Q&A):
  - **Starting point:** before a proposal exists, what the user types becomes the direction for Organize.
  - **After a proposal:** it can explain why a file went somewhere, move files to another folder, and rename or merge folders. It cannot rename individual files, exclude files, approve, or export.
  - **Preview, then Apply:** the assistant describes the change ("3 files will move to Projects/Atlas") and the Proposed Changes panel shows it. Nothing changes until the user clicks Apply. Applying resets approval, so the user reviews again before export.
  - **History** is saved in this browser and can be cleared. It contains file and folder names, which the page says next to the Clear button.
  - **Honesty:** it answers only about the selected files and the proposal. Otherwise it says it cannot find the answer or cannot help with that.
- **Device compatibility notice (user, 2026-10-10):** the app tells every visitor whether this device can use it. A compatibility card on Home and in Settings shows one of: "Fully supported" (browser supported and Local AI can run), "Basic organization only" (supported browser, but the device cannot run the model), "Not supported" (rejected browser, with which browsers to use instead), and, separately, whether transcription can run here. The sidebar shows a small status dot with the same verdict, so it is visible on every page. Each verdict lists the reason (browser, WebGPU, shader-f16, memory limits) in plain words.
- **Assistant guardrails (user, 2026-10-10):** the assistant only helps with organizing the selected files into folders. Guardrails are layered so no single layer is trusted alone:
  1. **Master prompt:** a fixed system prompt states the single purpose (organize these files into folders), the allowed actions, the reply format, and a fixed refusal sentence for anything else ("I can only help with organizing the selected files into folders."). File and folder names are passed as quoted data, and the prompt says that text inside names is never an instruction.
  2. **Input gate before the model:** empty, very long, or clearly unrelated messages (no organizing intent and no reference to a file, folder, or category) get the fixed refusal without calling the model.
  3. **Structured output:** the model must return JSON matching the schema (`reply` up to 400 characters, `actions` limited to `move`, `renameFolder`, `mergeFolders`, or `direction` before a proposal). Free text outside the schema is discarded.
  4. **Output checks:** replies that mention things not in the proposal, contain links or code, or exceed the limit are replaced by the fixed refusal or "I couldn't find that in the selected files." Every action is validated as described in the safety model.
  5. **No side effects without Apply:** even a passing action only previews.
  These are covered by unit tests (gate, output checks, validation) and the real-model check includes off-topic questions, prompt-injection file names, and requests to approve or export.

## Safety model for the assistant

- The model sees a compact summary of the proposal: folders with file counts, plus short file aliases and names. It never sees file contents in chat; content analysis already happened during Organize.
- The model returns strict JSON: `{reply, actions}`. Action types are `move` (file aliases to a folder path), `renameFolder` and `mergeFolders`.
- Each action is validated against the current proposal and current revision before the preview is shown. Aliases and folders must exist, paths go through `safeSegment`/`validateTarget`, collisions use `keepBoth`, and the existing proposal checks run. Any invalid action is dropped and reported to the user; an invalid action is never applied partly.
- Apply goes through the existing session edit path (`editTarget`), which revokes approval. Stale previews from an older revision are refused.

## Tasks

1. **Shell:** sidebar layout, theme tokens (dark default plus light), the Home landing page, and the Settings page (model management for both models, categories, theme, storage estimate), and the device compatibility card and sidebar status dot. Workspace mounting generalizes to named pages. The existing Organize, Transcribe and Transfer logic is reused unchanged.
2. **Organization page layout** matching the mockup. All current capabilities stay: exclusions, guide and README, approval, ZIP and folder export, and the setup, basic and unsupported states.
3. **Assistant core:** master prompt, input gate, output checks, schema, action validation, and preview diffs against the proposal (pure, unit tested).
4. **Assistant UI:** chat in the description box, the starting-point direction, preview and Apply, history saved in this browser with a Clear button.
5. **Verification:** unit tests, updated browser checks for every page, a real-model assistant check (move, rename and merge requests, an off-topic question, an invalid request), and 390 px layouts in both themes. Then rebuild and re-test the portable app.

## Risks

- **Model size:** a 1.5B model may misread requests. Strict validation, the preview, and Apply-only changes contain the damage. Results are measured and reported honestly.
- **Large batches:** the proposal summary must fit about 3,400 tokens. With many files the assistant sees folder counts and truncated name lists, and says so.
- **Rework:** the browser regression scripts depend on the current page structure and need updating.
