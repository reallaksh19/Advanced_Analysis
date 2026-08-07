# LAFEA WP-MP3 — Qualified deterministic T6 producer and v2 custody

WP-MP3 / issue #880 binds the existing deterministic continuum meshing kernel to the mesh-independent LAFEA.3 domain/geometry authority introduced by WP-MP2.

## Authority path

```text
ANALYSIS_DOMAIN + ANALYSIS_GEOMETRY
        ↓
lafea-mesh-generation-intent/v2
        ↓
qualified MP3 T6 producer binding
        ↓
lafea-mesh-plan/v2 (preview only, commits plannedMeshHash)
        ↓
existing constrained-delaunay-t6 kernel
        ↓
lafea-mesh-producer-output/v2
        ↓
lafea-analysis-mesh-evidence/v2
        ↓
producer execution receipt
        ↓
independent custody replay + atomic retained registration
```

The producer is executable programmatically through the canonical workbench API. No Automatic Mesh UI control is enabled by this package.

## Qualified scope

MP3.1 is intentionally narrow: LAFEA.3 / T6 / one simple outer loop, with straight-line and circular-arc boundaries and concave simple regions. It reuses the existing deterministic boundary discretization, constrained triangulation and analytic T6 boundary-midside kernel under the existing `MESH-QUALITY-POLICY-V1` gates.

Holes, local refinement, Q8 recombination and interior Steiner refinement are not qualified here. Hole loops fail closed and are reserved for MP3H. Target element length is a boundary-discretization control in MP3.1, not a claimed strict global interior edge-length guarantee; the plan reports actual characteristic lengths and the observed adjacent characteristic-size ratio.

## Profile identity

The canonical mesh-profile contract already owns a deterministic `fnv1a64:*` semantic hash. MP2 accidentally restricted the v2 mesh-profile parent to SHA-256 even though the lifecycle contract treats `meshProfileHash` as an opaque profile parent.

MP3 aligns v2 request/evidence custody with the canonical profile semantic hash while retaining SHA-256 compatibility for already-created MP2 fixtures. No second profile identity is created and no legacy profile hash is rewritten.

## Producer qualification

```text
id       = LAFEA_DOMAIN_FIRST_CDT_T6
revision = MP3.1
mode     = AUTOMATIC_MESH
family   = T6
policy   = MESH-QUALITY-POLICY-V1
```

Capability and qualification bind the exact stage/family/mode, repeatability, rollback/publication policy and node/element/DOF ceilings. The generation intent remains a request with `executionAuthorized=false`; execution authority comes only from the qualified producer binding.

## Deterministic plan and output

Planning performs a dry run and creates `lafea-mesh-plan/v2`. The plan remains `producesMesh=false` and `engineeringAuthority=false`, but commits to the dry-run canonical mesh through `plannedMeshHash` as well as counts, characteristic lengths, adjacent-size ratio, resource disposition and limitations.

Execution regenerates independently. The second canonical mesh hash must equal `plannedMeshHash`. Producer-output validation reconstructs the analysis mesh, proves exact intent/plan/capability/qualification/producer parents, and checks both requested and qualified node/element/DOF ceilings.

The kernel's element-local T6 points are assembled into one shared-node canonical mesh with deterministic corner IDs, one midside ID per unique corner edge, shared midsides across adjacent elements, analytic circular-boundary midsides, chord-midpoint interior midsides, deterministic element IDs and `z=0` for every LAFEA.3 node.

## Execution-receipt custody

Raw v2 mesh evidence is inspectable but is not sufficient for domain-first custody. Domain-first registration requires the full `lafea-domain-first-t6-producer-execution/v1` receipt containing intent, plan, producer output and evidence.

Before any retained-state mutation, custody:

1. reconstructs the evidence;
2. requires a qualified/custody-eligible execution receipt;
3. independently re-plans from the current retained analysis domain, geometry evidence and canonical mesh profile;
4. requires the submitted plan hash to equal that reproduced plan;
5. validates output against the reproduced plan and intent;
6. requires output mesh hash to equal `plannedMeshHash`;
7. proves evidence/output agreement for mesh, plan, capability, qualification, producer and profile parents;
8. verifies exact current source/domain/geometry parents;
9. preflights the complete derived lifecycle replacement;
10. only then commits retained receipt/evidence and publishes through the existing canonical orchestrator.

Exact receipt replay is idempotent. A conflicting result for the same plan fails closed. A new qualified plan may replace the current mesh for the same domain/geometry. The lifecycle is rebuilt through DOMAIN → GEOMETRY → new MESH, so later CANONICAL_MODEL/EXECUTION/RECOVERY descendants are not resurrected.

The custody epoch is part of currentness. Source/domain/geometry revalidation cannot make historical mesh evidence current merely because hashes reappear. Domain-first export/recovery uses the full producer execution receipt so the complete custody chain can be replayed.

## Explicit non-claims

```text
holeMeshing                    = false
meshRefinementExecution        = false
featureToMeshPhysicsProjection = false
solverModelCompilation         = false
solverExecution                = false
resultRecovery                 = false
automaticMeshUiEnabled         = false
manualRefinementUiEnabled      = false
codeReportAuthority            = false
releaseQualified               = false
```

The immediate follow-on is MP3H for deterministic hole/multi-loop T6 meshing. Feature-to-mesh physics projection and solver-model compilation remain downstream of a qualified current mesh.
