# LAFEA WP-MP3 — Qualified deterministic T6 producer and v2 mesh custody

WP-MP3 / issue #880 binds the existing deterministic continuum meshing kernel to the mesh-independent LAFEA.3 domain/geometry architecture introduced by WP-MP2.

## Authority path

```text
ANALYSIS_DOMAIN + ANALYSIS_GEOMETRY
        ↓
lafea-mesh-generation-intent/v2
        ↓
qualified MP3 T6 producer binding
        ↓
lafea-mesh-plan/v2 (preview only)
        ↓
existing constrained-delaunay-t6 kernel
        ↓
lafea-mesh-producer-output/v2
        ↓
lafea-analysis-mesh-evidence/v2
        ↓
domain-first retained mesh custody
```

The producer is executable programmatically through the canonical workbench API, but no Automatic Mesh UI control is enabled by this package.

## Qualified scope

MP3.1 is intentionally narrow:

- `LAFEA.3`;
- `T6`;
- one simple outer loop;
- straight-line and circular-arc boundaries;
- concave simple regions;
- deterministic boundary target-size discretization;
- analytic T6 midsides on circular boundaries;
- deterministic constrained triangulation;
- existing analysis-mesh quality gates;
- no holes;
- no local refinement;
- no Q8 recombination;
- no interior Steiner refinement.

The target element length therefore governs boundary discretization in MP3.1. It is not claimed as a strict global interior edge-length guarantee. The plan reports the actual characteristic-length envelope, and quality/current resource policy remains fail-closed.

Hole bridging is a separate qualification package (MP3H). The producer rejects hole loops explicitly rather than routing to the bounded lug/pinhole template.

## Profile identity

The repository's canonical mesh-profile contract already owns a deterministic `fnv1a64:*` semantic hash. MP2 had accidentally restricted the v2 mesh-profile parent to SHA-256 in the request/evidence path even though the domain-first lifecycle declares `meshProfileHash` as an opaque profile parent.

MP3 corrects that boundary: v2 mesh profile parent custody accepts the canonical profile semantic hash (`fnv1a64:*`) and retains SHA-256 compatibility for already-created MP2 request fixtures. No second profile identity is manufactured.

## Producer and qualification

Producer:

```text
id       = LAFEA_DOMAIN_FIRST_CDT_T6
revision = MP3.1
mode     = AUTOMATIC_MESH
family   = T6
```

The capability and qualification bind exact stage/family/mode scope, repeatability, quality policy, rollback/publication policy and explicit node/element/DOF ceilings. The producer binding is the first package that turns the MP1 contract-ready projection into actual mesh execution authority.

The input intent itself remains an immutable request record with `executionAuthorized=false`; execution authority comes from the separately qualified producer binding. This prevents a request object from becoming authority merely because a producer exists.

## Deterministic assembly

The core kernel returns element-local T6 point data. MP3 converts that output into one canonical shared-node analysis mesh:

- corner node identities follow deterministic source-corner order;
- one midside identity is allocated per unique corner edge;
- adjacent elements share the same midside node;
- boundary midsides preserve the kernel's analytic-curve position;
- interior midsides are exact chord midpoints;
- all LAFEA.3 node `z` coordinates are zero;
- element IDs are deterministic.

Planning performs a deterministic dry run and records counts, characteristic-length range, observed adjacent characteristic-size ratio, resource disposition and explicit scope limitations. The plan carries no mesh and has no engineering authority. Execution repeats generation and requires the canonical mesh hash to match the dry-run mesh hash before producing evidence.

## V2 mesh custody

The canonical orchestrator now owns a listener-free domain-first mesh state slice in addition to the historical retained-mesh slice.

Registration:

1. reconstructs full v2 evidence;
2. requires `CURRENT/PASS`;
3. checks exact source/domain/geometry parents;
4. detects exact replay idempotently;
5. rejects same-plan conflicting replay;
6. commits only after every check succeeds;
7. publishes through the existing single orchestrator boundary.

A later generation under a different plan may replace the current mesh for the same domain/geometry. The derived domain-first lifecycle is rebuilt through DOMAIN → GEOMETRY → new MESH, so future CANONICAL_MODEL/EXECUTION/RECOVERY descendants remain absent instead of being resurrected.

Source/domain/geometry custody-epoch changes do not delete historical mesh evidence, but make it stale. Hash reappearance alone cannot make the retained mesh current.

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

The next numerical package after MP3.1 is either MP3H hole bridging or feature-to-mesh physics projection, depending on the selected product sequence. Solver-model compilation remains downstream of both a current mesh and governed physics projection.
