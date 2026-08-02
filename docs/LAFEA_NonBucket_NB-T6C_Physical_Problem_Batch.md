# LAFEA Non-Bucket NB-T6C — Physical-Problem Projection and B7D Handoff

## 1. Work package

NB-T6C closes the integration gap between the merged NB-T6B production mesh ladder and the merged B7D controlled continuum controller for exactly:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It is one consolidated batch. It creates the bounded physical-problem projection, three stage documents, B7A mapping evidence, B7C request and B7D handoff in a single governed path.

## 2. Public surfaces

```text
src/workspace/lafea-controlled-continuum-execution-public.js
src/workspace/lafea-lug-pinhole-physical-problem-batch.js
src/workspace/lafea-controlled-continuum-public.js
```

The batch invokes B7D only through the dedicated non-UI execution facade. It does not import `local-continuum`, call `calculateLocalContinuum`, call `executeLafeaStage`, or expose a UI callback.

## 3. Bounded geometry

The accepted geometry remains:

```text
one concentric circular pin hole
inside one concentric circular outer boundary
```

NB-T6C does not support arbitrary lug outlines, fillets, notches, weld details, multiple holes or arbitrary hole topology.

## 4. Projection intake

The caller supplies explicit engineering declarations for:

- current B1 release and B2 compatibility parents;
- canonical-model hash;
- concentric annular geometry;
- three NB-T6B mesh levels and profiles;
- material and thickness;
- one load case and declared resultant;
- result requests and qualification profile;
- load and restraint feature selections;
- boundary-zero or affine full-field kinematics;
- application classification evidence.

No declaration is inferred from display, selection, tessellation, color, projected stress or viewport state.

## 5. Feature projection

Feature roles are restricted to:

```text
HOLE_BOUNDARY
OUTER_BOUNDARY
RADIAL_QUARTER_0
RADIAL_QUARTER_1
RADIAL_QUARTER_2
RADIAL_QUARTER_3
```

The base selection is exactly one T6 edge. Refined levels preserve the same parametric span. A level is blocked when the refinement ratio cannot project that span as an integral edge window.

## 6. Load and restraint rules

Nodal load distribution uses deterministic quadratic-edge weighting:

```text
corner : midside : corner = 1 : 4 : 1
```

Weights are length-scaled across the projected window. The final node receives the arithmetic remainder so the declared global resultant closes exactly within the declared tolerance.

Kinematics are explicit:

- `BOUNDARY_ZERO` creates zero UX/UY constraints on the selected restraint region;
- `AFFINE_FULL_FIELD` applies the declared affine UX/UY field to every mesh node for deterministic qualification.

The level-one B7A boundary edge must still contain zero in-plane constraints. An affine qualification selection is therefore valid only when the selected edge evaluates to zero under the declared field.

## 7. Produced chain

```text
explicit physical problem
+ explicit feature projection
+ NB-T6B ladder specifications
-> provisional deterministic meshes
-> three normalized local-continuum-model/v1 documents
-> exact level-one source authority
-> final source-bound NB-T6B ladder
-> pending caller-mesh binding
-> qualified B7A material/load/restraint mapping
-> immutable NB-T6C projection package
-> independently qualified B7B parent
-> exact B7C request
-> B7D controlled execution
```

Each stage document has exact node coordinates and T6 connectivity matching its governed NB-T4A mesh evidence.

## 8. Physical-problem invariance

The three documents retain one exact physical basis:

- model identity and version;
- source ancestry;
- units and plane-stress formulation;
- material and thickness;
- element-family policy;
- load-case and result-request identities;
- qualification profile and limitations.

Only discretization entities and the deterministic projection of loads/restraints change with refinement.

## 9. Readiness and authority

Projection readiness and solver readiness are separate:

```text
projection.status             = PROJECTION_READY
productionMeshGenerated       = true
stageDocumentsGenerated       = true
mappingQualified              = true
solverExecuted                = false
recoveryProduced              = false
convergenceProduced           = false
```

Execution readiness comes only from the B7D result. Even an accepted selected pilot retains:

```text
generalT7dAuthorized = false
shellAuthorized      = false
assessmentReady      = false
codeReady            = false
reportAuthority      = false
releaseQualified     = false
```

## 10. Qualification fixture

The dedicated check uses one affine plane-stress problem and a real generated ladder:

```text
level 1: 1 radial x  8 circumferential ->  16 T6 elements
level 2: 2 radial x 16 circumferential ->  64 T6 elements
level 3: 4 radial x 32 circumferential -> 256 T6 elements
```

It proves deterministic projection and execution identities, qualified level-one B7A mapping, exact source/mesh lineage, accepted B7D execution, retained integration-point recovery and accepted three-level convergence.

Negative coverage includes invalid feature roles, non-integral feature refinement, stale benchmark parents, tampered declarations and source-to-mesh drift.

## 11. Required commands

```bash
npm ci
node scripts/lafea-nb-t6c-physical-problem-batch-check.mjs
node scripts/lafea-nb-t6b-lug-pinhole-mesh-ladder-check.mjs
node scripts/lafea-template-b7d-controlled-continuum-controller-check.mjs
npm run check:lafea-nonbucket-stack
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```

A workflow that fails before creating executable steps is infrastructure evidence only. It is not an NB-T6C PASS.
