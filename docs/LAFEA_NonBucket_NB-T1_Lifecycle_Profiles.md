# LAFEA Non-Bucket NB-T1 — Stage-Correct Lifecycle Profiles

## Work package

`NB-T1 — STAGE-CORRECT LIFECYCLE PROFILES`

## Baseline

- Accepted NB-T0 merge/current main: `442074247b274a5cf7a9d8548d6c774ef22c8e6e`
- Branch: `feat/lafea-nb-t1-lifecycle-profiles`
- Scope: original six-stage non-bucket LAFEA only
- Numerical authority changed: **No**
- Shell authority changed: **No**
- LAFEA.6 enabled: **No**
- Producer/source integration: **Deferred to NB-T2**

## Problem closed by this package

The retained `lafea-analysis-lifecycle/v1` contract applied one FEA-shaped artifact chain to every stage. That universal shape required analysis mesh, recovery, convergence and code-assessment concepts even for the analytical LAFEA.1 and LAFEA.2 routes.

NB-T1 replaces that universal lifecycle with explicit stage profiles. No nullable generic mesh slot and no synthetic evidence are used to make analytical stages fit an FEA chain.

## Profile authority

| Stage | Profile | Exact authorized artifact chain |
|---|---|---|
| LAFEA.1 | `ANALYTICAL_FOUNDATION_V1` | `CANONICAL_MODEL → EXECUTION → RESULT_EVIDENCE → REPORT_EVIDENCE` |
| LAFEA.2 | `ANALYTICAL_SCREENING_V1` | `CANONICAL_MODEL → EXECUTION → RESULT_EVIDENCE → SCREENING_ASSESSMENT → REPORT_EVIDENCE` |
| LAFEA.3 | `FEA_MESH_RECOVERY_V1` | `CANONICAL_MODEL → ANALYSIS_GEOMETRY → ANALYSIS_MESH → EXECUTION → RECOVERY → optional CONVERGENCE → REPORT_EVIDENCE` |
| LAFEA.4 | `FEA_MESH_RECOVERY_V1` | Same profile; production solver authority remains legacy five-DOF CST+DKT |
| LAFEA.5 | `FEA_MESH_RECOVERY_V1` | Same profile; source mesh remains caller-authored host-shell footprint evidence |
| LAFEA.6 | `UNSUPPORTED_STAGE_V1` | No engineering artifact slots |

## Lifecycle and artifact schemas

- lifecycle: `lafea-analysis-lifecycle/v2`
- artifact record: `lafea-artifact-record/v2`
- artifact registration: `lafea-artifact-registration/v2`
- lifecycle profile: `lafea-lifecycle-profile/v1`

Every v2 lifecycle, artifact record and registration carries the exact `profileId` selected for its stage.

## Readiness semantics

`RESULT_READY` is profile-specific:

- LAFEA.1 requires current PASS canonical model, execution and result evidence. Mesh is not applicable.
- LAFEA.2 requires the same result chain. Screening assessment is a distinct downstream readiness state.
- LAFEA.3–.5 require current PASS canonical model, analysis geometry, analysis mesh, execution and recovery.
- LAFEA.6 can never become result-ready.

Current non-bucket profiles do not authorize `CODE_ASSESSMENT`. Therefore `CODE_READY` remains false and no stage is promoted to code or release readiness.

## Report evidence

PASS report evidence is checked against the current profile:

- foundation reports require current PASS result evidence;
- screening reports require current PASS screening assessment;
- FEA reports require current PASS recovery evidence;
- no report requires or manufactures code-assessment evidence where code assessment is not authorized.

## Legacy migration

`migrateLafeaLifecycleV1(value)` is explicit and fail-closed.

- ABSENT legacy slots are mapped only to exact target-profile ABSENT slots.
- Non-ABSENT evidence is retained only when the legacy parent-key contract exactly equals the target profile contract.
- Evidence not authorized by the target profile causes `LAFEA_LIFECYCLE_V1_MIGRATION_REQUIRES_REVALIDATION`.
- No model, mesh, result, recovery, convergence, assessment or report hash is synthesized.

## Display and rendering boundary

The current V2 result packet is a mesh-result contract. Render intake remains eligible only for mesh-applicable FEA profiles. Analytical and unsupported profiles fail closed with `LAFEA_RENDER_PROFILE_NOT_MESH_RESULT_AUTHORIZED`; this package does not invent an analytical result-graphics packet.

## Invalidation

- source/material/load/metadata changes invalidate only artifacts authorized by the selected profile;
- mesh-profile and recovery-profile events are rejected for analytical profiles;
- code-profile events are rejected for all current profiles;
- display-only profile changes do not invalidate engineering evidence;
- LAFEA.6 engineering lifecycle events remain blocked.

## Write set

- `src/workspace/lafea-lifecycle-profiles.js`
- `src/workspace/lafea-lifecycle-profiled.js`
- `src/workspace/lafea-lifecycle.js`
- `src/workspace/lafea-lifecycle-panel.js`
- `src/workspace/lafea-render-evidence-intake.js`
- `src/workspace/lafea-workbench.js`
- `scripts/lafea-nonbucket-lifecycle-profiles-check.mjs`
- `scripts/lafea-nonbucket-stack-check.mjs`
- `scripts/lafea-nonbucket-scope-guard.mjs`
- `scripts/lafea-u3a-lifecycle-check.mjs`
- `scripts/lafea-u3a-public-surface-check.mjs`
- this document

## Prohibited write sets not touched

- numerical cores and benchmark values
- LFEA piping and Issue #116 correction files
- Agent 2 application templates/buckets
- first-cut, sequential-sketcher and accessory-panel product logic
- shell formulation dispatch or labels
- LAFEA.6 engine/edit/result implementation
- producer source hashing and automatic artifact registration

## Acceptance rules

- dedicated NB-T1 profile check, retained non-bucket aggregate, core, browser, syntax, import and build commands must pass on one exact PR head;
- legacy aggregate and full repository gate remain separately attributed;
- an Issue #116-only full-gate failure remains repository integration blocked, not an NB-T1 lifecycle failure;
- no workflow result constitutes `CODE_READY` or `RELEASE_QUALIFIED`.
