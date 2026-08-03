# Bucket-01 Phase 2C Integration Contract

## Purpose

Phase 2C decides whether a completed Phase 2B candidate mesh family is eligible for a controlled production-integration replay. Candidate acceptance does not itself authorize production use, stress acceptance, or Bucket-01 qualification.

## Required Phase 2B artifacts

The intake requires two exact-head, design-bound artifacts:

1. `lafea-bucket-01-probe-stable-candidate-mesh-package/v1`
2. `lafea-bucket-01-probe-stable-candidate-topology-report/v1`

Both artifacts must carry canonical semantic hashes, the same exact-head SHA, the frozen Phase 2 design hash, and authority fields that remain false for production, stress acceptance, qualification, and Bucket-01 status.

## Intake gate

The Phase 2C intake contract verifies:

- exact custody agreement between candidate package, topology report, design, and head SHA;
- the four frozen candidate sizes: 480, 1,190, 4,080, and 13,992 T6 elements;
- seven frozen probe/path locations at every candidate level;
- complete topology proof with exactly one containing element per location;
- positive Jacobians, stable triangle side and orientation, compatible explicit lineage, and reported natural-coordinate drift;
- minimum candidate natural-coordinate margin of `0.05`;
- absence of any production-authority escalation.

Successful intake produces only:

`CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW`

It does not produce a production mesh ladder or numerical qualification evidence.

## Production-switch decision

A production switch may be proposed only after the Phase 2B artifacts pass intake. The switch must be a separately reviewed commit that:

- replaces no frozen coordinate, tolerance, load, support, material, solver criterion, or code-basis boundary;
- changes the production mesh source explicitly rather than through environment variables or fallback selection;
- retains the existing uniform ladder as a named reference route until the candidate replay is adjudicated;
- binds all generated production evidence to one new exact-head SHA;
- keeps `BUCKET_01_QUALIFIED` false;
- provides a rollback commit or deterministic configuration path.

## Required replay after a controlled switch

The controlled candidate production replay must regenerate, at one exact head:

- mesh-quality evidence;
- solver and equilibrium evidence;
- global-response convergence;
- Kirsch fixed-probe evidence;
- production lug fixed-location and path evidence;
- topology audit evidence;
- build, import-boundary, patch-hygiene, and tracked-worktree checks.

The candidate replay must be compared against the prior uniform route without using the prior result to change coordinates or tolerances.

## Adjudication boundary

After replay, Phase 2C may recommend one of three dispositions:

- `REJECT_CANDIDATE_MESH_FAMILY`
- `RETAIN_CANDIDATE_FOR_DIAGNOSTIC_USE_ONLY`
- `ACCEPT_CANDIDATE_AS_GOVERNED_PRODUCTION_MESH_FAMILY`

The third disposition still does not qualify Bucket 1. Stress convergence, external code basis, and three isolated replay-custody gates remain independently mandatory.
