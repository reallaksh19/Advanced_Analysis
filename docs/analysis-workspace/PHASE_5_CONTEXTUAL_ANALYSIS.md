# Phase 5 — Contextual Analysis Capability Registry

## Decision

Contextual calculations are exposed through a registry and coordinator. Panels never import or invoke engineering calculators directly.

```text
Selected workspace entity
→ AnalysisCapabilityRegistry.list(context)
→ Properties capability actions
→ analysis:requested
→ AnalysisCoordinator
→ validated capability adapter
→ solver-result-contract-v1
→ analysis:completed | analysis:failed
→ Properties result view
```

## Ownership

- `WorkspaceState` remains the source of truth for dataset and selection.
- `AnalysisCapabilityRegistry` owns capability definitions and readiness evaluation.
- `AnalysisCoordinator` owns calculation invocation, deterministic request IDs, result validation, stale-result suppression, and lifecycle events.
- `PropertiesPanel` owns presentation only.
- Solver and support-load modules remain downstream engineering engines.

## Event contract

### `analysis:capabilitiesChanged`

```js
{
  targetId: string,
  capabilities: Array<{
    analysisType: string,
    label: string,
    description: string,
    engineeringLevel: string,
    enabled: boolean,
    reason: string,
    missing: string[]
  }>
}
```

### `analysis:requested`

```js
{ analysisType: string, targetId: string }
```

### `analysis:started`

```js
{ requestId: string, analysisType: string, targetId: string }
```

### `analysis:completed`

```js
{
  requestId: string,
  analysisType: string,
  targetId: string,
  result: SolverResultContractV1
}
```

### `analysis:failed`

```js
{
  requestId: string,
  analysisType: string,
  targetId: string,
  code: string,
  message: string,
  details: object
}
```

## Registered capabilities

### Support load screening

Adapter path:

```text
normalized pipe/support selection
→ explicit or unique linked pipe resolution
→ buildSupportLoadInput()
→ calculateSupportLoads()
→ solver-result-contract-v1 wrapper
```

The capability is enabled only when at least one certified load case can be calculated from explicit source data. Geometry span is taken from normalized endpoints. Missing fields are reported; no material, fluid, insulation, temperature, weight, or span defaults are injected.

### Pipe flexibility screening

Adapter path:

```text
selected pipe
→ same-line renderable pipe legs
→ dominant-plane projection
→ explicit deltaT / alpha / E / OD / Sa validation
→ solveSimplified2D()
→ solver-result-contract-v1
```

At least two valid pipe legs are required. The adapter selects the two coordinate axes with the largest dataset span for the simplified 2D projection while retaining true three-dimensional leg lengths.

## Reliability rules

- Request IDs are deterministic counters such as `analysis-1`.
- Selecting another entity invalidates pending results for the previous target.
- Dataset clear and workspace destroy invalidate pending work and detach every subscription.
- A forced request for a disabled capability returns `analysis:failed` with `CAPABILITY_NOT_READY`.
- Every completion is validated by `validateSolverResultContract()` before publication.
- The Properties panel never imports solver, support-load, registry, or capability adapter modules.

## Non-goals

- automatic solver execution on selection
- editing analysis inputs in the viewport
- final code stress analysis
- restoring Load Calc, 3D Calc, Pipe Solver, or Reports top-level tabs
- inventing missing engineering values
- persistent analysis history

## Certification

```bash
npm run check:phase5-workspace:static
npm run check:phase5-workspace:browser
npm run check:workspace-browser
npm run check:full
npm run check:qa -- --skip-e2e
npm run check:release
npm run check:benchmarks
npm run build
```
