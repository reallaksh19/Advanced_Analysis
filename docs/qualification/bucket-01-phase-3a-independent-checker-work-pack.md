# Bucket-01 Phase 3A Independent Checker Work Pack

## Objective

Implement a separately authored verifier for the candidate mesh and controlled-replay artifact chain. The checker must not call the candidate mesh generator, candidate package validator, candidate topology observer, or midside transformation helpers.

## Required inputs

- final candidate mesh node and element arrays;
- candidate design record and exact-head SHA;
- candidate intake evidence;
- replay artifact manifest;
- frozen production-response and fixed-probe specifications.

## Required independent reconstruction

- classify T6 edges from connectivity and corner geometry;
- verify analytic midsides only on physical hole/outer boundaries;
- verify chordal midsides on internal circumferential, radial, and diagonal edges;
- recompute corner-scaled, integration-point, and dense-sampled Jacobians;
- reconstruct exact 20–60 mm load and restraint windows at every level;
- recompute containing element, natural coordinates, mapping residual, natural margin, and topology signature for all seven frozen locations;
- recompute semantic and raw-file hashes and artifact ancestry;
- derive replay check statuses from validated artifacts rather than trusting submitted PASS/BLOCKED flags.

## Artifact-manifest minimum fields

Each artifact entry must retain:

- `artifactId`
- `artifactScope`
- `schema`
- `producerRevision`
- `routeId`
- `levelOrdinal`
- `exactHeadSha`
- `designHash`
- `parentArtifactHashes`
- `semanticHash`
- `rawFileHash`
- `relativePath`
- `validationStatus`

Allowed artifact scopes:

- `CANDIDATE_MESH_BOUND`
- `REFERENCE_MESH_BOUND`
- `REPOSITORY_REGRESSION`
- `EXECUTION_ENVIRONMENT`

## Required authority

The resulting evidence must retain:

- `executedRecomputation: true`
- `independentCheckerExecution: true`
- `productionSwitchAuthorized: false`
- `productionMeshAuthority: false`
- `stressAcceptanceAuthority: false`
- `qualificationAuthority: false`
- `bucketQualified: false`

## Negative cases

At minimum reject:

- altered mesh node or connectivity hash;
- curved internal circumferential midside;
- chordal physical-boundary midside;
- missing 60 mm radial breakpoint;
- load or restraint edge outside the exact 20–60 mm physical window;
- altered frozen-input hash;
- stale exact-head or design hash;
- detached stage-document or mapping-package ancestry;
- manually supplied PASS map inconsistent with artifact validators;
- any authority escalation.

## Scope boundary

Do not revise the mesh design, stage-document adapter, solver, production replay, loads, supports, coordinates, tolerances, convergence method, code-basis boundary, or qualification state.

## Exit gate

The task exits only when all four candidate meshes and replay artifact relationships are independently reconstructed, all tamper cases block, and no production or qualification authority is granted.
