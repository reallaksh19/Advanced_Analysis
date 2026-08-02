# LAFEA Bucket B5 — Selected Analytical Pilot Qualification

## 1. Purpose

B5 independently qualifies the numerical evidence produced by the two B4 controlled analytical pilots without manufacturing release authority.

```text
ALG-LOAD-REFERENCE-TRANSFER -> LAFEA.1
ALG-PIPE-SECTION-COMBINED   -> LAFEA.2
```

The qualification contract is:

```text
lafea-template-selected-pilot-qualification/v1
```

Its release disposition is always:

```text
NOT_CLAIMED
```

until the complete B1 exact-head release evidence set exists.

## 2. Independent benchmark manifests

Expected values are declared in the pure core module before B5 consumes the B4 report. The module imports no workspace, controller or numerical implementation.

Each manifest records:

```text
manifest identity
template and stage identity
independent evidence basis
expected values
tolerances
expected-value authority
semantic SHA-256
```

The expected-value authority is:

```text
FROZEN_BEFORE_B5_PRODUCTION_EVIDENCE_CONSUMPTION
```

### Reference-transfer manifest

Independent basis:

```text
M_target = M_source + r_target_to_source x F
```

Expected values:

```text
F_target = [1000, 0, 0] N
M_target = [0, 1000000, 0] N·mm
```

Tolerances:

```text
force absolute  = 1e-9 N
force relative  = 1e-12
moment absolute = 1e-6 N·mm
moment relative = 1e-12
```

### Combined-section manifest

Independent basis:

```text
A = pi/4  (Do^2 - Di^2)
I = pi/64 (Do^4 - Di^4)
J = 2I
sigma_vm = sqrt(sigma_x^2 + 3 tau_x_theta^2)
```

For:

```text
Do = 100 mm
Di = 80 mm
sigma_x = 200 MPa
tau_x_theta = 100 MPa
```

Expected:

```text
A  = 2827.433388230814 mm²
I  = 2898119.222936584 mm⁴
J  = 5796238.445873168 mm⁴
sigma_vm = 264.5751311064591 MPa
```

## 3. Evidence chain

The B5 check executes the exact B4 qualification script as a child process on the same checkout. It accepts only the final immutable B4 report when:

```text
schema = lafea-template-b4-analytical-pilot-check/v1
status = PASS
pilot scope is exact
anti-drift count >= 12
selected pilot execution = true
general T7D = false
continuum = false
shell = false
codeReady = false
releaseQualified = false
```

B5 then binds:

```text
exact candidate head
SHA-256 of the B4 check source
SHA-256 of the B4 controller source
SHA-256 of the B4 report
independent benchmark manifests
per-pilot PASS results
```

The resulting qualification semantic hash changes when any parent changes.

## 4. Adversarial qualification checks

B5 rejects:

```text
B4 FAIL status
additional or substituted pilot routes
changed reference force
changed reference moment
changed annulus area
changed second moment
changed polar moment
changed axial stress
changed torsional stress
changed von Mises value
insufficient anti-drift coverage
general T7D promotion
release qualification promotion
missing B4 or controller source hash
invalid exact-head identity
tampered qualification hash
mutable qualification evidence
```

Expected values and tolerances are not modified after production evidence is observed.

## 5. Qualification result

A passing B5 report states:

```text
status = SELECTED_PILOT_EVIDENCE_QUALIFIED
releaseQualification = NOT_CLAIMED
```

This qualifies the selected numerical/evidence package only. It does not create or update a persistent `lafea-template-release-record/v2` at `RELEASE_QUALIFIED`.

## 6. Remaining release gates

Before any selected template can become `RELEASE_QUALIFIED`, the exact B1 record still requires all current parents and evidence, including:

```text
exact-head artifact
build evidence
browser evidence where applicable
performance evidence
accessibility evidence where applicable
independent review
repository-integration evidence
independent benchmark-result hashes
```

Runner jobs that fail before creating executable steps do not satisfy these requirements.

## 7. Authority retained

```text
selected pilot evidence qualified: candidate after exact B5 execution
persistent RELEASE_QUALIFIED records: 0
general T7D: unauthorized
continuum: unauthorized
shell: unauthorized
codeReady: false
releaseQualified: false
```

No production numerical implementation, source authority, lifecycle producer, product producer, stage registry, composition root, shell formulation, tolerance or expected value is changed by B5.
