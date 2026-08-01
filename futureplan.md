# Topology Edit / 3D Tab — Phase 2 Future Plan

## Context

This expands the "Explicit phase 2 (not this pass)" section of the approved plan for the "Edit, Topo fix and Load Calc" 3D tab (see [curious-humming-parnas.md](C:\Users\reall\.claude\plans\curious-humming-parnas.md) for the phase 1 plan this builds on). Phase 1 delivered a fully wired foundation — tab rename, a working entities↔canonical-topology translation layer, the "3D" sub-tab mounted end-to-end, and bounded high-ROI fidelity work (real oriented pipe-segment rendering, instanceId-aware picking, a 5-rule checker subset with safe autofix, the P3A restraint-overlay port). Everything below was explicitly deferred as too large for that pass — this document is so it isn't silently dropped.

Source spec of record for all items: `F:\CODE-6\XML_Compare_Utilities\docs\Topology_Edit_Draft_Port_Work_Instructions\` (P0–P8, P99), and the underlying vendored engine at `F:\CODE-6\XML_Compare_Utilities\vendor\3d-converters\topology-browser-core.mjs`.

## Recommended sequencing (differs from the order below, which follows source phase numbering, not build order)

1. **Command journal as a certifying reducer** (item 5) — foundational. The safe-autofix loop in item 2 and the candidate-regeneration ghost preview in item 3 both depend on being able to cheaply, correctly regenerate-and-verify a candidate edit before committing to it. Building the checker/autofix extensions on top of today's generic undo/redo stack means rebuilding them again once the reducer lands.
2. **Full parametric geometry catalog** (item 1) — foundational for everything visual; unblocks meaningful ghost previews and makes geometric checker rules (clearance/overlap) directly renderable.
3. **Remaining checker rule groups + fix suggestions** (item 2) — now has both a safe apply/verify loop (from #1) and real geometry to reason about (from #2).
4. **Ghost-preview via candidate regeneration** (item 3) — depends on #1 and #2 both being in place.
5. **GPU color-ID picking at scale** (item 4) — independent of the others; can slot in anywhere, lowest priority since the current CPU/instanceId interim is functionally correct, just less scalable.
6. **P8 large-model scoping/perf qualification** (item 6) — last, since it's about qualifying everything else already built at scale.

---

## 1. Full parametric valve/flange/tee/OLET/elbow geometry catalog

**What exists today (phase 1):** real oriented pipe-segment cylinders (correct start/end, bore-based radius) for edges; fittings at junction nodes render as simple type-colored/sized marker shapes, not their real parametric geometry.

**What this adds:** the source's actual per-type fitting shapes — valve trim, flange hub/face, tee collars, OLET tapers, and elbow arcs tessellated via cubic-Bézier sampling — instead of generic markers.

**Source reference:** `tabs/topology-trace-validator/topology-edit-3d-geometry.js` (179 lines) in XML_Compare_Utilities — a pure function turning canonical topology + source bore/position data into `VisualGeometryModel.v2` segments/markers (`contracts/visual-geometry-model.js`). Elbow arc math and some shape logic also appear in `workbench3d/viewer/workbench-viewer.js:379-416`. Bore/diameter resolution needs the fallback priority chain from source (edge radii → canonical diameter → visual fallback), including branch-connection bore-inheritance (e.g. a `CREF_BRANCH_CONNECTION` bore lookup) — this logic doesn't exist anywhere in the ported package today and would need to be built, not just copied, since it's entangled with the vendored core's internal component model.

**Target:** a new geometry-derivation module in `src/workspace/topology-edit/` (e.g. `topology-edit-fitting-geometry.js`), consumed by `topology-edit-viewport-backend.js`'s `renderSession`/`buildMeshGroup` in place of today's generic marker path.

**Scope:** per the phase 1 audit, comparable in size to all of phase 1 combined — this is the single largest item on this list.

**Acceptance:** valve/flange/tee/OLET/elbow shapes are visually distinguishable and dimensionally consistent with source bore/geometry data; elbow arcs render smoothly (no faceting at normal zoom); picking still resolves correct canonical IDs against the new shapes.

## 2. Remaining checker rule groups and their fix suggestions

**What exists today (phase 1):** a 5-rule subset — `ORPHAN_EDGE_ENDPOINT`, `ORPHAN_NODE`, `SHORT_ELEMENT`, `BRANCH_DISCONNECTED`, `SNAP_GAP` — with real detection against the canonical topology graph, plus a safe-autofix loop for `SNAP_GAP → MERGE_NODES` and orphan/short → `MOVE_NODE`.

**What this adds:** the source's remaining rule groups:
- **`pairGeometryIssues`**: `OVERLAPPING_ELEMENTS` (collinear overlap via `overlapLength`), `PHYSICAL_CLEARANCE_CLASH` (OD + insulation clearance violation via 3D segment-distance), `CENTERLINE_CLASH`.
- **`fittingIssues`**: `PIPE_BACKTRACK`, `BEND_WITHOUT_DIRECTION_CHANGE`, `RIGHT_ANGLE_WITHOUT_BEND`, `UNDEFINED_KINK`, `MULTIWAY_WITHOUT_JUNCTION`, `JUNCTION_WITHOUT_MULTIWAY`, `BEND_AT_JUNCTION`.
- **The rest of `attachmentIssues`**: `ORPHAN_SUPPORT`, `UNKNOWN_RESTRAINT_FAMILY`, `UNRESOLVED_RESTRAINT_DIRECTION`, `ORPHAN_RIGID`.

Also needs 3 more native edit commands beyond phase 1's 7 (`MOVE_NODE`, `MERGE_NODES`, `BRIDGE_GAP`, `ADD_STRAIGHT_ELEMENT`, `SPLIT_EDGE`, `DISCONNECT_ENDPOINT`, `DELETE_EDGE`) to act on these new issues: `ADD_BEND_DEFINITION`, `ADD_JUNCTION_DEFINITION`, `TRIM_EDGE`.

**Source reference:** vendor core `runTopologyChecks` rule functions (`pairGeometryIssues` ~line 8421, `fittingIssues` ~line 8247, `attachmentIssues` ~line 8294) and fix-suggestion builders in `buildTopologyFixSuggestions` (~line 10693): `bendSuggestion` (RIGHT_ANGLE_WITHOUT_BEND → ADD_BEND_DEFINITION, using catalog bend radius or an approved 1.5D long-radius fallback), `junctionSuggestion` (MULTIWAY_WITHOUT_JUNCTION → ADD_JUNCTION_DEFINITION, inferring TEE vs OLET from relative diameters), `trimSuggestion` (OVERLAPPING_ELEMENTS/PIPE_BACKTRACK → TRIM_EDGE, only when a unique dependency-free redundant tail is proven).

**Target:** extend `src/workspace/topology-edit/topology-edit-checker.js` and `topology-edit-autofix-controller.js`/`topology-edit-autofix-grouper.js` with the new rule functions and command handlers; extend the canonical-topology command application in `topology-edit-source-adapter.js` to handle the 3 new command types.

**Acceptance:** each new rule fires on a real fixture with the corresponding known-bad geometry (mirrors the source's own fixture-driven tests); fix suggestions map to the correct command with the same confidence/risk semantics as source; the safe-autofix loop (from item 5) rejects any candidate that creates a new or worsened issue.

## 3. Real ghost-preview via candidate regeneration

**What exists today (phase 1):** a `ghostGroup` scene group already exists in `TopologyEditViewportBackend` (one of its 9 groups) but nothing populates it — no ghost rendering path exists yet.

**What this adds:** proposed fixes rendered as translucent, dashed preview geometry *before* the user commits — generated by actually regenerating the candidate topology (applying the fix to a cloned canonical topology and diffing), not by visually approximating the change.

**Source reference:** `topology-fix-ghost-model.js` (86 lines) — converts fix-suggestion previews into a translucent ghost `VisualGeometryModel.v2` overlay, colored/dashed by operation kind.

**Target:** new `src/workspace/topology-edit/topology-edit-ghost-model.js`, wired to render into the existing (currently empty) `ghostGroup`.

**Depends on:** item 1 (needs real geometry to render a meaningful preview) and item 5 (needs the certifying reducer to regenerate a candidate cheaply and correctly).

**Acceptance:** selecting a fix suggestion shows an accurate translucent preview of the exact resulting geometry; accepting the fix produces geometry identical to what the ghost showed.

## 4. GPU color-ID picking at scale

**What exists today (phase 1):** CPU `THREE.Raycaster` picking with an `instanceId → canonicalId` lookup table for `InstancedMesh`-rendered elements — functionally correct, but doesn't scale as well as source's approach on very large/dense scenes.

**What this adds:** the source's GPU-based picking — an offscreen render target with a pick-only override shader encoding a stable numeric ID per instance as an RGBA color, read back via a small (e.g. 5×5 pixel) region around the cursor.

**Source reference:** `workbench3d/viewer/gpu-picker.js` (106 lines); invoked from `workbench-viewer.js:1436` (`pickAt`).

**Target:** new `src/workspace/topology-edit/topology-edit-gpu-picker.js`, wired into `TopologyEditViewportBackend.pickAt()` in place of (or as a large-scene fallback ahead of) the current raycasting path.

**Priority:** explicitly the lowest priority item here — flagged as an "acceptable interim" in the phase 1 plan, not a functional gap.

**Acceptance:** picking remains accurate and near-instant (no visible read-back latency) on scenes with thousands of instanced elements; no regression in picking correctness at small scale.

## 5. Command journal as a certifying pure reducer with hash certification

**What exists today (phase 1):** `topology-edit-command-journal.js` is a generic undo/redo stack over arbitrary `{type, payload}` entries — it does not regenerate, re-validate, or hash-certify state after each command.

**What this adds:** the source's two-phase, certifying commit model — every accepted command is applied as a pure reducer over a cloned canonical topology graph, the result is fully regenerated and re-validated, and only then hash-certified and accepted into the journal.

**Source reference:** `topology-edit-journal-service.js` (250 lines, `prepareNative`/`acceptPrepared` two-phase pattern, autofix grant provenance checks) and the vendor core's `materializeTopologyEditDraft` (lines ~7433–8710), which replays the full command list against a mutable clone, then re-validates (`validateEditedTopology`) and re-runs geometry checks (`mergeGeometryDiagnostics`) before returning. Port spec: `P2_EDIT_SESSION_AUTHORITY.md` §5 (`certifyCommandRegeneration`).

**Target:** rewrite `src/workspace/topology-edit/topology-edit-command-journal.js` (likely restructured into multiple files mirroring the source split, e.g. a `topology-edit-journal-service.js` + `topology-edit-command-replay.js` pair) to replace the generic undo/redo stack.

**Note:** this is explicitly **architecturally different**, not an incremental patch — it changes what "the journal" fundamentally is (a certifying state machine vs. a generic undo stack), which is why it's sequenced first among the phase 2 items despite being listed 5th in the source phase numbering.

**Acceptance:** every accepted command is replayable and produces deterministic, hash-verifiable evidence; undo/redo survives arbitrary command sequences without drift; the safe-autofix loop (item 2) can rely on this to detect "no new or worse issue" reliably.

## 6. P8 large-model scoping/perf qualification at real fidelity

**What exists today (phase 1):** scaffolding only — `topology-edit-scope-contract.js` has the schema shape (`componentThreshold`/`byteThreshold`/`isBranchInScope`) but no real scope tree or hash-derived scope hash; `topology-edit-large-model-controller.js`'s `recordMetric()` is never called; `topology-edit-worker.js`'s `BUILD_SPATIAL_INDEX` action just counts elements and returns a timestamp, not a real spatial index. `topology-edit-worker-client.js` (the request/response correlation layer) is genuinely functional and can be built on directly.

**What this adds:** real branch-scoped canonical/validation projections so large models (source threshold: ~200 canonical edges) only render/validate a user-picked branch subset while commands and export stay full-model; a real spatial index (not element counting) for performance at scale; real metric recording wired to actual render/pick/regeneration timings; a release-qualification benchmark harness.

**Source reference:** `P8_LARGE_MODEL_AND_RELEASE_QUALIFICATION.md`; source's `topology-edit-scope-model.js` (146 lines, large-model mode detection + branch-scoped canonical/validation projections).

**Target:** flesh out `topology-edit-scope-contract.js` and `topology-edit-large-model-controller.js`; give `topology-edit-worker.js` a real spatial index; add a qualification script mirroring the app's existing benchmark pattern (e.g. `scripts/run-advanced-tab-benchmarks.mjs`, the `1885s-webgl-load-benchmark` reports already in the repo).

**Depends on:** item 1 (perf qualification needs real rendering load, not placeholder cylinders) and item 5 (regeneration-per-command needs to be fast at scale, which the certifying reducer directly affects).

**Acceptance:** a large fixture (thousands of elements) stays interactively responsive with branch scoping active; full-model command/export correctness is unaffected by scoping; qualification benchmarks are captured and compared against a baseline the way the app's existing benchmark scripts do.
