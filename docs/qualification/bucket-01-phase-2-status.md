# Bucket-01 Phase 1 Fixes and Phase 2A Status

Implementation prerequisite head for this status record: `be956bc8fba59c50c64c2b6f621ecda4e24e4d2b`.

## Phase 1 corrections

- Parent-cell lineage now terminates at the governed `2 × 16` base and does not append a phantom `1 × 8` level.
- The production lug receipt no longer asserts governed natural-margin or topology-metadata outcomes before the topology audit.
- Mapping-residual acceptance is retained as an explicit location reason.
- A complete `BLOCKED` receipt is written before nonzero exit for governed topology, recovery, or stress-convergence failures.
- The topology check now covers exact lineage for `2 × 16`, `4 × 32`, `8 × 64`, and `16 × 128` and includes an anti-drift check for receipt retention ordering.

## Phase 2A design contract

Added a deterministic probe-stable polar-axis planner and frozen design contract.

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

The Phase 2A planner is design-only. It has no production mesh, stress acceptance, or qualification authority.

## Remaining execution boundary

The repository still requires a real checkout execution of:

```bash
npm ci
node scripts/lafea-bucket-01-exact-head-check.mjs
```

No exact-head runtime pass is claimed in this record. Phase 2B is the candidate nonuniform T6 mesh generator and topology proof described in `docs/qualification/bucket-01-phase-2b-agent-work-pack.md`.
