# WP-MP2 — Mesh-independent LAFEA.3 analysis domain and geometry custody

WP-MP2 establishes the pre-mesh engineering authority required before a general LAFEA.3 mesher can exist. It does not generate a mesh, qualify a producer, project feature loads to mesh entities, compile a solver model, execute a solver, recover results, or qualify release.

## Architectural boundary

The historical LAFEA.3 path remains unchanged for already-qualified caller/source-mesh workflows. MP2 adds an explicit opt-in domain-first profile inside the same canonical workbench orchestrator:

```text
SOURCE
  -> ANALYSIS_DOMAIN
  -> ANALYSIS_GEOMETRY
  -> PREPARATION v2
  -> ANALYSIS_MESH v2
  -> CANONICAL_MODEL (future compiled solver model)
  -> AUTHORIZATION
  -> EXECUTION / RESULTS
```

`ANALYSIS_DOMAIN` is the pre-mesh MODEL authority. `CANONICAL_MODEL` retains its existing solver-facing meaning and is never reinterpreted as a domain.

Activation is explicit through `activateDomainFirstProfile()`. Merely restoring an old source hash does not reactivate retained engineering evidence.

## Geometry contract

`lafea-analysis-geometry/v1` supports only deterministic planar primitives:

- explicit vertices;
- straight line segments;
- circular arcs with explicit center, radius and CW/CCW sweep;
- exactly one outer loop;
- zero or more holes.

The canonical orientation policy is `OUTER_CCW_HOLES_CW_V1`.

The topology validator rejects:

- unknown/duplicate vertices, segments or loops;
- zero-length lines;
- inconsistent or degenerate arcs;
- disconnected/open loops;
- segment reuse across loops;
- orphan segments;
- self-intersections;
- loop intersections;
- overlapping coincident primitives;
- holes outside the outer region;
- unsupported nested holes.

Vertices and segments are geometry features, never analysis-mesh nodes or element edges.

## Mesh-independent physical domain

`lafea-continuum-analysis-domain/v1` binds:

- exact source SHA-256;
- application reference;
- canonical units;
- plane-stress or plane-strain formulation;
- one region and one material reference;
- exact analysis-geometry identity/hash;
- stable vertex/segment/region feature inventories;
- physical case IDs;
- feature-bound physics declarations.

Allowed declarations are restraints, imposed displacements, concentrated loads, traction, pressure, body force and temperature. Their target type is constrained by declaration kind.

Payloads containing `nodeId`, `elementId`, mesh hashes or canonical solver-model hashes are rejected. MP2 does not manufacture mesh entity IDs.

## Domain-first lifecycle

`FEA_DOMAIN_FIRST_V1` is a separate explicit lifecycle authority, not a reinterpretation of the historical `FEA_MESH_RECOVERY_V1` record.

Its lineage is:

```text
ANALYSIS_DOMAIN(sourceHash)
ANALYSIS_GEOMETRY(sourceHash, analysisDomainHash)
ANALYSIS_MESH(analysisDomainHash, analysisGeometryHash, meshProfileHash)
CANONICAL_MODEL(sourceHash, analysisDomainHash, analysisGeometryHash, meshHash, physicalProjectionProfileHash)
EXECUTION(canonicalModelHash, meshHash, physicalLoadCaseHash, solverProfileHash)
RECOVERY(executionHash, meshHash, recoveryProfileHash)
CONVERGENCE(recoveryHash, recoverySetHash, convergenceProfileHash)
REPORT_EVIDENCE(...)
```

MP2 only creates/registers the first two artifact kinds.

## Retained custody and non-resurrection

The canonical orchestrator owns one listener-free geometry state slice. It retains:

- current domain record;
- current geometry evidence;
- explicit domain-first lifecycle state;
- custody epoch.

Every engineering source/document transition advances the epoch while retaining prior evidence for audit. A later undo or re-import that recreates an old source hash therefore leaves the retained records stale. Explicit domain and geometry reconstruction/re-registration is required before they become current again.

Registration is exact-replay idempotent and conflicting replay fails closed.

## V2 requests and mesh evidence

MP2 introduces explicit domain-first schemas rather than repurposing v1 `canonicalModelHash` fields:

```text
lafea-preparation-request/v2
lafea-mesh-generation-intent/v2
lafea-analysis-mesh-intake/v2
lafea-analysis-mesh-authority/v2
lafea-analysis-mesh-evidence/v2
lafea-mesh-producer-readiness/v2
```

The v2 generation intent binds `sourceHash + analysisDomainHash + analysisGeometryHash + meshProfileHash + stage-adapter identity/revision`.

It remains:

```text
status = UNEXECUTABLE_INTENT
executionAuthorized = false
producerRef = null
producesMesh = false
```

The MP1 capability/qualification boundary can evaluate a v2 intent without synthesizing a v1 `canonicalModelHash`. Readiness remains non-executable until a later package binds a real producer implementation.

## Workbench behavior

When domain-first mode is active:

- MODEL derives from retained current `ANALYSIS_DOMAIN`;
- PREPARATION uses the v2 domain/geometry parent model and remains blocked because no v2 diagnostic producer is qualified;
- DISCRETIZATION ignores historical v1 mesh custody and remains absent until v2 custody is implemented by a later producer package;
- AUTHORIZATION additionally requires a current solver-facing `CANONICAL_MODEL`;
- legacy `run()` is blocked;
- legacy v1 mesh registration is blocked.

The existing source-mesh path is unchanged when domain-first mode is not active.

## Authority boundary

```text
meshIndependentDomainContract   = authorized
analysisGeometryContract        = authorized
analysisGeometryCustody         = authorized
featureAttachmentDeclarations   = authorized
meshGenerationIntentV2          = authorized, non-executable
analysisMeshEvidenceV2Contract  = authorized, no producer bound
realMeshGeneration              = false
meshRefinementExecution         = false
featureToMeshPhysicsProjection  = false
solverModelCompilation          = false
solverExecution                 = false
resultRecovery                  = false
codeReportAuthority             = false
releaseQualified                = false
```

The next package may implement a deterministic LAFEA.3 T6 producer behind the MP1 boundary, but only against current v2 domain/geometry parents. T3 remains benchmark/fallback-only and is not promoted by MP2.
