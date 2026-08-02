# LAFEA Non-Bucket NB-T6G — Current-Context Read-Only Review Panel

## 1. Purpose

NB-T6G consumes one valid merged NB-T6F selected-pilot review session for exactly:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It mounts a semantic read-only panel only when the live workbench viewport and lifecycle still identify the same source, scene revision, mesh, execution, recovery and convergence parents.

NB-T6G does not execute the solver, install a display packet, mutate lifecycle state, edit the model, assess code, produce a formal engineering report or qualify release.

## 2. Public read boundary

The panel reads only:

```text
controller.getDisplayViewportContext()
controller.exportLifecycle()
```

It does not import the workbench controller class, private packet registry, numerical kernel or lifecycle mutation functions.

## 3. Current-context gate

Before mount and before every section change, NB-T6G requires:

- `LAFEA.3` as the current stage;
- the exact NB-T6F source hash;
- the exact scene revision, viewport mode and viewport status;
- a current document/lifecycle binding;
- `meshQualified=true`;
- `resultReady=true`;
- `convergenceReady=true`;
- `codeReady=false`;
- current, qualified `ANALYSIS_MESH`, `EXECUTION`, `RECOVERY` and `CONVERGENCE` artifacts matching the session parents.

A stale or different viewport, document, source, mesh, result or convergence identity blocks rendering.

## 4. Review sections

The panel renders the six governed NB-T6F sections:

```text
BASIS
LEVEL_EVIDENCE
CONVERGENCE
FINEST_RETAINED_RESULT
LIVE_DISPLAY_BINDING
LIMITATIONS
```

Navigation changes only the visible read-only section. It does not change the workbench stage, selection, model, lifecycle or render packet.

## 5. DOM safety

The panel uses semantic DOM creation and `textContent` only. It does not use `innerHTML`.

The receipt contains no packet typed arrays and no retained integration-point arrays. It carries only hashes, current-context summaries, active-section identity and authority flags.

## 6. Receipt

Each mount or section selection emits:

```text
lafea-selected-pilot-review-panel-receipt/v1
```

The receipt binds:

- NB-T6F session hash and ID;
- source, mesh, execution, recovery and convergence hashes;
- display-geometry and render-profile hashes;
- scene revision and field ID;
- active and available sections;
- current viewport summary;
- current lifecycle/readiness summary;
- immutable authority matrix;
- canonical SHA-256 receipt hash.

## 7. Authority boundary

NB-T6G establishes only:

```text
readOnlyReviewPanelMounted = true
currentViewportMatched     = true
currentLifecycleMatched    = true
```

It explicitly retains:

```text
controllerMutated                  = false
engineeringEvidenceChanged         = false
solverExecuted                     = false
newEngineeringRecoveryProduced     = false
newConvergenceProduced             = false
newDisplayProjectionProduced       = false
lifecycleArtifactsRegistered       = false
displayValuesAuthoritative         = false
generalT7dAuthorized               = false
additionalContinuumTemplates       = false
shell / SCL / structural stress    = false
assessmentReady                    = false
codeReady                          = false
reportAuthority                    = false
releaseQualified                   = false
LAFEA.6                            = false
```

## 8. Required exact-head gates

```bash
npm ci
node scripts/lafea-nb-t6g-read-only-review-panel-check.mjs
node scripts/lafea-nb-t6f-read-only-review-session-check.mjs
node scripts/lafea-nb-t6e-evidence-handoff-review-check.mjs
node scripts/lafea-nb-t6e-workbench-display-handoff-check.mjs
npm run check:lafea-nonbucket-stack
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```

A job that terminates before executable steps and logs exist is infrastructure evidence only. It is neither a product failure nor an NB-T6G PASS.
