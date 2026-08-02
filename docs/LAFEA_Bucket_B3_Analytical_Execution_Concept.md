# LAFEA Bucket B3 — Controlled Analytical Execution Concept

## 1. Scope

B3 freezes the contracts and controller boundary for exactly two future execution pilots:

```text
ALG-LOAD-REFERENCE-TRANSFER -> LAFEA.1
ALG-PIPE-SECTION-COMBINED   -> LAFEA.2
```

B3 is contract-only. The controller authority is explicitly:

```text
B3_CONTRACT_ONLY_IMPLEMENTATION_WITHHELD
```

No stage route is invoked by this package.

## 2. Execution request

```text
schema: lafea-template-execution-request/v1
mode:   CONTROLLED_TEMPLATE_PILOT
```

Exact keys:

```text
schema
requestId
executionMode
templateId
releaseRecordHash
parameterSetHash
compilationHash
handoffHash
compatibilityReceiptHash
targetStageId
targetCompositionRootId
targetLifecycleProfileId
expectedProductAdapterId
expectedBenchmarkManifestIds
importedDocumentRevisionDigest
sourceAuthorityRequest
hashProfile
semanticHash
```

`sourceAuthorityRequest` contains only:

```text
originRef
expectedStageId
expectedDocumentRevisionDigest
```

A caller-supplied `sourceHash` is structurally impossible because exact-key validation rejects it. Source identity must later be issued by the governed source-authority service from the exact normalized stage source.

## 3. Pilot bindings

### Reference transfer

```text
template:   ALG-LOAD-REFERENCE-TRANSFER
stage:      LAFEA.1
composition:LAFEA.COMPOSITION.ATTACHMENT_FOUNDATION/V1
lifecycle:  ANALYTICAL_FOUNDATION_V1
product:    LAFEA.COMPONENT.PRODUCT.ATTACHMENT_FOUNDATION/V1
assessment: NOT_APPLICABLE
```

### Combined pipe section

```text
template:   ALG-PIPE-SECTION-COMBINED
stage:      LAFEA.2
composition:LAFEA.COMPOSITION.PIPE_SECTION_SCREENING/V1
lifecycle:  ANALYTICAL_SCREENING_V1
product:    LAFEA.COMPONENT.PRODUCT.PIPE_SECTION_SCREENING/V1
assessment: APPLICABLE
```

Any other template or mismatched stage/composition/lifecycle/product identity is rejected.

## 4. Execution receipt

```text
schema: lafea-template-execution-receipt/v1
```

Exact keys:

```text
schema
receiptId
requestHash
templateId
targetStageId
targetCompositionRootHash
targetLifecycleProfileHash
compatibilityReceiptHash
sourceAuthorityHash
exactSourceHash
importedDocumentRevisionDigest
stageExecutionEvidenceHash
lifecycleProducerBatchHash
lifecycleStateHash
resultEvidenceHash
productEvidenceHash
benchmarkManifestIds
calculationAccepted
resultReady
assessmentApplicability
assessmentReady
codeReady
status
releaseQualified
diagnostics
hashProfile
semanticHash
evidenceHash
```

Allowed status:

```text
ACCEPTED
BLOCKED
FAILED
```

An `ACCEPTED` receipt requires exact source authority, calculation evidence, lifecycle batch/state, result evidence and product evidence. It also requires:

```text
calculationAccepted = true
resultReady         = true
codeReady           = false
releaseQualified    = false
```

For LAFEA.1:

```text
assessmentApplicability = NOT_APPLICABLE
assessmentReady         = false
```

For LAFEA.2:

```text
assessmentApplicability = APPLICABLE
assessmentReady         = true
```

The receipt cannot establish code or release qualification.

## 5. Controller boundary

The future controller is the only component permitted to orchestrate execution. UI, wizard, panel, view and import code may submit an exact request and display a receipt; they may not call a stage or numerical core.

Required future sequence:

```text
1. validate exact request
2. require ENGINE_EXECUTABLE release record
3. revalidate current B2 compatibility
4. verify imported document revision
5. issue source authority
6. invoke the current public stage-composition facade
7. create and register the lifecycle producer batch
8. create and register product evidence
9. create the immutable receipt
```

Required future services:

```text
release-record validator
target-compatibility validator
source-authority service
public stage-composition facade
lifecycle-producer service
product-evidence service
```

The controller must not duplicate the stage composition dispatch map.

## 6. Readiness distinctions

```text
calculationAccepted
  retained stage core accepted the numerical result

resultReady
  required lifecycle evidence is current and registered

assessmentReady
  applicable product assessment exists and is current

codeReady
  separately qualified code consumer exists; false for both pilots

releaseQualified
  exact-head independent release qualification; always false in an execution receipt
```

No boolean may be used as a substitute for a higher authority state.

## 7. B4 proposed write set

Implementation is limited to a later, separately accepted B4 package:

```text
src/workspace/lafea-template-execution-controller.js
src/workspace/lafea-template-execution-public.js
scripts/lafea-template-b4-analytical-pilot-check.mjs
docs/LAFEA_Bucket_B4_Analytical_Pilot.md
.github/workflows/lafea-template-b4-analytical-pilot.yml
```

Additive export changes may be made only in the existing core/workspace public barrels.

B4 must consume, not duplicate:

```text
B1 release/readiness validation
B2 current target compatibility
issueLafeaSourceAuthority
requireLafeaStageComposition or the retained public workbench facade
create/registerLafeaLifecycleProducerBatch
create/registerLafeaAnalyticalProductBatch
```

## 8. B4 stop conditions

B4 must stop if:

```text
release record is not ENGINE_EXECUTABLE
B2 receipt is absent, stale or blocked
imported document revision changed
source authority cannot be issued from the exact normalized source
UI or wizard directly imports executeLafeaStage or a numerical core
stage/composition/lifecycle/product/benchmark binding changed
lifecycle producer batch is missing or rejected
product evidence is missing or rejected
receipt attempts CODE_READY or RELEASE_QUALIFIED
scope expands beyond the two analytical pilots
```

## 9. Anti-drift coverage

B3 checks both positive pilot contracts and rejects:

```text
unauthorized templates
caller-supplied source hashes
wrong stage, composition, lifecycle or product bindings
missing benchmark bindings
stale source-request revisions
accepted receipts without source/lifecycle/result/product evidence
inconsistent result or assessment readiness
CODE_READY promotion
RELEASE_QUALIFIED promotion
request/receipt tampering
mutable request/receipt objects
```

Source guards prove that B3 contains no workspace import, engine call, source issuance, lifecycle registration, product production or numerical-core call.

## 10. Authority retained

```text
ENGINE_EXECUTABLE    0
LIFECYCLE_READY      0
RESULT_READY         0
RELEASE_QUALIFIED    0
T7D                   UNAUTHORIZED
controller            NOT IMPLEMENTED
```

Successful B3 qualification authorizes only consideration of B4 for the two named pilots. It does not authorize general T7D, continuum, shell, recovery, code or release execution.
