# Bucket-01 Phase 2B Agent Work Pack

## Objective

Implement and verify a **candidate-only** nonuniform probe-stable T6 annular mesh generator from the frozen Phase 2A Design V2.

This work must not replace the governed production mesh, change acceptance criteria, or claim Bucket-01 qualification.

## Governing inputs

- `validation/bucket-01/13-probe-stable-polar-mesh-design.json`
- `src/workspace/lafea-bucket-01-probe-stable-axis-plan.js`
- `validation/bucket-01/08-production-lug-fixed-probe-spec.json`
- current uniform reference generator: `src/core/lafea-meshing/lug-pinhole-t6.js`

The current Phase 2 design produces these candidate element counts:

| Level | Radial cells | Circumferential cells | T6 elements |
|---:|---:|---:|---:|
| 1 | 12 | 20 | 480 |
| 2 | 17 | 35 | 1,190 |
| 3 | 30 | 68 | 4,080 |
| 4 | 53 | 132 | 13,992 |

These counts are candidate-design evidence, not production acceptance values.

## Design V2 correction

Design V1 placed every circumferential midside on an analytic circular arc. The Level-1 combination of a thin radial cell and a 22.5-degree background sector inverted the curved internal edge of `E-R10-S18-B`.

Design V2 changes only the midside geometry policy:

- hole-boundary circumferential midsides: analytic circular arc;
- outer-boundary circumferential midsides: analytic circular arc;
- internal circumferential midsides: straight chord midpoint;
- radial and diagonal midsides: straight chord midpoint.

Internal radial rings are mesh partitions, not physical circular boundaries. No physical boundary geometry, axis coordinate, anchor window, phase, frozen location, candidate count, tolerance, load, solver criterion, or authority field is changed.

## Required implementation

Create a bounded generator, preferably:

- `src/core/lafea-meshing/lug-pinhole-probe-stable-t6.js`
- `scripts/lafea-bucket-01-probe-stable-candidate-mesh-check.mjs`

The generator must:

1. Consume the radial and circumferential coordinate arrays produced by the frozen axis planner.
2. Generate one conforming annular tensor-product cell grid split into the same counter-clockwise T6 `A`/`B` triangles as the current generator.
3. Share midside nodes by exact edge identity.
4. Apply the Design V2 midside geometry policy exactly: analytic arc midsides only on the physical hole and outer boundaries; straight-chord midsides on internal circumferential, radial, and diagonal edges.
5. Preserve exact feature lines at 0°, 90°, 180°, and 270°.
6. Retain explicit axis-cell metadata, anchor-cell IDs, and parent anchor-cell IDs in a candidate mesh sidecar. Do not infer nonuniform parentage using `floor(fineIndex / ratio)`.
7. Produce deterministic package and semantic hashes and support exact rebuild validation.
8. Bind the package to `B01-PROBE-STABLE-POLAR-V2` and retain the midside geometry policy in semantic custody.
9. Keep all authority fields explicit:
   - `productionMeshAuthority: false`
   - `stressAcceptanceAuthority: false`
   - `qualificationAuthority: false`
   - `bucketQualified: false`

## Required topology proof

For every frozen probe and path station across all four candidate levels, the candidate check must prove:

- exactly one containing T6 element;
- unchanged physical coordinates;
- positive Jacobian and counter-clockwise orientation;
- stable `A`/`B` triangle side;
- stable orientation;
- radial anchor-cell lineage matches the design sidecar;
- circumferential anchor-cell lineage matches the design sidecar;
- no probe lies on a node, edge, protected feature line, or cell diagonal;
- minimum natural-coordinate margin is at least `0.05` as a **candidate design target**, without changing the governed production tolerance;
- natural-coordinate drift is reported for every transition;
- exact cardinal feature nodes are present at each radial ring.

If any candidate location fails, retain a complete `BLOCKED` candidate report and stop. Do not adjust a frozen coordinate or tolerance to obtain a pass.

## Mesh-quality proof

Use the existing T6 quality utilities and report at every candidate level:

- minimum scaled Jacobian;
- minimum integration-point Jacobian;
- minimum dense-sampled Jacobian and non-positive sample count;
- maximum aspect ratio;
- minimum corner angle;
- integrated area and relative area error;
- hole and outer-boundary radius errors.

Every element must retain positive corner-scaled, integration-point, and dense-sampled Jacobians. Use existing governed quality limits where already defined. Do not introduce a new acceptance threshold merely to pass the candidate.

The candidate check must also prove that analytic circular midsides occur only on the two physical circular boundaries and that internal circumferential midsides equal exact chord midpoints.

## Required negative cases

The candidate check must reject:

- unordered or duplicate radial coordinates;
- an angular span other than exactly 360°;
- missing cardinal feature breakpoints;
- a protected breakpoint inside an anchor window;
- a probe anchor emitted as a gridline;
- overlapping anchor windows;
- non-positive Jacobian;
- analytic-arc midside placement on an internal circumferential edge;
- straight-chord midside placement on the hole or outer physical boundary;
- tampered coordinate, geometry-policy, or mesh hashes;
- a candidate package presented as production-authoritative.

## Scope boundary

Do not modify:

- frozen probe/path coordinates;
- stress or solver tolerances;
- loads, supports, material data, or code-basis boundaries;
- production mesh ladder specifications;
- convergence acceptance logic;
- final adjudication or `BUCKET_01_QUALIFIED`;
- hosted workflow trigger policy.

Do not wire the candidate generator into the production solve in this work pack.

## Required validation

Run and retain raw summaries for:

```bash
node --check src/core/lafea-meshing/lug-pinhole-probe-stable-t6.js
node --check scripts/lafea-bucket-01-probe-stable-candidate-mesh-check.mjs
node scripts/lafea-bucket-01-probe-stable-mesh-design-check.mjs
node scripts/lafea-bucket-01-probe-stable-candidate-mesh-check.mjs
node scripts/lafea-bucket-01-probe-topology-check.mjs
node scripts/lafea-bucket-01-repair-check.mjs
git diff --check
git status --short
```

A full exact-head run remains required after integration. No command not actually executed may be reported as passing.

## Exit gate

Phase 2B is complete only when the Design V2 candidate mesh package, executed rebuild evidence, retained topology report, and topology recomputation evidence pass all four levels while production authority remains false. The subsequent Phase 2C work will decide whether to integrate the candidate family into governed production execution and will require an exact-head numerical replay.
