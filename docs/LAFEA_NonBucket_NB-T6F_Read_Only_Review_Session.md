# LAFEA Non-Bucket NB-T6F — Read-Only Selected-Pilot Review Session

## 1. Purpose

NB-T6F closes the evidence-consumer gap for exactly:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

The merged stack already provides two independent NB-T6E products:

1. a portable selected-pilot review and audit handoff; and
2. a live workbench display-binding receipt.

NB-T6F binds those products into one immutable read-only review session. It does not execute either producer and does not create engineering evidence.

## 2. Required public-facade repair

The current merged `src/workspace/lafea-controlled-continuum-public.js` lost the `export {` opener before the NB-T6E workbench display-handoff symbols during concurrent integration.

NB-T6F repairs that syntax defect and extends the same public non-UI facade with the review-session contract. The exact-head check imports the facade before constructing the retained pilot path, so malformed exports fail before qualification logic can run.

## 3. Inputs

The session factory accepts exactly:

```text
sessionId
exactHeadSha
reviewHandoff
workbench displayHandoff
```

The review handoff must be a valid:

```text
lafea-selected-pilot-review-handoff/v1
```

The display handoff must be a valid:

```text
lafea-b7d-workbench-display-handoff/v1
```

Both inputs remain immutable parents. NB-T6F does not modify, replay, reinstall or re-register them.

## 4. Exact parent binding

NB-T6F requires equality across:

```text
renderBridgeHash
exact sourceHash
fine-level analysisMesh artifact hash
fine-level executionHash
fine-level recoveryHash
convergenceHash
displayGeometryHash
renderProfileHash
sceneRevision
fieldId
```

The portable review packet and live workbench binding therefore describe the same selected pilot, same retained result, same display profile and same viewport revision.

A valid receipt with a different bridge, source, mesh, result, convergence, scene or field identity is rejected. Validity of each parent alone is insufficient.

## 5. Session content

The immutable session contains buffer-free summaries of:

- the physical problem basis;
- all three increasing T6 levels;
- free and constrained DOF counts;
- deterministic Cholesky evidence;
- applied and reaction resultants;
- equilibrium closure;
- displacement and retained-stress observations;
- unchanged NB-T6D convergence dispositions;
- the finest retained integration-point result identity;
- the live display and lifecycle-binding statuses;
- review navigation sections;
- inherited and NB-T6F-specific limitations.

The session does not include workbench packet typed arrays. The portable NB-T6E handoff remains the governed carrier for the existing display packet.

## 6. Review sections

The session exposes six deterministic read-only sections:

```text
BASIS
LEVEL_EVIDENCE
CONVERGENCE
FINEST_RETAINED_RESULT
LIVE_DISPLAY_BINDING
LIMITATIONS
```

These are navigation and review metadata only. They are not calculation, assessment, approval or report workflow states.

## 7. Determinism and portability

The session is deep-frozen and sealed with canonical SHA-256 over its complete semantic basis.

NB-T6F provides deterministic JSON serialization and parsing. Parsing revalidates the complete session contract and hash; malformed or altered payloads fail closed.

## 8. Authority boundary

NB-T6F establishes only:

```text
readOnlyReviewSessionReady = true
portableAuditLinked        = true
liveDisplayBindingLinked   = true
```

It explicitly retains:

```text
engineeringEvidenceChanged           = false
solverExecuted                       = false
newEngineeringRecoveryProduced       = false
newConvergenceProduced               = false
newDisplayProjectionProduced         = false
lifecycleArtifactsRegistered         = false
displayValuesAuthoritative           = false
generalT7dAuthorized                 = false
additionalContinuumTemplates         = false
shell / SCL / structural stress      = false
assessmentReady                      = false
codeReady                            = false
reportAuthority                      = false
releaseQualified                     = false
LAFEA.6                              = false
```

## 9. Non-duplication rule

The session module imports validators only. It must not call:

```text
executeControlledLafeaContinuumPilot
executeLafeaStage
calculateLocalContinuum
createLafeaB7dRecoveryRenderBridge
installLafeaB7dWorkbenchDisplay
setDisplayRenderPacket
registerLafeaArtifact
```

The NB-T6D bridge remains the display producer. The NB-T6E workbench handoff remains the display installer. NB-T6F is a pure evidence binder and review-session producer.

## 10. Adversarial qualification

The exact-head check covers:

- stale exact head;
- wrong bridge parent;
- wrong source parent;
- wrong mesh, execution, recovery or convergence parent;
- wrong display geometry or render profile;
- wrong scene revision or field identity;
- reordered review levels;
- authority promotion;
- session-payload tamper;
- malformed portable JSON;
- repaired public-facade importability;
- source guards against solver, controller command, lifecycle registration and smoothing routes.

## 11. Required exact-head gates

```bash
npm ci
node scripts/lafea-nb-t6f-read-only-review-session-check.mjs
node scripts/lafea-nb-t6e-evidence-handoff-review-check.mjs
node scripts/lafea-nb-t6e-workbench-display-handoff-check.mjs
node scripts/lafea-nb-t6d-load-driven-qualification-check.mjs
node scripts/lafea-nb-t6d-b7d-recovery-render-bridge-check.mjs
npm run check:lafea-nonbucket-stack
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```

A workflow that terminates before executable steps and logs exist is infrastructure evidence only. It is neither a product failure nor an NB-T6F PASS.
