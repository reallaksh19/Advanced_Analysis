# LAFEA Non-Bucket NB-T6A — Controlled Continuum Pilot

## Scope

NB-T6A introduces the first bounded executable slice of the LAFEA.3 production-continuum program:

```text
C2D-LUG-PINHOLE
  -> LAFEA.3
  -> exact source authority
  -> three caller-supplied NB-T4A-qualified T6 meshes
  -> local-continuum execution
  -> retained integration-point recovery
  -> three-level pilot convergence
  -> immutable B7C execution receipt
```

The batch implements the controller that B7C intentionally left absent. It does not claim general continuum-template execution.

## Required parents

Execution is accepted only when all of the following reconstruct and remain current:

- an `ENGINE_EXECUTABLE` and `CURRENT` template release record;
- a current target-compatibility receipt rebuilt against live LAFEA.3 authority;
- a qualified B7A lug-pinhole mapping package with a `BOUND` caller-mesh binding;
- a qualified B7B patch/Kirsch benchmark package bound to that mapping package;
- the exact imported editable document revision;
- one explicit recovery profile and one explicit convergence profile;
- exactly three distinct, increasingly refined, NB-T4A-qualified T6 mesh records;
- one validated canonical local-continuum model matching each supplied mesh.

Any stale or tampered parent blocks execution.

## Execution and recovery

The controller calls the retained `local-continuum` kernel directly for each level. It accepts only `local-continuum-result/v1` results whose calculation qualification is `ACCEPTED`.

For every element it retains the authoritative Gauss-point result rows before any display operation. The initial controlled recovery quantities are:

```text
VON_MISES
SIGMA_X
SIGMA_Y
TAU_XY
PRINCIPAL_MAXIMUM
PRINCIPAL_MINIMUM
MAXIMUM_IN_PLANE_SHEAR
```

The only supported reduction is `MAX_ABSOLUTE`, evaluated over retained integration-point values. No nodal extrapolation, shared-node averaging, smoothing or contour projection occurs in NB-T6A.

## Convergence

The B7C receipt evaluates one declared recovered quantity across exactly three levels. Acceptance requires:

- all three calculations accepted;
- retained integration-point recovery at every level;
- distinct mesh and recovery identities;
- fine-level relative change within the declared tolerance;
- fine-level change no worse than the preceding change.

A passing receipt may expose lifecycle-parent proposals for a later governed registration package. NB-T6A does not register those parents itself.

## Authority boundary

NB-T6A authorizes only the selected pilot controller. It does not:

- generate production meshes;
- infer geometry, material, load or restraint mappings;
- register lifecycle artifacts;
- project display contours;
- assess code or create SCL/structural-stress evidence;
- qualify reports or release;
- authorize general T7D;
- change LAFEA.4 shell authority;
- enable LAFEA.6.

The controller result therefore keeps:

```text
productionMeshGenerated = false
lifecycleRegistered     = false
assessmentReady         = false
codeReady               = false
releaseQualified        = false
generalT7dAuthorized    = false
shellAuthorized         = false
lafea6Enabled           = false
```

## Next NB-T6 packages

NB-T6A closes controlled execution, retained recovery and pilot convergence for one governed template over caller-supplied meshes. The remaining production-continuum program still requires separately bounded packages for:

1. governed geometry-to-mesh generation and refinement;
2. lifecycle registration and stale invalidation of execution/recovery/convergence evidence;
3. broader template coverage and independent exact-head qualification;
4. stage-specific assessment, code, reporting and release review.
