# WP-MC1 Analysis-Mesh Evidence Custody

## Scope

WP-MC1 retains, validates, exports, recovers, and projects explicit analysis-mesh evidence. It does not produce a mesh or numerical result.

No mesh generation, topology creation, refinement, smoothing, recombination, repair, solver execution, result recovery, code assessment, report authority, or release qualification is introduced by this package. `meshConfig remains an unapplied preference` and is never accepted as produced engineering evidence.

## Trust boundary

Every candidate `lafea-analysis-mesh-evidence/v1` value is untrusted. `validateLafeaAnalysisMeshEvidence` rebuilds the value through `createLafeaAnalysisMeshEvidence` and requires exact canonical equality. This recomputes the governed profile, canonical mesh, quality rows and findings, mesh and artifact hashes, authority, lifecycle artifact record, and registration identity.

Deep freezing prevents later local mutation. It does not prove authenticity, producer identity, or custody. Producer references remain content-bound provenance strings rather than cryptographic signatures.

## Retained ownership

The editable source document never owns produced mesh evidence. One latest canonical evidence slot is retained per stage in the lifecycle workbench decorator. Stale evidence remains available for audit and export, but cannot authorize advance or execution.

The stage overlay retains:

- a monotonic custody version;
- the explicitly selected mesh-profile hash;
- the complete canonical evidence;
- the last custody action.

## Atomic registration

`registerAnalysisMeshEvidence` uses this order:

1. canonical rebuild and tamper validation;
2. active-stage, lifecycle, binding, source-authority, parent, profile, family, quality, producer, artifact, and registration checks;
3. pure preparation of the next lifecycle and custody projection;
4. recheck of active stage and custody version;
5. suppressed lifecycle registration followed by one evidence-slot assignment;
6. one combined subscriber publication.

All preflight work completes before mutation. The retained lifecycle store is trusted to apply a validated artifact record or return its declared fail-closed diagnostic state without changing the lifecycle. The evidence slot is assigned only after that registration succeeds. Exact replay is a no-op with no publication. Conflicting replay is rejected.

Subscribers never observe a lifecycle mesh registration without its corresponding full evidence, or full evidence without its matching lifecycle registration. Subscriber exceptions are isolated after the commit and cannot roll it back.

## Currentness and non-resurrection

Currentness is conjunctive. A retained value is usable only when all of these remain current and equal:

- lifecycle source and, when present, outer source authority;
- canonical model;
- analysis geometry;
- explicit selected mesh profile;
- lifecycle `ANALYSIS_MESH` artifact hash, producer, parents, status, and qualification;
- canonically rebuilt full evidence;
- current lifecycle/document binding.

**Hash reappearance does not restore authority.** Undo, redo, reimport, or profile cycling can reproduce old hashes, but a prior invalidation event remains effective. An explicit lifecycle/binding/profile transition and explicit registration or recovery command are required before the evidence can become current again.

## Projection

The pure projection schema is `lafea-analysis-mesh-custody-projection/v1`. Every state returns the same closed key set. Unavailable identities are `null`; unavailable collections are frozen empty arrays.

| State | View | Focus findings | Advance | Authorize | Run |
|---|---|---|---|---|---|
| `NOT_APPLICABLE` | N/A | Deny | Allow mesh gate bypass | Allow mesh gate bypass | Allow mesh gate bypass |
| `ABSENT` | Empty state | Deny | Deny | Deny | Deny |
| `STALE` | Audit only | Deny | Deny | Deny | Deny |
| `CURRENT_PASS` | Allow | Deny | Allow | Allow | Allow |
| `CURRENT_WARNING` | Allow | Allow | Review required | Deny | Deny |
| `CURRENT_BLOCK` | Allow | Allow | Deny | Deny | Deny |
| `INVALID` | Diagnostics only | Deny | Deny | Deny | Deny |

These are mesh-gate outcomes only. Global readiness must still satisfy every other lifecycle, solver, assessment, and release policy.

## Export and recovery

`exportAnalysisMeshEvidence(stageId)` returns the retained canonical evidence directly, or `null`. It adds no timestamp, UI state, render cache, or lifecycle snapshot. Stable serialization is therefore deterministic.

`recoverAnalysisMeshEvidence(value)` sends exported data through the same canonical validator used for first registration. It may:

- return an exact current replay as a no-op;
- register current evidence only when lifecycle, binding, source authority, parents, and explicit profile binding already permit it;
- retain the evidence as stale audit data when prerequisites are absent or stale;
- reject tampering, stage switching, unsupported stages or families, and conflicting recovery.

Recovery never manufactures a source, model, geometry, profile selection, lifecycle record, solver result, or authorization.

## Dependency direction

```text
untrusted evidence
  -> canonical evidence validator
  -> pure custody classifier/projection
  -> atomic store command
  -> retained lifecycle + evidence overlay
  -> controller/public facade
  -> later read-only tab and viewport adapters
```

No DOM state participates in custody decisions.
