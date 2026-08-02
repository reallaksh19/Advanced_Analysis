# LAFEA Non-Bucket NB-T6D — B7D Recovery-to-Render Bridge

## 1. Purpose

NB-T6D closes the bounded display gap after the accepted NB-T6C/B7D continuum execution for exactly:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It converts the accepted fine-level retained B7D integration-point recovery into a GPU-ready V2 display packet. It does not execute the solver, compute new stress, register lifecycle artifacts, assess code, produce a report or qualify release.

## 2. Governing lineage

The bridge consumes:

- one current NB-T6C projection;
- one accepted NB-T6C execution package;
- the accepted B7D controller result;
- the fine-level NB-T4A mesh evidence;
- one explicit retained-field request;
- one scene revision.

The render packet lineage binds directly to the already registered B7D fine-level identities:

```text
sourceHash
analysisGeometryHash
analysisMesh artifactHash
B7D fine-level executionHash
B7D fine-level recoveryHash
displayGeometryHash
renderProfileHash
```

The convergence artifact remains separately retained in the NB-T6D bridge package.

## 3. Fine-level-only rule

NB-T6D renders only B7D level 3. The controller lifecycle must show that its current `EXECUTION` and `RECOVERY` artifacts are the exact level-3 records and that its current `CONVERGENCE` artifact is qualified.

Coarse and intermediate levels remain convergence evidence. They are not exposed as the current result display packet by this package.

## 4. Retained field authority

The request must identify:

- one accepted load case;
- `SIGMA_X`, `SIGMA_Y` or `TAU_XY`;
- the exact stress unit retained by the execution input;
- one explicit integration-point index;
- one governed color map.

Each displayed scalar is copied from:

```text
controllerResult
  .levelResults[2]
  .execution.result
  .loadCaseResults[*]
  .elementResults[*]
  .gaussPointResults[index]
  .stress
```

The display field remains:

```text
valueRole = PRODUCER_PROJECTED_DISPLAY_ONLY
```

It is not nodal stress, smoothed stress, averaged stress, extrapolated stress or a new engineering recovery result.

## 5. Display geometry

Every fine-level T6 element is tessellated locally using its three corner nodes. The quadratic midside nodes remain part of the analysis mesh identity but are not used to imply a higher-order display interpolation.

The draw geometry therefore follows:

```text
one source T6 element
-> one local display triangle
-> three local display vertices
-> one retained integration-point scalar repeated for display coloring
```

No cross-element vertex sharing or field smoothing occurs. Draw indices remain display topology only.

## 6. Picking

The V2 packet creates one pick-map entry per source element. Each draw triangle maps back to the exact T6 `elementId`. Picking does not infer engineering regions or modify analysis selection authority.

## 7. Hash reconstruction

Before producing the packet, the bridge verifies:

- NB-T6C projection integrity;
- NB-T6C execution-package identity;
- accepted B7D receipt and readiness;
- exact projection/execution parent binding;
- fine-level mesh equality with the projection;
- exact B7D execution and recovery record identities;
- current lifecycle execution/recovery/convergence identities;
- reconstructed retained-result hash equality;
- stress-unit and integration-point availability.

The final bridge hash includes typed-array packet values in canonical array form.

## 8. Authority boundary

NB-T6D establishes:

```text
selectedPilotDisplay              = true
fineLevelOnly                     = true
retainedEngineeringResultUsed     = true
displayProjectionOnly             = true
resultReady                       = true
convergenceReady                  = true
```

NB-T6D explicitly retains:

```text
newEngineeringRecoveryComputed = false
lifecycleArtifactsRegistered    = false
assessmentReady                 = false
codeReady                       = false
reportAuthority                 = false
releaseQualified                = false
generalT7dAuthorized            = false
shellAuthorized                 = false
lafea6Enabled                   = false
```

## 9. Non-duplication rule

NB-T6D does not call `createLafeaRecoveryRenderPackage` because that NB-T4B producer creates its own execution and recovery records from a pre-result lifecycle. B7D has already created and registered those records. Re-running NB-T4B would create a competing evidence identity.

NB-T6D instead consumes the existing B7D records and creates only a display packet and immutable bridge package.

## 10. Required qualification

```bash
npm ci
node scripts/lafea-nb-t6d-b7d-recovery-render-bridge-check.mjs
node scripts/lafea-nb-t6c-physical-problem-batch-check.mjs
node scripts/lafea-nb-t4b-recovery-render-check.mjs
node scripts/lafea-u4c-render-packet-v2-check.mjs
node scripts/lafea-u4d-render-evidence-intake-check.mjs
npm run check:lafea-nonbucket-stack
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```

A job that fails before executable steps and logs exist remains infrastructure-only evidence and is not an NB-T6D product failure or PASS.
