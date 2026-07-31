# LAFEA Hybrid Canvas Remediation and Implementation Plan

Status: **APPROVED ARCHITECTURAL DIRECTION / PHASED IMPLEMENTATION REQUIRED**

This plan is grounded in the current repository, the reviewed first-cut load
estimation authority, the Priority 2 FEA plan, and the attached hybrid-canvas
proposal. It supersedes claims in that proposal that are not supported by
executable code or qualified engineering evidence.

## Governing invariant

SVG owns authoring and accessible overlays. Three.js/WebGL owns dense mesh,
contour, deformation, and shell rendering. Both consume one immutable
engineering scene and one viewport state. Selection is an engineering identity,
never a DOM node or Three.js object.

Additional invariants:

1. Workspace renderers never calculate stress, reactions, sag, contact, or
   allowables.
2. Imported source objects are immutable; authoring is command-gateway based.
3. Fallback renderers, limits, field bounds, colour maps, and approximation
   sources are explicit and lineage-bound.
4. Stale scene, worker, pick-map, mesh, and recovery identities fail closed.
5. New target modules remain below 300 physical lines.
6. Existing slot boundaries and public exports remain stable.
7. `[SIMULATED]` fixtures cannot be reported as real engineering validation.

## Rejected mechanics from the draft proposal

The following are not implementation requirements and must not enter production
code:

- `0.5/0.6` empirical tributary reaction coefficients;
- rating-derived component masses or ASME rating multipliers;
- a universal `2.50 mm` sag limit;
- UI-side `S_L <= S_h` or B31.3 compliance claims;
- thermal lift-off inferred from free thermal growth;
- automatic adjacent-support reaction redistribution;
- a universal `4x/400%` stress-surge multiplier;
- hidden fluid, insulation, temperature, schedule, rating, or allowable
  defaults.

The existing W10.4/W10.5/W10.6 and first-cut packages remain the only non-FEA
screening authorities. Thermal/support/anchor/nozzle mechanics remain governed
by `docs/priority2FEAupdate.md`.

## Empirical audit

| Area | Repository evidence | Current assessment | Required action |
|---|---|---|---|
| Canvas contracts | `src/workspace/lafea-canvas/` exists | Foundation only | Harden and retain |
| Live LAFEA adoption | No workbench imports the canvas package | Unbound | Phase 2 |
| Live LFEA adoption | No workbench imports the canvas package | Unbound | Phase 3 |
| Sequential authoring | Existing SVG editor is live; new controller unbound | Parallel foundations | Phase 4 bridge |
| WebGL contour | Static blue material existed | Defect | Remediated before adoption |
| Render packet | Optional arrays and weak relationship validation existed | Defect | Remediated |
| Mesh-quality panel | Public API was replaced by a mock/default card | Regression | Restored |
| Enrichment dialog | Unbound placeholder with hidden defaults | Unsafe duplicate | Removed; reuse first-cut workbench |
| Canvas tests | Registry self-comparison claimed unrun benchmarks | False evidence | Remediated |
| Real-model validation | No real hybrid-canvas import benchmark supplied | Missing | Phase 6 |

## Phase 0 — Integrity remediation

Deliverables:

- restore `buildMeshQualityPanel()` and `panelBlocksAdvance()`;
- remove production mock/default mesh-quality data;
- make every canvas test register only tests actually executed;
- remove self-comparison benchmark claims;
- keep the aggregate gate red when a real dependency breaks;
- enforce render-packet relationship and lineage checks;
- replace static contour material with explicit bounds and colour-map mapping.

Exit gate:

```text
npm run check:lafea-canvas
node scripts/lafea.10-mesh-quality-panel-check.mjs
npm run check:lafea-meshing
npm run syntax:strict
npm run build
```

## Phase 1 — Scene compiler and adapter contracts

Create a DOM-free scene compiler for each producing pipeline. The compiler may
copy qualified geometry/result evidence but may not recover or average fields.

Required contracts:

- one `LafeaEngineeringScene.v2`;
- one `LafeaViewportState.v2`;
- explicit parent hashes for source, topology, mesh, recovery, and display
  profile;
- explicit field bounds and colour-map identity;
- pick-map entries bound to scene revision and engineering IDs;
- deterministic ASCII ordering.

