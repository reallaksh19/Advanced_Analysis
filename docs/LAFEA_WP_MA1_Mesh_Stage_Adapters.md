# WP-MA1 — Stage-Correct Non-Executable Mesh Request Adapters

## Scope

WP-MA1 converts exact current LAFEA.3, LAFEA.4 and LAFEA.5 workbench state into deterministic request records for the existing mesh generation-intent and refinement-command contracts.

It does not generate, modify, repair, smooth or refine a mesh. It does not run a solver, register lifecycle evidence, authorize execution, or qualify release. The obsolete LAFEA GitHub Actions certification workflow is intentionally not restored; the focused checks remain directly runnable.

## Canonical adapter boundary

`lafeaMeshStageAdapter(stageId)` is a request-specific facade over `requireLafeaStageAnalysisAdapter(stageId)`. Element-family authority and source node/element paths are consumed from that canonical stage adapter; WP-MA1 does not maintain a second family/path registry.

| Stage | Display surface | Canonical source collections | Canonical element families |
| --- | --- | --- | --- |
| LAFEA.3 | `CONTINUUM_2D` | `nodes`, `elements` | `T3`, `T6`, `Q8` |
| LAFEA.4 | `THIN_SHELL` | `nodes`, `elements` | `CST_DKT_TRI3_THIN_SHELL_V1` |
| LAFEA.5 | `HOST_SHELL` | `shellTemplate.nodes`, `shellTemplate.elements` | `CST_DKT_TRI3_THIN_SHELL_V1` |

LAFEA.1, LAFEA.2 and LAFEA.6 have no mesh request adapter because the canonical stage adapter declares analysis mesh not applicable.

The facade mirrors canonical `generationAuthorized` and `refinementAuthorized`; both remain false. The display-surface label is descriptive only and carries no engineering authority.

## Currentness gate

`projectLafeaMeshRequestReadiness(stageState)` is pure and fail-closed. A request is ready only when:

1. lifecycle binding is `CURRENT`;
2. lifecycle source is `CURRENT` with a canonical SHA-256 source hash;
3. `CANONICAL_MODEL` is `CURRENT/PASS`, has a canonical SHA-256 artifact hash, and is parent-bound to the current source;
4. `ANALYSIS_GEOMETRY` is `CURRENT/PASS`, has a canonical SHA-256 artifact hash, and is parent-bound to the exact current source and canonical model;
5. the workbench has an explicit `analysisMeshProfileHash`;
6. the active stage document exposes the canonical node/element source collections with non-empty identities.

Hash reappearance alone is insufficient. A stale or revalidation-required lifecycle binding keeps request readiness blocked.

This readiness projection permits construction of a **non-executable request record only**. It does not bypass canonical WP-AC2 preparation or solve authorization.

## Generation intent

`buildLafeaMeshGenerationIntentFromStage(stageState, configuration)` derives source/model/geometry/profile parents from current stage lineage. The caller cannot supply those parents.

The caller supplies only explicit configuration: target element length/unit, one canonically allowed family, curvature tolerance, growth limit, resource ceilings and zero or more refinement entity IDs. Refinement IDs must exist in the exact active source collections and are canonicalized before entering the generation-intent contract.

The resulting record remains:

```text
status = UNEXECUTABLE_INTENT
executionAuthorized = false
producerRef = null
producesMesh = false
```

## Refinement command

`buildLafeaMeshRefinementCommandFromStage(stageState, configuration)` requires a complete generation intent. The adapter rebuilds the intent through the generation-intent contract, rejects tamper, and verifies that its stage and all four engineering parents still match current readiness.

Entity IDs must again resolve against the current source surface. The returned command remains `UNEXECUTABLE_COMMAND` and retains `NO_MUTATION_WITHOUT_QUALIFIED_PRODUCER`.

## Explicit non-authority

WP-MA1 does not expose the bounded C2D-LUG-PINHOLE controller to the UI and does not generalize it into a mesh producer.

```text
canonicalStageAdapterConsumed  = true
stageCorrectRequestProjection  = true
meshGeneration                 = false
meshRefinementExecution        = false
sourceMutation                 = false
lifecycleMutation              = false
solverExecution                = false
recoveryOrConvergence          = false
assessmentOrCode               = false
reportAuthority                = false
releaseQualified               = false
```
