# LAFEA Non-Bucket NB-T3 — Registry V2 and Composition Root

## Work package

`NB-T3 — REGISTRY V2 AND COMPOSITION ROOT`

## Baseline

- Accepted NB-T2 merge/current main: `81e6384e5d75362b843b73a7be75b0022b1437f3`
- Branch: `feat/lafea-nb-t3-registry-composition`
- Numerical-core authority changed: **No**
- Shell authority changed: **No**
- LAFEA.6 enabled: **No**
- Code or release authority promoted: **No**

## Registry V2

`lafea-stage-registry/v2` retains the existing stage taxonomy and current-core authority while binding every stage to exactly one registered authority path. Each entry now contains:

- a unique `authorityPathId`;
- stable component IDs for document normalization, edit resealing, canonical-input creation, calculation execution, acceptance evaluation and presentation;
- explicit benchmark-manifest IDs for qualified current-core routes;
- the exact NB-T1 lifecycle profile ID;
- a fail-closed release-state binding.

The existing public workbench registry surface exposes these bindings through the immutable registry entries. LAFEA.6 remains an unsupported registered path. It has no benchmark-manifest binding and cannot execute a qualified calculation.

## Composition root

`lafea-stage-composition-root/v1` resolves registry-owned component IDs to the already-qualified current-core adapters. The workbench model facade no longer owns stage-specific numerical dispatch. It delegates normalization, edit resealing and execution to the registered composition.

The composition root:

- verifies registry/lifecycle-profile agreement during module composition;
- verifies all executable component IDs resolve;
- retains the registered authority-path identity in composition metadata while preserving the existing public execution-result contract;
- exposes internal metadata summaries without exposing component functions through the public workbench facade;
- cannot register lifecycle artifacts or producer batches;
- cannot promote code or release qualification.

## Benchmark-manifest identity

The registry IDs identify the retained current-core qualification route for each supported stage. They do not create new benchmark results, alter expected values or tolerances, or establish release evidence.

## Release-state binding

Every stage is bound to `RELEASE_NOT_QUALIFIED` with `automaticPromotion: false`.

Supported stages require separately governed release evidence. LAFEA.6 is bound to the unsupported-stage policy. NB-T3 does not add any release producer or release-qualification path.

## Preserved authority

- LAFEA.1: attachment-foundation analytical route;
- LAFEA.2: nominal pipe-section screening route;
- LAFEA.3: T3/T6/Q8 continuum route;
- LAFEA.4: legacy five-DOF `CST_DKT_TRI3_THIN_SHELL_V1` route;
- LAFEA.5: caller-authored host-shell footprint route;
- LAFEA.6: `ENGINE_NOT_IMPLEMENTED`.

## Files in scope

- `src/workspace/lafea-stage-registry.js`
- `src/workspace/lafea-stage-composition.js`
- `src/workspace/lafea-workbench-model.js`
- `scripts/lafea-u1-stage-registry-check.mjs`
- `scripts/lafea-u3a-public-surface-check.mjs`
- `scripts/lafea-workbench-check.mjs`
- `scripts/lafea-nb-t3-registry-composition-check.mjs`
- `scripts/lafea-nonbucket-stack-check.mjs`
- `scripts/lafea-nonbucket-scope-guard.mjs`
- this document

## Prohibited write sets not touched

- numerical cores, solver formulations, benchmark expected values and tolerances;
- shell formulation labels or dispatch authority;
- lifecycle artifact semantics and producer logic;
- LFEA piping Issue #116 sources;
- Agent 2 templates/buckets;
- first-cut, sequential-sketcher and accessory-panel product logic;
- LAFEA.6 engine, editor or result implementation.

## Acceptance gate

The exact PR head must pass:

- dedicated NB-T3 registry/composition qualification;
- bounded non-bucket stack through NB-T3;
- retained numerical core, foundation, meshing, solver, workbench and canvas checks;
- scoped hybrid Chromium;
- strict syntax and import checks;
- production build and bundle policy;
- exact patch hygiene and clean tree.

Repository integration remains separately attributed. An Issue #116-only full-gate failure remains `REPOSITORY_INTEGRATION_BLOCKED_ISSUE_116` and is not an NB-T3 defect.
