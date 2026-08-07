# WP-AC1 — LAFEA Architectural Convergence

## Purpose

WP-AC1 replaces the active facade-on-facade workbench composition with one
canonical orchestration architecture on current `main`.

This package does not add a mesher, pre-FEA approval authority, solver route,
recovery algorithm, code assessment, report authority, or release qualification.

## Dependency direction

```text
DOMAIN CONTRACTS
  source authority
  canonical model
  lifecycle evidence
  analysis-mesh evidence
  result/recovery evidence
        |
        v
STAGE ADAPTERS
  LAFEA.1 ... LAFEA.6
        |
        v
WORKBENCH ORCHESTRATOR
  one derived stage snapshot
  one listener set
  one public publication boundary
        |
        v
PRESENTATION
  forms / guided flow / viewport / result surfaces
```

Presentation is not an input to engineering authority.

## Stage adapters

`lafea-stage-analysis-adapter/v1` is the canonical stage capability boundary.

It derives engine and lifecycle identity from the existing registry/profile
contracts and adds only stage-specific orchestration metadata.

Mesh-family authority is exactly:

- LAFEA.1 — not applicable
- LAFEA.2 — not applicable
- LAFEA.3 — `T3`, `T6`, `Q8`
- LAFEA.4 — `CST_DKT_TRI3_THIN_SHELL_V1`
- LAFEA.5 — `CST_DKT_TRI3_THIN_SHELL_V1`
- LAFEA.6 — unsupported

The adapter exposes no producer and explicitly reports generation and refinement
as unauthorized.

## Canonical orchestration projection

Every derived stage contains `orchestration` with the ordered sections:

1. `SOURCE`
2. `MODEL`
3. `PREPARATION`
4. `DISCRETIZATION`
5. `AUTHORIZATION`
6. `EXECUTION`
7. `RESULTS`
8. `RELEASE`

Each section is a closed projection:

```js
{
  schema: 'lafea-workbench-orchestration-section/v1',
  state,
  reasons,
  evidenceRefs,
  allowedActions
}
```

The projection is pure and deeply frozen.

No DOM state, button state, timestamps, or display-only hashes participate in
currentness.

## Preparation boundary

There is currently no qualified generic LAFEA-stage pre-FEA bridge.

Consequently `PREPARATION` and downstream `AUTHORIZATION` remain fail-closed
with `LAFEA_PREFEA_BRIDGE_NOT_QUALIFIED` after model prerequisites are ready.

The InputXML/LFEA pre-FEA gateway is not reinterpreted as LAFEA authority.

## Discretization boundary

The projection consumes the merged WP-MC1 custody projection.

`CURRENT_PASS` is complete. `CURRENT_WARNING` remains warning/review evidence.
Absent, stale, invalid, and blocking evidence cannot authorize downstream
actions.

The architecture does not generate, refine, repair, smooth, or recombine a
mesh.

## Store ownership

`createLafeaWorkbenchStore(...)` now creates the canonical orchestrator directly.

The orchestrator owns:

- the single retained-store subscription used by the public workbench;
- the public listener set;
- source-authority transition memory;
- analysis-mesh custody state;
- lifecycle delegation;
- stage derivation;
- the orchestration projection.

Source state and mesh state are internal state slices. They own no listeners and
publish nothing.

This removes nested public store publication as an architectural mechanism.

## Compatibility

Merged WP-MC1 APIs remain available:

- `validateLafeaAnalysisMeshEvidence`
- `registerAnalysisMeshEvidence`
- `selectRetainedAnalysisMeshEvidence`
- `buildAnalysisMeshCustodyProjection`
- `exportAnalysisMeshEvidence`
- `recoverAnalysisMeshEvidence`

`lifecycleReadiness` also remains available for compatibility. New action policy
must consume `orchestration`.

## Non-resurrection

Undo, redo, or reappearance of a prior content hash does not restore authority.

Lifecycle binding, lifecycle artifact currentness, source authority, retained
mesh evidence, and stage projection must all be current through their explicit
contracts.

## Release boundary

`RELEASE` is always `BLOCKED` with `RELEASE_NOT_QUALIFIED` in WP-AC1.

No calculation, mesh, result, benchmark, or UI state in this package can change
that condition.
