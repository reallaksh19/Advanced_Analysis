# Bucket-01 Autonomous Phase Ledger

## Operating boundary

This ledger records autonomous work authorized for `bucket-01-cantilever-benchmark-route`. All work remains fail-closed. No frozen probe coordinate, stress tolerance, load, support, material, solver criterion, code-basis boundary, or qualification rule may be changed to obtain a pass.

`BUCKET_01_QUALIFIED` remains false.

## Completed integration

- Phase 1 probe-topology observability and receipt-retention fixes are integrated.
- Phase 2A Design V2 is frozen as `B01-PROBE-STABLE-POLAR-V2`.
- PR #518 candidate-only Phase 2B infrastructure is merged.
- The governed uniform production mesh route remains unchanged and retained as the rollback reference.

## Phase 2B Design V2 replay

The repository now contains:

- `src/core/lafea-meshing/lug-pinhole-probe-stable-t6-v2.js`
- `scripts/lafea-bucket-01-probe-stable-candidate-v2-check.mjs`

The Design V2 route retains analytic circular midsides only on the physical hole and outer boundaries. Internal circumferential, radial, and diagonal midsides are straight-chord midpoints.

The exact-head gate requires a four-level Design V2 rebuild and Phase 2C intake replay. No exact-head numerical pass is claimed until that command is executed in a complete checkout.

## Phase 2C intake and controlled replay preparation

The repository now requires:

1. candidate package evidence;
2. topology report evidence;
3. executed candidate rebuild validation;
4. executed topology recomputation validation.

A valid intake may produce only:

`CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW`

The controlled replay proposal contract retains the uniform route and exact rollback route. It does not authorize or apply a production switch.

## Phase 3 candidate replay adjudication

Candidate and reference replay results must:

- originate from the same exact head and Design V2 hash;
- retain identical hashes for coordinates, tolerances, loads, supports, material, solver policy, and code-basis boundary;
- include mesh quality, solver/equilibrium, global response, Kirsch, production stress, topology, and repository-gate results;
- have a passing uniform reference replay.

Allowed dispositions are:

- `REJECT_CANDIDATE_MESH_FAMILY`;
- `RETAIN_CANDIDATE_FOR_DIAGNOSTIC_USE_ONLY`;
- `ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW`.

Even the third disposition leaves production-switch, mesh, stress-acceptance, qualification, and Bucket-01 authority false.

## Phase 4 oscillatory-bound eligibility

The separate oscillatory screen is classified as:

`CONSERVATIVE_OSCILLATORY_TAIL_BOUND_NOT_GCI`

Eligibility requires at least four topology-compatible observations, strictly alternating nonzero differences, strictly decreasing difference magnitudes, and a governed maximum contraction ratio no greater than `0.8`.

The retained six three-level oscillatory sequences are regression cases and remain:

`ADDITIONAL_LEVEL_REQUIRED`

An eligible sequence still requires independent engineering authority. The repository does not claim GCI, observed order, stress acceptance, or qualification from this screen.

## Blocked Phase 3 implementation slice

The existing production projection constructs and hashes its own uniform ladder, binds stage documents to that ladder, and validates exact document/mesh/mapping ancestry. Therefore the candidate cannot be inserted by replacing a mesh array or using an environment-variable fallback.

A separate candidate projection adapter is required. It must:

- consume validated Design V2 packages;
- create candidate mesh evidence under candidate-only authority;
- rebuild stage documents and feature mappings against those exact meshes;
- retain the uniform route as the unchanged reference and rollback path;
- write complete blocked evidence before nonzero exit;
- remain outside the governed production route until exact-head replay adjudication passes.

## Remaining qualification gates

- complete exact-head Design V2 candidate replay;
- controlled candidate solver/stress replay and adjudication;
- unchanged stress-convergence acceptance or independently approved conservative bound;
- approved external direct-point code basis;
- three isolated deterministic replay bundles;
- final exact-head adjudication.

No production switch or qualification claim is authorized by this ledger.
