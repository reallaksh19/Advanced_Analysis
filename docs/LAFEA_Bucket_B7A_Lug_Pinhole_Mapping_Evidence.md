# LAFEA Bucket B7A — Lug-Pinhole Application-Mapping Evidence

## 1. Purpose

B7A closes only the application-mapping prerequisite for:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It consumes the B6 `MAPPING_EVIDENCE_PENDING` caller-mesh binding, the exact T6 stage source, the reconstructed NB-T4A mesh evidence, caller engineering-classification evidence, and an explicit mapping declaration.

It produces three immutable records:

```text
MATERIAL_REGION
LOAD_EDGE
BOUNDARY_EDGE
```

When all three records pass, B7A rebuilds the B6 caller-mesh binding as `BOUND`.

## 2. Contracts

```text
lafea-continuum-application-mapping-evidence/v1
lafea-lug-pinhole-mapping-package/v1
lafea-lug-pinhole-mapping-declaration/v1
```

Every mapping record is bound to:

```text
template and stage identity
source hash
canonical-model hash
analysis-geometry hash
mesh-profile hash
mesh hash
stage-source hash
application-evidence hash
mapping-declaration hash
```

The package additionally binds the pending B6 binding and the rebuilt binding.

## 3. Material-region evidence

The declared material region must identify an existing material and explicit T6 element IDs. `PASS` requires:

```text
every declared element exists
every declared element uses the declared material
all stage-source elements are covered exactly once
```

Missing elements, mismatched material assignments, or incomplete coverage produce `BLOCK` evidence.

## 4. Load-edge evidence

The declared load edge must be one exact quadratic T6 boundary triplet. For a six-node triangle ordered as:

```text
[n1, n2, n3, n12, n23, n31]
```

the accepted edges are:

```text
[n1, n12, n2]
[n2, n23, n3]
[n3, n31, n1]
```

The declaration names the retained load case, the explicit load IDs, the edge nodes, the expected in-plane resultant and absolute/relative tolerances.

`PASS` requires:

```text
the feature is declared by application evidence
the node triplet is an actual T6 boundary edge
all selected loads exist and act on that edge
no retained nodal load in the case is omitted
observed resultant closes to the independently declared resultant
```

No stress or execution inference is made from load closure.

## 5. Boundary-edge evidence

The boundary declaration names one exact T6 edge and explicit zero-valued in-plane constraints. Each constraint contributes a two-dimensional rigid-body row:

```text
UX: [1, 0, -y]
UY: [0, 1,  x]
```

`PASS` requires the selected rows to have rank three, proving restraint of the two translations and one in-plane rotation for the declared fixture.

This is restraint sufficiency for the mapping fixture only. It is not a solver stability, conditioning, or production boundary-condition qualification.

## 6. Positive fixture

The retained B7A qualification fixture uses:

```text
material region: MAT -> E1
load edge:       B - BC - C
load case:       LC1 / F1
expected force:  [1000, 0] N
boundary edge:   A - AB - B
constraints:     A.UX, A.UY, B.UY
rigid-body rank: 3
```

The expected bound disposition is:

```text
mapping package = MAPPING_EVIDENCE_QUALIFIED
caller mesh     = BOUND
```

## 7. Anti-drift behavior

B7A blocks or rejects:

```text
stale source/model/geometry/profile/mesh parents
tampered NB-T4A evidence
missing source-authority record hash
wrong template or stage
changed stage-source connectivity or coordinates
missing application feature declarations
unknown declaration keys
missing material coverage
non-boundary load or restraint node sets
omitted or off-edge loads
resultant residual outside tolerance
omitted, non-zero or off-edge constraints
rigid-body rank below three
tampered or mutable package records
```

## 8. Authority retained

B7A does not:

```text
invoke executeLafeaStage
run a continuum solver
create or register EXECUTION evidence
create or register RECOVERY evidence
create convergence evidence
project display stress
assess code
qualify release
authorize general T7D
```

The resulting package always states:

```text
engineExecutionAuthorized = false
recoveryProduced          = false
convergenceProduced       = false
codeAssessmentProduced    = false
releaseQualified          = false
```

## 9. Next gate

A `BOUND` B7A package closes only the mapping prerequisite recorded in issue #269. Continuum execution remains withheld until exact source/lifecycle parents, authoritative recovery, three-level convergence, independent patch/Kirsch benchmarks, and executable exact-head CI evidence are separately provided.
