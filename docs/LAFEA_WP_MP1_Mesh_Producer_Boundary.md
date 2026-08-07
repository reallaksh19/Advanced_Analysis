# WP-MP1 — Qualified deterministic LAFEA mesh-producer boundary

WP-MP1 defines the trust and authority boundary required before a general LAFEA mesh producer may be implemented. It does not generate a mesh, qualify a real producer, enable automatic meshing, mutate lifecycle custody, execute a solver, or promote release authority.

## Dependency direction

```text
current stage/lifecycle
  -> mesh generation intent
  -> producer capability
  -> producer qualification
  -> producer readiness
  -> preview-only mesh plan
  -> producer output envelope
  -> existing analysis-mesh validation / quality / custody
```

The existing generation intent remains `UNEXECUTABLE_INTENT`. MP1 readiness can prove that a request is compatible with a capability and qualification contract, but it deliberately returns `executionAuthorized=false` until a later package binds a real implementation.

## Capability and qualification

A capability records exact stage/family scope, deterministic generation modes, repeatability policy, quality-policy identity, rollback/publication policy, local-refinement support and hard resource ceilings. A capability record is descriptive and cannot self-qualify.

A qualification record binds the exact capability hash and may only narrow scope and resource limits. It cannot widen stages, element families, generation modes, local-refinement authority, resource ceilings or policy identities.

No production capability or qualification instance is registered by MP1.

## Mesh plan

`lafea-mesh-plan/v1` is preview evidence only. It binds exact generation-intent, capability, qualification and engineering-parent identities and may carry deterministic planning estimates. The stable invariants are:

```text
producesMesh = false
engineeringAuthority = false
```

A plan cannot enter `ANALYSIS_MESH` custody.

## Producer output envelope

`lafea-mesh-producer-output/v1` reconstructs the returned `lafea-analysis-mesh/v1` through the existing canonical analysis-mesh contract and recomputes the exact mesh content hash and output hash. Validation additionally checks producer identity/revision, plan lineage, parent identities, element family and qualified resource ceilings.

The output envelope still carries:

```text
lifecycleAuthority = false
```

A later implementation package must explicitly route a validated output through the existing quality/evidence/custody transaction. MP1 does not perform that registration.

## Next package

WP-MP2 should implement the first real deterministic producer for `LAFEA.3` / `T3`, qualify only that exact capability, and integrate its validated output with existing `ANALYSIS_MESH` evidence custody. T6 elevation, local refinement, UI activation and shell meshing should remain separate work packages.
