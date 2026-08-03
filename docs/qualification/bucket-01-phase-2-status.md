# Bucket-01 Phase 1 Fixes and Phase 2 Status

## Phase 1 corrections

- Parent-cell lineage now terminates at the governed `2 × 16` base and does not append a phantom `1 × 8` level.
- The production lug receipt no longer asserts governed natural-margin or topology-metadata outcomes before the topology audit.
- Mapping-residual acceptance is retained as an explicit location reason.
- A complete `BLOCKED` receipt is written before nonzero exit for governed topology, recovery, or stress-convergence failures.
- The topology check covers exact lineage for `2 × 16`, `4 × 32`, `8 × 64`, and `16 × 128` and includes an anti-drift check for receipt-retention ordering.

## Phase 2A design contract

A deterministic probe-stable polar-axis planner and frozen design contract are present.

- Radial anchor values: `27, 33, 47, 73, 87 mm`.
- Angular anchor values: `17°, 67°, 83°`.
- Radial target phase: `0.35`.
- Circumferential target phase: `0.65`.
- Parametric diagonal separation: `0.30`.
- Anchor-cell widths contract by an exact factor of two per level.
- Background transition coordinates are deterministic.
- Exact feature lines at `0°, 90°, 180°, 270°` are retained.
- Frozen coordinates, tolerances, loads, solver criteria, and code-basis boundaries remain unchanged.

Candidate design cell counts are:

| Level | Radial cells | Circumferential cells | Candidate T6 elements |
|---:|---:|---:|---:|
| 1 | 12 | 20 | 480 |
| 2 | 17 | 35 | 1,190 |
| 3 | 30 | 68 | 4,080 |
| 4 | 53 | 132 | 13,992 |

The Phase 2A planner is design-only. It has no production mesh, stress-acceptance, or qualification authority.

## Phase 2B execution

Phase 2B is assigned separately under issue #510. Its scope remains candidate-only nonuniform T6 mesh generation, topology proof, mesh-quality evidence, negative cases, and exact artifact custody. It must not switch production execution.

The Phase 2B output must conform to the Phase 2C artifact interface after integration.

## Phase 2C intake preparation

Phase 2C is tracked under issue #511. The following contracts are committed:

- `validation/bucket-01/14-probe-stable-candidate-intake-policy.json`
- `src/workspace/lafea-bucket-01-probe-stable-candidate-intake.js`
- `scripts/lafea-bucket-01-probe-stable-candidate-intake-contract-check.mjs`
- `docs/qualification/bucket-01-phase-2c-integration-contract.md`

Phase 2C requires four exact-head, design-bound artifacts:

- candidate mesh package;
- candidate topology report;
- executed candidate rebuild-validation evidence;
- executed topology recomputation evidence.

Self-attested PASS summaries are rejected. The intake requires recomputation of coordinate, feature-set, quality, package, location, and topology evidence before it can emit:

`CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW`

That disposition does not authorize a production switch. All production, stress-acceptance, qualification, and Bucket-01 authority fields remain false.

## Remaining execution boundary

The repository still requires a real checkout execution of:

```bash
npm ci
node scripts/lafea-bucket-01-exact-head-check.mjs
```

No exact-head runtime pass is claimed in this record. `BUCKET_01_QUALIFIED` remains false.
