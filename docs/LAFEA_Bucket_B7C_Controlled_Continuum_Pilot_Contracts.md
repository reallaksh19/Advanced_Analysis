# LAFEA Bucket B7C — Controlled Continuum Pilot Contracts

## 1. Purpose

B7C freezes the contract boundary for the bounded pilot:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It does not implement the controller, execute the continuum kernel, issue source authority, register lifecycle evidence, create numerical recovery, assess code or qualify release.

## 2. Required prerequisite state

A request can be created only when all of the following are declared current:

```text
release authority state       = ENGINE_EXECUTABLE
release validity              = CURRENT
target compatibility          = CURRENT
B7A mapping package           = MAPPING_EVIDENCE_QUALIFIED
B7A caller-mesh binding       = BOUND
B7B benchmark qualification   = BENCHMARK_EVIDENCE_QUALIFIED
```

The request binds the SHA-256 identities of the release record, compatibility receipt, B7A mapping package, B7A bound binding and B7B benchmark qualification.

## 3. Source-authority boundary

The caller supplies only a source-authority request:

```text
originRef
expectedStageId
expectedDocumentRevisionDigest
requestedRole = AUTHORITATIVE_EDITABLE_STAGE_SOURCE
```

The caller cannot supply either an exact source hash or a source-authority hash. Those identities may appear only in controller-produced level evidence and the final receipt after the source-authority service has issued them.

Any source edit, undo, redo or replacement that changes the imported document revision invalidates the request and blocks calculation, recovery and result readiness.

## 4. Three-level mesh request

Exactly three mesh levels are required. Every level must:

- use `T6`;
- bind the same canonical-model and analysis-geometry parents;
- have a distinct mesh hash;
- have a distinct mesh-profile hash;
- carry ordinal `1`, `2` or `3` without gaps.

B7C does not create, alter or qualify a mesh.

## 5. Level evidence

Each controller-produced level record binds:

```text
requestHash
ordinal
meshHash
sourceAuthorityHash
exactSourceHash
importedDocumentRevisionDigest
executionHash
resultHash
recoveryHash
integrationPointResultHash
```

An accepted level requires:

```text
resultSchema         = local-continuum-result/v1
calculationAccepted  = true
recoveryAuthority    = RETAINED_INTEGRATION_POINT_VALUES
status               = ACCEPTED
```

Projected display values are optional. When present, their role is fixed to:

```text
DISPLAY_ONLY_NOT_ASSESSMENT_AUTHORITY
```

Projected, extrapolated, averaged or smoothed nodal stress cannot satisfy recovery authority.

## 6. Pilot convergence

The receipt evaluates exactly three parent-bound observations for one declared response quantity. It computes relative changes between adjacent levels and requires:

- the fine-level change to be no greater than the declared tolerance;
- the fine-level change to improve relative to the preceding change;
- all three parent recovery records to be accepted retained integration-point recovery.

The resulting lifecycle-parent proposal uses the retained vocabulary:

```text
recoveryHash
recoverySetHash
convergenceProfileHash
```

Lifecycle registration is authorized by the contract only when the receipt status is `ACCEPTED`. B7C itself does not register anything.

## 7. State distinctions

The receipt keeps these states independent:

```text
calculationAccepted
recoveryReady
convergenceReady
resultReady
assessmentReady
codeReady
releaseQualified
generalT7dAuthorized
```

For this pilot contract:

- `resultReady` requires calculation acceptance and authoritative recovery;
- `convergenceReady` is separate and additionally requires accepted pilot convergence;
- a receipt may be `BLOCKED` for convergence while retaining `resultReady=true`;
- `assessmentReady=false`;
- `codeReady=false`;
- `releaseQualified=false`;
- `generalT7dAuthorized=false`.

## 8. Controller sequence

A future implementation must preserve this order:

1. Validate the exact request.
2. Revalidate the current `ENGINE_EXECUTABLE` release record.
3. Revalidate current target compatibility.
4. Revalidate the B7A mapping package and `BOUND` caller mesh.
5. Revalidate the B7B independent benchmark qualification.
6. Verify the imported document revision.
7. Issue source authority.
8. Execute exactly three governed pilot levels.
9. Create authoritative retained integration-point recovery.
10. Evaluate pilot convergence.
11. Create the immutable receipt.

The UI may submit a request and display a receipt. It may not call the stage route or numerical core directly.

## 9. Failure behavior

The contract fails closed for, among other conditions:

- a non-current release or compatibility receipt;
- mapping or benchmark evidence that is blocked or stale;
- caller-supplied source or source-authority hashes;
- missing, duplicate or non-T6 mesh levels;
- stale model, geometry, request, mesh, source or document-revision parents;
- accepted level evidence without result or recovery hashes;
- projected display stress represented as assessment authority;
- missing convergence levels;
- stale convergence recovery parents;
- duplicate recovery hashes;
- changed or mutable contract values.

## 10. Authority ledger after B7C

```text
B7C contract available              = true
controller implemented              = false
continuum execution performed       = false
source authority issued by B7C      = false
recovery produced by B7C            = false
convergence registered              = false
assessment ready                    = false
code ready                          = false
release qualified                   = false
general T7D authorized              = false
```

The next package must implement a bounded controller only after revalidating all B7C prerequisite objects and preserving the public stage-composition boundary. Shell, LAFEA.4 recovery expansion, code assessment and general T7D remain outside this lane.
