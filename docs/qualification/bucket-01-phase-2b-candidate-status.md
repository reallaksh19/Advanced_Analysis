# Bucket-01 Phase 2B Candidate Mesh Status

Issue: #510

Implementation branch: `agent/phase-2b-probe-stable-t6`

Base head: `b92484cab11519691784a8666f1db445fb247360`

## Scope retained

This implementation is candidate-only. It does not replace the governed production mesh ladder and does not change frozen probe coordinates, stress tolerances, loads, supports, solver criteria, convergence rules, code-basis boundaries, workflow triggers, final adjudication, or qualification status.

Every candidate package and topology observation retains:

- `productionMeshAuthority: false`
- `stressAcceptanceAuthority: false`
- `qualificationAuthority: false`
- `bucketQualified: false`

## Implemented evidence

The candidate generator consumes the frozen nonuniform radial and circumferential axis plans and generates conforming annular T6 meshes with shared midside identities, analytic circumferential midsides, chord radial/diagonal midsides, invariant counter-clockwise `A`/`B` triangles, explicit anchor-cell sidecars, parent anchor-cell identities, deterministic semantic hashes, and rebuild validation.

The focused candidate check retains:

- all four requested candidate meshes;
- all seven frozen probe/path topology histories;
- natural-coordinate drift for every level transition;
- exact cardinal feature nodes at 0°, 90°, 180°, and 270°;
- scaled, integration-point, and dense-sampled Jacobian evidence;
- aspect ratio, minimum angle, area, and boundary-radius evidence;
- all required fail-closed negative cases; and
- a complete `BLOCKED` report before nonzero exit.

## Candidate counts

| Level | Radial cells | Circumferential cells | T6 elements | Candidate result |
|---:|---:|---:|---:|---|
| 1 | 12 | 20 | 480 | BLOCKED |
| 2 | 17 | 35 | 1,190 | PASS |
| 3 | 30 | 68 | 4,080 | PASS |
| 4 | 53 | 132 | 13,992 | PASS |

## Topology result

All seven frozen locations remain in exactly one element, retain counter-clockwise `B`-triangle topology, preserve explicit radial and circumferential anchor lineage, avoid nodes, edges, diagonals, and protected feature lines, and exceed the candidate natural-coordinate margin target of `0.05`.

The minimum observed natural-coordinate margin is approximately `0.22796`. The governed production margin remains unchanged at `0.0001`.

## Blocking mesh-quality result

The frozen Level-1 design fails the existing positive-Jacobian boundary:

- controlling element: `E-R10-S18-B`;
- minimum scaled Jacobian: `-0.02456338158182484`;
- minimum dense-sampled Jacobian: `-28.859125475953192`;
- non-positive dense-Jacobian samples: `24`;
- minimum integration-point Jacobian remains positive: `5.190885874372948`.

Levels 2–4 have positive scaled, integration-point, and dense-sampled Jacobians.

The Level-1 package is therefore retained as `CANDIDATE_MESH_BLOCKED`. The implementation does not relax the Jacobian rule, change the frozen axis design, switch production authority, or claim the Phase 2B exit gate.

## Negative cases

The focused check rejects all required cases:

- unordered or duplicate radial coordinates;
- angular span other than 360°;
- missing cardinal feature breakpoint;
- protected breakpoint inside an anchor window;
- probe anchor emitted as a gridline;
- overlapping anchor windows;
- non-positive Jacobian;
- tampered coordinate hash;
- tampered mesh hash; and
- candidate package presented as production-authoritative.

## Validation custody

Executed in the focused reconstructed module harness:

```text
node --check src/core/lafea-meshing/lug-pinhole-probe-stable-t6.js     PASS
node --check scripts/lafea-bucket-01-probe-stable-candidate-mesh-check.mjs PASS
node scripts/lafea-bucket-01-probe-stable-mesh-design-check.mjs       PASS
node scripts/lafea-bucket-01-probe-stable-candidate-mesh-check.mjs    BLOCKED as designed
```

The candidate command returned nonzero because Level 1 failed its Jacobian gate; it still wrote the complete blocked report.

A full repository checkout has not executed the exact-head, topology-regression, or repair suites for this branch. No exact-head runtime pass or Bucket-01 qualification is claimed.

## Disposition

Phase 2B implementation infrastructure is present, but the Phase 2B exit gate remains blocked by the frozen Level-1 candidate mesh validity defect. A controlled design revision is required before any Phase 2C production-integration decision.
