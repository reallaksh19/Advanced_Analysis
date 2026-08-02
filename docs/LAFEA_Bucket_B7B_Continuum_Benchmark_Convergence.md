# LAFEA Bucket B7B — Independent Continuum Benchmark and Convergence Evidence

## 1. Purpose

B7B freezes and evaluates the independent benchmark evidence required before the bounded pilot:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

may advance toward execution qualification.

B7B is a pure contract package. It does not run either benchmark, invoke the production stage route, manufacture recovery, or register lifecycle evidence.

## 2. Governing retained sources

The manifests are SHA-256 bound to:

```text
scripts/lafea.3-benchmark-cont-patch-01-check.mjs
scripts/lafea.3-benchmark-cont-hole-01-check.mjs
```

A changed source hash makes an observation `STALE` even when its numerical values remain unchanged.

## 3. Contracts

```text
lafea-continuum-benchmark-manifest/v1
lafea-continuum-benchmark-observation/v1
lafea-continuum-benchmark-qualification/v1
lafea-convergence-lifecycle-parent-proposal/v1
```

Expected values carry the authority:

```text
FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION
```

This prevents observed output from redefining benchmark expectations.

## 4. CONT-PATCH-01 authority

The retained benchmark is an assembled two-element Q8 patch with one free shared midside node `F`. The prescribed affine field is:

```text
epsilon_x =  0.001
epsilon_y = -0.0003
gamma_xy = 0
```

For the retained plane-stress material:

```text
E  = 200000 MPa
nu = 0.3
```

the frozen expected evidence is:

```text
F displacement = [0.05, -0.015] mm
strain          = [0.001, -0.0003, 0]
stress          = [200, 0, 0] MPa
elements        = 2 Q8
gauss points    = 9 per element
```

The retained comparison requirement is:

```text
relative tolerance <= 1e-10
```

The B7B evaluator compares supplied recovery evidence against these values. It does not produce that recovery.

## 5. CONT-HOLE-01 authority

The retained benchmark is the classical Kirsch circular-hole problem represented by a quarter-symmetric annular Q8 patch.

The finite outer radius does not use a uniform remote-stress approximation. The retained benchmark applies:

```text
EXACT_KIRSCH_TRACTION_ON_TRUNCATED_OUTER_BOUNDARY
```

so that the truncated model reproduces the infinite-plate closed-form boundary traction.

Frozen expected values include:

```text
remote stress S          = 50 MPa
theoretical peak factor  = 3
peak hoop stress target  = 150 MPa
```

The exact three refinement levels are:

```text
level 1: radial 3,  circumferential 6
level 2: radial 6,  circumferential 12
level 3: radial 10, circumferential 20
```

Qualification requires:

```text
finest peak-factor relative error < 5%
finest peak-factor error improves relative to level 1
full-field normalized error decreases strictly at each level
finest full-field normalized error < 5%
three distinct mesh hashes
three distinct recovery hashes
```

## 6. Observation dispositions

```text
PASS     exact source and all numerical requirements satisfied
BLOCKED  exact source but one or more benchmark requirements failed
STALE    retained benchmark source hash changed
```

Structural contract violations are rejected rather than classified.

## 7. Qualification package

A combined passing package states:

```text
status = BENCHMARK_EVIDENCE_QUALIFIED
```

It binds:

```text
exact candidate head
B7A mapping-package hash
patch manifest and observation
Kirsch manifest and observation
three-level recovery-set hash
```

The qualification package preserves the distinction between independent benchmark recovery and the future pilot recovery.

## 8. Lifecycle parent proposal

The FEA lifecycle requires the exact CONVERGENCE parents:

```text
recoveryHash
recoverySetHash
convergenceProfileHash
```

B7B can provide:

```text
recoverySetHash          = hash of the three independent benchmark recoveries
convergenceProfileHash   = CONT-HOLE-01 manifest hash
```

It deliberately leaves:

```text
recoveryHash = null
```

because the actual `C2D-LUG-PINHOLE` pilot recovery does not yet exist. Therefore:

```text
status                 = PILOT_RECOVERY_PARENT_REQUIRED
registrationAuthorized = false
```

The proposal cannot be registered as a lifecycle `CONVERGENCE` artifact.

## 9. Anti-drift coverage

B7B rejects or blocks:

```text
changed expected-value authority
wrong benchmark source path
changed benchmark source hash
changed patch displacement, strain or stress
wrong Q8 element or Gauss-point counts
missing or reordered Kirsch levels
non-increasing refinement definitions
duplicate mesh or recovery hashes
peak error that does not improve
finest peak error above 5%
non-monotonic full-field error
finest full-field error above 5%
swapped benchmark kinds
invalid exact-head identity
tampered or mutable manifests, observations or qualification records
```

## 10. Authority retained

Every B7B qualification record states:

```text
engineExecutionAuthorized = false
recoveryProduced          = false
convergenceRegistered     = false
codeAssessmentProduced    = false
releaseQualified          = false
generalT7dAuthorized      = false
```

B7B does not call `executeLafeaStage`, call `calculateLocalContinuum`, register lifecycle evidence, project nodal/display stress, assess code, or qualify release.

## 11. Remaining B7 gate

After B7A and B7B, the bounded pilot still requires:

```text
an exact controlled continuum execution request/receipt
actual pilot source/lifecycle parents
actual authoritative integration-point recovery
actual pilot recoveryHash
three-level pilot convergence evidence
executable exact-head CI evidence
```

Until those exist, issue #269 remains an unresolved implementation gate.
