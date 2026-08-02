# LAFEA Bucket B7D — Controlled Continuum Controller

## 1. Work package

B7D implements the first bounded continuum execution controller for exactly:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It consumes the merged B7C contracts and does not authorize another continuum template, any shell route, code assessment, release qualification, or general T7D.

## 2. Public boundary

The non-UI public surface is:

```text
src/workspace/lafea-controlled-continuum-public.js
```

The controller reaches the retained composition root only through:

```text
src/workspace/lafea-controlled-continuum-stage-route.js
```

That route delegates to the existing `executeLafeaStage('LAFEA.3', ...)` public stage boundary. The controller does not import `calculateLocalContinuum` or private solver modules.

UI modules are not given a controller callback. They may continue to edit/import stage source and display independently produced evidence, but they may not invoke B7D or bypass it through `executeLafeaStage`.

## 3. Required authority parents

Every request is rejected unless all of the following reconstruct as current and mutually consistent:

1. B1 release record:
   - template `C2D-LUG-PINHOLE`;
   - target `LAFEA.3`;
   - `authorityState = ENGINE_EXECUTABLE`;
   - `validity = CURRENT`;
   - `releaseQualified = false`.
2. B2 target compatibility:
   - provided receipt is `CURRENT`;
   - independently reconstructed current receipt has the same semantic hash;
   - stage registry, composition root, and lifecycle profile hashes remain current.
3. B7A mapping package:
   - `MAPPING_EVIDENCE_QUALIFIED`;
   - bound caller mesh is `BOUND`;
   - exact source, stage-source, canonical-model, geometry, mesh, and source-authority parents match.
4. B7B benchmark qualification:
   - `BENCHMARK_EVIDENCE_QUALIFIED`;
   - its mapping-package parent is the current B7A package;
   - its convergence-profile parent is the B7C request parent.
5. B7C request:
   - exact immutable request hash;
   - unchanged imported document revision;
   - exactly three distinct T6 mesh/profile parents;
   - retained integration-point recovery profile;
   - no caller-supplied source hash or lifecycle evidence hash.

## 4. Execution sequence

The controller performs the following sequence synchronously and fail-closed:

```text
validate exact B7C request
-> validate B1 release
-> reconstruct B2 compatibility from current authority
-> validate B7A mapping and B7B benchmark parents
-> normalize and revision-check imported LAFEA.3 source
-> issue one authoritative editable-stage source record
-> create CANONICAL_MODEL lifecycle evidence
-> create ANALYSIS_GEOMETRY lifecycle evidence
-> for each of three increasing T6 levels:
     reconstruct NB-T4A mesh evidence
     require current source/model/geometry parents
     require source-to-mesh coordinate/connectivity identity
     register ANALYSIS_MESH
     invoke retained LAFEA.3 stage route
     reconstruct local-continuum result hashes
     require result-to-mesh connectivity identity
     retain integration-point recovery only
     register EXECUTION
     register RECOVERY
     create immutable B7C level evidence
-> evaluate B7C three-level pilot convergence
-> register CONVERGENCE only after accepted convergence
-> emit immutable B7C receipt
```

A failed earlier step cannot be converted into downstream evidence.

## 5. Source and mesh authority

One source authority is issued from the unchanged imported level-one stage source. All three mesh records must:

- use the same exact source hash;
- use the same canonical-model and analysis-geometry hashes;
- reconstruct as current NB-T4A evidence;
- contain T6 elements only;
- match their declared B7C mesh/profile parents;
- have strictly increasing element counts.

The level-one mesh must be the mesh bound by B7A. Higher refinement meshes remain separately governed NB-T4A evidence; the controller does not generate them.

## 6. Numerical and recovery evidence

Each level is executed through the retained LAFEA.3 composition route. A level is accepted only when:

- stage status is `QUALIFIED`;
- result schema is `local-continuum-result/v1`;
- result qualification state is `ACCEPTED`;
- every retained result hash reconstructs exactly;
- result element connectivity matches the governed mesh;
- every T6 element retains non-empty Gauss-point recovery at `INTEGRATION_POINT`.

The controller does not call nodal projection, averaging, smoothing, SCL, or structural-stress extraction. `projectedDisplayHash` remains `null` and `projectedDisplayRole` remains `NOT_PRODUCED` in B7C level evidence.

## 7. Lifecycle semantics

The retained `FEA_MESH_RECOVERY_V1` lifecycle is used without modification:

```text
CANONICAL_MODEL
-> ANALYSIS_GEOMETRY
-> ANALYSIS_MESH
-> EXECUTION
-> RECOVERY
-> CONVERGENCE
```

Registering the next mesh invalidates the previous level's execution/recovery descendants. After the third level, the final mesh, execution, and recovery are current. `CONVERGENCE` is registered only when the B7C receipt authorizes registration with exact parents:

```text
recoveryHash
recoverySetHash
convergenceProfileHash
```

## 8. Readiness split

B7D preserves the following independent states:

```text
calculationAccepted = all three stage calculations accepted
recoveryReady       = all three levels retain integration-point recovery
resultReady         = calculationAccepted && recoveryReady
convergenceReady    = accepted B7C three-level convergence
assessmentReady     = false
codeReady           = false
releaseQualified    = false
generalT7dAuthorized = false
```

A result may be ready while convergence remains blocked. This does not produce code or release authority.

## 9. Qualification fixture

The dedicated check builds a real deterministic three-level T6 ladder:

```text
level 1:  4 T6 elements
level 2: 16 T6 elements
level 3: 64 T6 elements
```

Every node is prescribed to the same affine plane-stress displacement field. The retained solver therefore uses its qualified `FULLY_CONSTRAINED_NO_FREE_SOLVE` path while still assembling stiffness, recovering Gauss-point stress, reconstructing energy and result hashes, and registering lifecycle evidence. The exact affine field removes iterative convergence noise.

The check also proves:

- deterministic receipt and evidence hashes on replay;
- stale imported revision rejection;
- stale B7B mapping-parent rejection;
- physical-problem drift rejection;
- non-increasing refinement rejection;
- tampered mesh-evidence rejection;
- result-ready but convergence-blocked separation;
- tampered B7C request rejection;
- no UI/controller or direct numerical-core bypass.

## 10. Non-claims

B7D does not:

- qualify any template other than `C2D-LUG-PINHOLE`;
- create a production mesher;
- promote the B6 caller mesh to `productionMeshQualified`;
- authorize LAFEA.4 or LAFEA.5 shell execution;
- change T6, Q8, CST+DKT, solver, tolerance, or benchmark formulas;
- create nodal stress assessment authority;
- create SCL or structural-stress evidence;
- assess a design code;
- create report authority;
- create a persistent `RELEASE_QUALIFIED` record;
- authorize general T7D.

## 11. Required commands

```bash
npm ci
node scripts/lafea-template-b7d-controlled-continuum-controller-check.mjs
node scripts/lafea-template-b7c-controlled-continuum-contract-check.mjs
node scripts/lafea-template-b7b-continuum-benchmark-convergence-check.mjs
node scripts/lafea-template-b7a-lug-pinhole-mapping-check.mjs
node scripts/lafea-template-b6-caller-mesh-binding-check.mjs
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```

A workflow failure before executable steps is infrastructure evidence only and must not be represented as a B7D PASS.