Do not create a second source store for SVG or WebGL.

## Phase 2 — LAFEA workbench adoption

Add a dedicated controller/adapter module rather than expanding
`lafea-workbench-view.js` beyond 300 lines.

Responsibilities:

1. compile the active LAFEA stage document and qualified execution into a
   sealed scene;
2. create one selection store and one hybrid viewport;
3. route source-authoring modes to SVG;
4. route qualified dense results to WebGL;
5. retain the existing JSON/collection editors and benchmark evidence;
6. destroy renderers/workers on stage switch and workbench teardown;
7. show a visible blocked state when WebGL or a qualified render packet is
   unavailable.

No mock stage is loaded automatically.

## Phase 3 — LFEA workbench adoption

Use the same viewport contracts but a separate LFEA scene compiler. Bind only
qualified, current LFEA mesh/recovery results. Deformation scale remains an
explicit display setting and never changes engineering hashes.

Required stale checks:

- package identity;
- compiled model identity;
- mesh identity;
- solver/recovery identity;
- result mode and display profile identity;
- worker request/reply identity.

## Phase 4 — Sequential SVG authoring bridge

Create `src/workspace/sequential-sketcher/sketcher-authoring-bridge.js`.

The bridge:

- wraps the existing sequential command gateway;
- creates transient previews without source mutation;
- commits one exact revision-checked command per accepted gesture;
- maps selection through engineering IDs;
- cancels on Escape, pointer cancellation, dataset change, or stale revision;
- does not import solvers, recovery code, or result stores.

The existing sequential view remains below 300 lines.

## Phase 5 — Enrichment and preflight integration

Reuse `src/workspace/enrichment/first-cut-workbench-controller.js` and its
immutable master/override/approximation sidecars. Do not create a second
override matrix with rating or density defaults.

Integration actions:

- expose a toolbar launcher that focuses or pops out the existing workbench;
- preserve exact entity and grouped selectors;
- show authority, source, revision, affected entities, and unresolved evidence;
- seal assumptions only after explicit confirmation;
- keep stale results visible but non-copyable and non-exportable.

## Phase 6 — Qualified results, browser validation, and real data

Add browser checks only after live consumers exist:

| Test ID | Input basis | Expected result | Status |
|---|---|---|---|
| HC-UI-01 | `[SIMULATED]` source-authoring scene | SVG layer active, WebGL cleared | NOT RUN |
| HC-UI-02 | `[SIMULATED]` qualified dense mesh | WebGL layer active, SVG overlay retained | NOT RUN |
| HC-UI-03 | `[SIMULATED]` stale worker reply | Reply rejected, prior scene retained | NOT RUN |
| HC-UI-04 | `[SIMULATED]` GPU pick | Engineering identity selected | NOT RUN |
| HC-UI-05 | `[SIMULATED]` unrecovered field | Diagnostic colour, no averaging | NOT RUN |
| HC-UI-06 | `[SIMULATED]` WebGL loss | Explicit blocked/fallback state | NOT RUN |
| HC-UI-07 | `[SIMULATED]` authoring gesture | One revision-checked command | NOT RUN |
| HC-REAL-01 | User-supplied project package | SVG/WebGL and exported evidence reconciled | NOT RUN |

Performance thresholds must come from a versioned, sourced render policy. A
timing loop with an arbitrary local threshold is diagnostic evidence only, not
release qualification.

## Anti-drift checks

Source guards must reject:

- solver, mesher, recovery, or code-engine imports from renderers;
- renderer-side field recovery, smoothing, averaging, or topology repair;
- static result colours when a result field is displayed;
- missing/unsourced field bounds or colour-map IDs;
- random or locale-dependent engineering identity;
- separate SVG and WebGL engineering stores;
- default production mock records;
- fake benchmark registration or PASS output without execution;
- files above the target 300-line ceiling;
- edits outside mandatory agent-fill slots where a target skeleton defines
  those boundaries.

## Completion definition

The migration is complete only when both live workbenches use the hybrid
viewport, the sequential bridge is command-backed, every result is lineage
bound and stale-safe, scoped browser tests pass, the aggregate gate passes, and
one real imported project package is reconciled. Until then, the canvas package
is correctly described as a hardened foundation—not a completed migration.
