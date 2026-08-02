# LAFEA Bucket B4 — Controlled Analytical Execution Pilots

## 1. Authorized scope

B4 implements the B3 controller boundary for exactly two application-template routes:

```text
ALG-LOAD-REFERENCE-TRANSFER -> LAFEA.1
ALG-PIPE-SECTION-COMBINED   -> LAFEA.2
```

No generic T7D route is introduced. Other analytical templates, continuum, shell, recovery, code and release execution remain blocked.

## 2. Public route

```text
executeControlledLafeaAnalyticalPilot(options)
```

The public function is exported through:

```text
src/workspace/lafea-template-execution-public.js
src/workspace/lafea-workbench.js
```

The workbench UI, wizard, panels, views and import adapters do not import or invoke this function. It is a non-UI orchestration surface for explicit controlled requests.

Exact input keys:

```text
request
releaseRecord
compatibilityReceipt
document
productInput
```

## 3. Mandatory authority chain

The controller executes this sequence:

```text
B3 request validation
  -> B1 release-record validation
  -> provided B2 receipt validation
  -> require ENGINE_EXECUTABLE / CURRENT
  -> verify request, release and handoff parent hashes
  -> rebuild the current B2 authority snapshot
  -> re-evaluate current target compatibility
  -> verify exact imported-document FNV revision
  -> invoke the retained executeLafeaStage facade
  -> require accepted stage calculation
  -> verify normalized-source revision is unchanged
  -> issue SHA-256 source authority
  -> create and register the existing lifecycle producer batch
  -> require RESULT_READY
  -> create and register the stage-correct product batch
  -> create an immutable B3 execution receipt
```

No stage dispatch table or numerical formula is duplicated in the controller.

## 4. Source identity

The request cannot contain a caller-supplied source hash. B4 checks the editable document revision before execution, checks the normalized source revision after the retained stage route, then calls:

```text
issueLafeaSourceAuthority(stageId, normalizedSource, originRef)
```

The returned canonical SHA-256 source identity becomes the lifecycle and receipt parent. The FNV digest remains a document revision token only.

## 5. Lifecycle and product evidence

For both pilots the controller consumes the retained producers:

```text
createLafeaLifecycleProducerBatch
registerLafeaLifecycleProducerBatch
```

This registers:

```text
CANONICAL_MODEL
EXECUTION
RESULT_EVIDENCE
```

It then consumes:

```text
createLafeaAnalyticalProductBatch
registerLafeaAnalyticalProductBatch
```

LAFEA.1 registers:

```text
FOUNDATION_DISTRIBUTION
```

LAFEA.2 registers:

```text
SCREENING_ASSESSMENT
```

A failed or blocked product remains evidence but prevents an accepted pilot receipt.

## 6. Receipt semantics

An accepted LAFEA.1 receipt has:

```text
calculationAccepted       = true
resultReady               = true
assessmentApplicability   = NOT_APPLICABLE
assessmentReady           = false
codeReady                 = false
releaseQualified          = false
```

An accepted LAFEA.2 receipt has:

```text
calculationAccepted       = true
resultReady               = true
assessmentApplicability   = APPLICABLE
assessmentReady           = true
codeReady                 = false
releaseQualified          = false
```

Calculation acceptance, result readiness, assessment readiness, code readiness and release qualification remain distinct.

## 7. Independent numerical checks

### Reference transfer

The selected LAFEA.1 fixture independently requires:

```text
source point: [0, 0, 1000] mm
target point: [0, 0, 0] mm
force:        [1000, 0, 0] N
source moment:[0, 0, 0] N·mm
```

Using:

```text
M_target = M_source + r_target_to_source x F
```

Expected transferred result:

```text
force  = [1000, 0, 0] N
moment = [0, 1000000, 0] N·mm
```

Residuals must remain zero. Reversing action sense must reverse both force and moment.

### Combined pipe section

The selected LAFEA.2 closed-form case uses:

```text
Do = 100 mm
Di = 80 mm
r  = 50 mm
```

Independent section properties:

```text
A = pi/4  (Do^2 - Di^2)
I = pi/64 (Do^4 - Di^4)
J = 2I
```

The declared resultants are selected to produce:

```text
sigma_axial   = 100 MPa
sigma_bending = 100 MPa
tau_torsion   = 100 MPa
sigma_total   = 200 MPa
```

The independent expected von Mises stress is:

```text
sqrt(200^2 + 3 * 100^2)
= 264.5751311064591 MPa
```

Pressure factor is zero for this case, so no pressure stress is included in the expected tensor.

## 8. Anti-drift behavior

The B4 check proves or rejects:

```text
edited document after request creation
stale request revision
release record below ENGINE_EXECUTABLE
provided stale B2 receipt
request/release semantic-hash mismatch
benchmark-binding drift
incomplete screening product evidence
deterministic repeated receipt identity
action-sense reversal covariance
UI/wizard/panel/view/import direct controller calls
UI direct executeLafeaStage calls
controller direct numerical-kernel imports
CODE_READY promotion
RELEASE_QUALIFIED promotion
```

Any current target-stage, composition, lifecycle, source, unit, product, mesh or benchmark drift is re-evaluated through B2 immediately before execution.

## 9. State and release boundary

B4 creates a controlled execution path but does not add persistent release records to the template registry. Repository catalogue counts therefore remain:

```text
CATALOGUED          27
RELEASE_QUALIFIED    0
```

The controller only accepts an exact externally supplied B1 record already at:

```text
ENGINE_EXECUTABLE / CURRENT
```

Test fixtures construct such candidate records to qualify the controller. This package does not automatically promote any catalogue entry.

## 10. Explicit non-claims

B4 does not authorize:

```text
general T7D
other analytical templates
continuum execution
shell execution
MITC production authority
recovery or convergence
code assessment
report qualification
release qualification
```

A successful selected-pilot run is evidence for that exact request and parent graph only.
