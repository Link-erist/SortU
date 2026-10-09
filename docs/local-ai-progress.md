# Local AI execution ledger

Plan: docs/superpowers/plans/2026-10-09-local-ai-organizer.md
Spec: docs/superpowers/specs/2026-10-09-local-ai-organizer-design.md
Base: 0aef72c (approved plan and artifact metadata).
Branch: feat/local-ai-organizer.
Execution: native implementation followed by one independent whole-branch review.
Baseline: 55 tests passed, 0 failed.
Ruling: Continue in the existing checkout on the approved new branch, preserving unrelated untracked research/output files. Existing preview can serve the new assets. No new worktree needed.
Ruling: Use this tracked ledger with native Windows commands instead of POSIX-only bookkeeping helpers, matching the prior milestone.
Task 1: started. Pinning dependencies and inspecting the packaged runtime/cache APIs before implementing the transport.
Ruling: Runtime 0.2.85 reads tensor-cache.json, not only ndarray-cache.json. Add the immutable tensor index to the deployable manifest. Total preparation metadata becomes 885,512,012 bytes including the library.
Ruling: Cache.add bypasses a JavaScript fetch wrapper. Explicit preparation fills the pinned runtime's three cache scopes, then a worker-local Cache proxy refuses add/addAll. This prevents hidden network fallback without duplicating weight storage. Each cold load verifies cached artifact integrity; keep model caches outside shell eviction ownership.
Remaining tasks: extraction; prompt/schema; revision-bound analysis; organizer controls/offline shell; real inference and review.
Tasks 1/2 checkpoint: capability/transport/worker cancellation and bounded extraction tests pass. Full suite: 62 passed, 0 failed. Model inference is not yet verified. Local PDF parser assets and pinned runtime are bundled; no weight download has occurred.
Tasks 3/4 checkpoint: strict guide/suggestion contracts, token budgets, exclusion-before-analysis, private session tickets, validated AI target construction, original extensions and current approval/export integration implemented. Full suite: 70 passed, 0 failed.
Task 5 checkpoint: Rules/Local AI mode, explicit preparation, guide exclusion review, frozen controls, cancel, separate readiness and v5 cache implemented. Real UI regression passes: Rules default, no weights downloaded on load, missing-cache AI failure, Rules fallback and offline reload.
Real model checkpoint: explicit preparation downloaded/verified the pinned assets in ignored work/ai-browser-profile. GPU loading on Intel succeeded. Initial real generation failed because WebLLM 0.2.85's JSON grammar requires an explicit schema string; source inspection found the root cause. A failing-before-fix schema regression passes, and the actual JSON warmup now succeeds. Offline initialization and content quality acceptance are in progress, not yet claimed.
Ruling: Ship PDF ES modules as .js files to match the existing preview MIME mapping, without replacing the current server. Their source and licenses are unchanged; obsolete generated .mjs copies are removed.
