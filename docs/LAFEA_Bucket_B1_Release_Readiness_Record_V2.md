# LAFEA Bucket B1 — Release/Readiness Record V2

## 1. Purpose

B1 introduces the immutable contract used to describe the authority state of one LAFEA application template. It does not execute a template and does not promote any existing catalogue entry.

```text
schema: lafea-template-release-record/v2
hash:   LAFEA_CANONICAL_JSON_SHA256_V1
```

The existing `lafea-template-release-record/v1` remains available for historical compatibility. V2 is additive and explicitly separates semantic engineering identity from exact-head qualification evidence.

## 2. Authority states

The only forward sequence is:

```text
CATALOGUED
  → PARAMETER_VALID
  → COMPILED_READY
  → IMPORTED_FOR_EDITING
  → ENGINE_EXECUTABLE
  → LIFECYCLE_READY
  → RESULT_READY
  → RELEASE_QUALIFIED
```

Forward transitions must be adjacent. A skip, repeated state or backward transition is rejected by `assertTemplateReleaseTransition`.

Any record may instead become:

```text
STALE
BLOCKED
FAILED
```

Re-entry must occur through the earliest state surviving the parent change.

## 3. Exact top-level contract

```text
schema
recordId
candidateHeadSha
template
parameterSchema
parameterSet
compiler
handoff
targetStage
compositionRoot
lifecycleProfile
sourceAuthority
unitProjection
meshAuthority
recoveryAuthority
benchmarkManifests
productAdapter
executionEvidence
qualificationEvidence
releaseState
diagnostics
hashProfile
semanticHash
evidenceHash
```

Unknown and missing keys are rejected at every level.

## 4. Parent graph

```text
template registry
  └─ template identity
       ├─ parameter schema
       │    └─ parameter set
       └─ compiler binding
              └─ compilation
                   └─ handoff

stage registry + composition root + lifecycle profile
source contract + unit projection + product adapter + benchmark bindings
                         │
                         └─ compatibility receipt
                                  │
                             source authority
                                  │
                       execution request/receipt
                                  │
                         lifecycle producer batch
                                  │
                            result evidence
                                  │
                    product/recovery/convergence evidence
                                  │
                         independent benchmarks
                                  │
                       exact-head qualification evidence
                                  │
                          RELEASE_QUALIFIED
```

FEA records additionally bind:

```text
sourceHash
  → canonicalModelHash
  → analysisGeometryHash
  → meshProfileHash + meshHash
  → meshAuthorityHash
  → execution
  → recovery
  → convergence
```

## 5. Applicability

Each conditional authority block declares exactly one of:

```text
REQUIRED
NOT_APPLICABLE
```

`NOT_APPLICABLE` requires all associated identity/evidence fields to be null. It is not interchangeable with missing required evidence.

Analytical templates use:

```text
meshAuthority.applicability     = NOT_APPLICABLE
recoveryAuthority.applicability = NOT_APPLICABLE
productAdapter.applicability    = REQUIRED
```

FEA templates use:

```text
meshAuthority.applicability     = REQUIRED
recoveryAuthority.applicability = REQUIRED
productAdapter.applicability    = NOT_APPLICABLE
```

A required block may contain null evidence only while the authority state remains below the state that requires that evidence.

## 6. Semantic and evidence hashes

`semanticHash` is canonical SHA-256 over engineering meaning:

```text
template and parameter parents
compiler and handoff parents
target stage, composition and lifecycle parents
source/unit/mesh/recovery/product requirements
benchmark bindings
execution/result readiness state
release state and blockers
```

It excludes candidate-head and test-run evidence.

`evidenceHash` is canonical SHA-256 over:

```text
semanticHash
candidateHeadSha
qualificationEvidence
diagnostics
```

Changing only the exact candidate head or qualification artifacts therefore changes `evidenceHash` without changing `semanticHash`.

## 7. State requirements

### `PARAMETER_VALID`

Requires a current parameter validation identity.

### `COMPILED_READY`

Requires compiler binding, compilation and handoff identities.

### `IMPORTED_FOR_EDITING`

Retains T7C import-only meaning. It creates no execution implication.

### `ENGINE_EXECUTABLE`

Requires a current compatibility receipt and current record validity. Applicable product-adapter identity must be bound, but no calculation is run by this contract.

### `LIFECYCLE_READY`

Requires issued source authority, controlled request/receipt identity and lifecycle-producer-batch identity. Required FEA mesh ancestry must also be complete.

### `RESULT_READY`

Requires result evidence and `resultReady=true`. Applicable product or recovery evidence must be present.

### `RELEASE_QUALIFIED`

Requires:

```text
CURRENT validity
no blocked reasons
releaseQualified=true
independent benchmark evidence
all exact-head qualification evidence
required convergence evidence
codeReady=true when code assessment is applicable
```

No lower state may set `releaseQualified=true`.

## 8. Stale invalidation

The contract classifies changes to:

```text
parameter value
parameter schema
compiler
unit projection
target stage
composition root
lifecycle profile
product adapter
source
mesh
recovery
benchmark implementation
benchmark expected value
candidate head
```

Each classification returns the earliest surviving state, affected authority blocks and `qualificationRevoked=true`. Expected benchmark changes therefore cannot retain prior qualification.

## 9. V1 migration

`migrateTemplateReleaseRecordV1ToV2` is deliberately fail closed.

A migrated record always becomes:

```text
authorityState   = CATALOGUED
validity         = BLOCKED
releaseQualified = false
```

Legacy executable, qualified or benchmark text is retained only as diagnostics. The migration creates no compiler receipt, handoff, compatibility receipt, source authority, mesh evidence, execution receipt, lifecycle batch, result evidence or qualification artifact.

## 10. Qualification checks

The B1 check exercises all eight positive states and adversarial cases including:

```text
unknown and missing keys
NOT_APPLICABLE evidence contamination
early release qualification
compilation without compiler binding
execution authority without compatibility
lifecycle readiness without source authority
result readiness without resultReady
release qualification with blockers
duplicate benchmark identities
semantic/evidence hash tampering
FEA result readiness without recovery
release qualification without independent benchmark evidence
forbidden state skips and regressions
fail-closed legacy migration
```

It also source-guards the B1 implementation against workspace imports, engine calls, source issuance, lifecycle registration and numerical calculator calls.

## 11. Authority retained

B1 does not alter the catalogue or current release state:

```text
CATALOGUED          27
ENGINE_EXECUTABLE    0
LIFECYCLE_READY      0
RESULT_READY         0
RELEASE_QUALIFIED    0
T7C                   IMPORT_FOR_EDITING_ONLY
T7D                   UNAUTHORIZED
```

No source authority is issued, no engine is invoked, no lifecycle artifact is registered, no result is bound, no mesh is generated, no shell formulation is changed, and no release is promoted by this package.
