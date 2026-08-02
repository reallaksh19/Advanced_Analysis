# LAFEA Non-Bucket NB-T6F — Review and Live-Display Session Binding

## 1. Purpose

NB-T6F binds the two already-merged NB-T6E outputs for exactly:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

The required parents are:

- the portable selected-pilot review and audit handoff; and
- the live-workbench display handoff receipt.

The session proves that the engineering review and the packet installed in the live workbench refer to the same NB-T6D render bridge and the same retained engineering lineage.

## 2. Gap closed

Before NB-T6F, both NB-T6E paths were independently valid but no single receipt proved that they described the same displayed result.

NB-T6F requires exact equality of:

```text
renderBridgeHash
sourceHash
analysisMeshHash
executionHash
recoveryHash
convergenceHash
displayGeometryHash
renderProfileHash
sceneRevision
fieldId
```

A mismatch blocks session creation even when each parent is independently valid.

## 3. Inputs

```text
schema:       lafea-selected-pilot-review-display-session-intake/v1
sessionId:    explicit caller identity
exactHeadSha: exact selected-pilot qualification head
reviewHandoff: valid NB-T6E portable review handoff
workbenchHandoff: valid NB-T6E live-display receipt
```

The exact head must match the review handoff, review packet and audit receipt.

## 4. Output

The immutable session receipt contains:

- exact parent hashes;
- the shared engineering and display lineage;
- a three-level review summary;
- a live-display binding summary;
- scene revision and field identity;
- an explicit authority matrix; and
- one canonical SHA-256 session identity.

It contains no render packet, display field, positions, indices, field values, typed arrays, qualification package or controller object.

## 5. Public-surface consolidation

The package also corrects the additive public facade integration after the two independent NB-T6E merges. The workbench-display export block is restored as an explicit `export { ... }` declaration, and NB-T6F exports are added without wrapping either NB-T6E producer.

No numerical, lifecycle, display-producer or UI-controller behavior is changed by that consolidation.

## 6. Authority boundary

An accepted session establishes only:

```text
reviewEvidenceBound              = true
liveDisplayReceiptBound          = true
sameRenderBridgeProven           = true
sameEngineeringLineageProven     = true
bufferFreeSessionReceipt         = true
```

It always retains:

```text
displayValuesAuthoritative       = false
engineeringEvidenceChanged       = false
lifecycleArtifactsRegistered     = false
solverExecuted                   = false
newRecoveryProduced              = false
newConvergenceProduced           = false
newDisplayProjectionProduced     = false
assessmentReady                  = false
codeReady                        = false
reportAuthority                  = false
releaseQualified                 = false
generalT7dAuthorized             = false
shellAuthorized                  = false
lafea6Enabled                    = false
```

NB-T6F is not an independent review approval, code assessment, formal report or release disposition.

## 7. Fail-closed cases

The package rejects:

- malformed or promoted parent authority;
- stale exact-head review evidence;
- a different valid live-workbench display receipt;
- mismatched bridge, source, mesh, execution, recovery or convergence hashes;
- mismatched display profile, scene revision or field identity;
- session-hash tampering;
- receipt mutation that exposes typed arrays; and
- any code, report or release promotion.

## 8. Required exact-head qualification

```bash
npm ci
node scripts/lafea-nb-t6f-review-display-session-check.mjs
node scripts/lafea-nb-t6e-evidence-handoff-review-check.mjs
node scripts/lafea-nb-t6e-workbench-display-handoff-check.mjs
node scripts/lafea-nb-t6d-b7d-recovery-render-bridge-check.mjs
npm run check:lafea-nonbucket-stack
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
```

A hosted job that terminates before executable steps are created remains infrastructure evidence only and is neither a product PASS nor a product failure.
