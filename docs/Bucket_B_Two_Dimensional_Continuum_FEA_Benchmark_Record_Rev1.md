# Bucket B — Two-Dimensional Continuum FEA Benchmark Record

## Rev 1 — corrected executable shared-gate authority

**Record:** `BKT-B-C2D-BMR-001`  
**Revision:** `Rev 1 corrective v2`  
**Specification status:** `SPECIFICATION_READY`  
**Shared-gate implementation:** `BB-00..BB-05`  
**Planar application state before a qualified v2 receipt:** `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES`  
**Flange-hub state:** `BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION`

This record governs the shared Q8 prerequisite gates for Bucket B. It does not modify, replace, or adjudicate the active Bucket-01 T6 Phase 3 route.

## 1. Authority separation

```text
Bucket-01 Phase 3
FORMULATION_PROFILE = PLANE_STRESS
ELEMENT_PROFILE = T6_PROBE_STABLE_V2

Bucket B planar
FORMULATION_PROFILE = PLANE_STRESS | PLANE_STRAIN
ELEMENT_PROFILE = Q8_FULL_3X3

Bucket B axisymmetric
FORMULATION_PROFILE = AXISYMMETRIC
ELEMENT_PROFILE = AXI_Q8_FULL_3X3
```

Bucket B shall not modify or claim authority over:

```text
Bucket-01 T6 mesh generation
Phase 3 candidate projection
uniform reference replay
production-switch adjudication
BUCKET_01_QUALIFIED
```

A Bucket-01 T6 result may be retained only as a cross-formulation diagnostic. It cannot qualify a Bucket B Q8 record.

## 2. Registered identities

```text
ENGINEERING_LEVEL = LINEAR_2D_CONTINUUM
ELEMENT_PROFILE = Q8_FULL_3X3
RECOVERY_PROFILE_ID = Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1
LOAD_INTEGRATION_PROFILE_ID = Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1
```

Every application record shall retain explicit:

```text
FORMULATION_PROFILE
ELEMENT_PROFILE
MESH_FAMILY_ID
RECOVERY_PROFILE_ID
LOAD_INTEGRATION_PROFILE_ID
```

No formulation may be inferred from a module name or from the prefix `C2D`.

## 3. Application record architecture

Each application module has exactly three mandatory records:

```text
BKT-B-<MODULE>-MESH-001
BKT-B-<MODULE>-CORE-001
BKT-B-<MODULE>-OUT-001
```

Completed records bind:

```text
exactHeadSha
geometryHash
meshProfileHash
meshHashesByLevel
canonicalModelHashesByLevel
solverPolicyHash
loadIntegrationProfileHash
recoveryProfileHash
pathDefinitionHash
referenceAuthorityHash
observedEvidenceHashes
stdoutHash
stderrHash
```

The record `semanticHash` is calculated internally over the complete immutable record. It is not accepted as a caller-supplied binding.

Qualification states are distinct:

```text
FORMULATION_QUALIFIED
APPLICATION_PROCEDURE_QUALIFIED
NUMERICAL_OUTPUT_QUALIFIED
CODE_ASSESSMENT_QUALIFIED
MODULE_QUALIFIED
```

`NUMERICAL_OUTPUT_QUALIFIED` does not imply `CODE_ASSESSMENT_QUALIFIED`. No module may reach `MODULE_QUALIFIED` from an analytical companion benchmark alone.

## 4. Module registry

| Module | Formulation | Element | Initial state |
|---|---|---|---|
| `C2D-LUG-PINHOLE` | `PLANE_STRESS` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-CLAMP-EAR` | `PLANE_STRESS` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-BRACKET-GUSSET` | `PLANE_STRESS` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-PIPE-PAD-SECTION` | `PLANE_STRAIN` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-NOZZLE-REPAD-SECTION` | `PLANE_STRAIN` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-FLANGE-HUB` | `AXISYMMETRIC` | `AXI_Q8_FULL_3X3` | `BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION` |

## 5. Shared prerequisite suite

```text
BKT-B-SH-Q8-PS-PATCH-001
BKT-B-SH-Q8-PE-PATCH-001
BKT-B-SH-Q8-DISTORTED-PATCH-001
BKT-B-SH-Q8-CURVED-LOAD-001
BKT-B-SH-Q8-MESH-QUALITY-001
BKT-B-SH-Q8-RECOVERY-001
BKT-B-SH-SCL-001
BKT-B-SH-INTERFACE-001
BKT-B-SH-Q8-ORACLE-EXECUTABLE-DIFFERENTIAL-001
```

## 6. BB-00 — registry and state authority

The registry is fail-closed:

- callers cannot assign a qualification state when creating a record;
- state changes occur only through the registered transition function;
- direct state skipping is rejected;
- governed hashes are format-validated;
- transition history is immutable and semantic-hash bound;
- a planar record cannot advance from its blocked state without the authoritative shared-gate v2 receipt;
- the flange-hub record cannot advance without an axisymmetric approval hash.

## 7. BB-01 — independent Q8 formulation oracle

The independent Q8 oracle covers:

- serendipity shape functions and partition of unity;
- full `3 × 3` Gauss integration;
- plane-stress and plane-strain constitutive response;
- rigid translations and rotation;
- constant normal and engineering-shear strain fields;
- stiffness symmetry;
- reaction equilibrium;
- strain-energy reconstruction;
- a genuinely distorted Q8 patch;
- explicit exclusion of near-incompressible plane strain above the registered Poisson-ratio scope.

The independent oracle is compared against the existing executable Q8 element implementation at the same exact head. The differential gate compares the local stiffness matrix, Gauss-point Jacobians, and B matrices for both rectangular and distorted elements.

The repository-level suite additionally executes the existing assembled two-element Q8 patch and Kirsch Q8 benchmark.

## 8. BB-02 — variable curved-edge loading

The registered callbacks are:

```text
tractionAt(s, x, y, normal, tangent)
pressureAt(s, x, y)
```

Three-point quadratic consistent loading retains:

```text
true curved-edge arc length
consistent nodal forces
quadrature resultant
quadrature moment
nodal reconstructed resultant
nodal reconstructed moment
```

The curved-boundary qualification uses a governed 16-segment quadratic boundary and compares the production three-point rule with a separately implemented high-order composite-Simpson reference. Cases include:

```text
constant straight-edge traction
uniform curved pressure
cosine bearing pressure
analytical Kirsch traction
```

Nodal force and moment consistency is checked separately from comparison with the independent physical reference.

## 9. BB-03 — mesh quality and convergence

The Q8 quality record retains:

```text
minimumDetJAtGaussPoints
minimumDetJAtControlPoints
qJDeterminantRatio
minimumScaledJacobian
aspectRatio
midsidePlacementResidual
```

It rejects nonpositive mappings, poor determinant ratios, excessive aspect ratio, invalid midside placement, and duplicate interface nodes.

Local quantities require four levels and use `probeH`, not merely global `h`. The convergence evaluator supports nonuniform ratios and emits one of:

```text
PASS_ASYMPTOTIC
PASS_PLATEAU
ADDITIONAL_LEVEL_REQUIRED
NON_ASYMPTOTIC
OSCILLATORY
ZERO_CROSSING_REVIEW
REFERENCE_ERROR_FAILURE
FINEST_CHANGE_FAILURE
EQUILIBRIUM_ONLY
```

A four-level oscillatory local sequence requires another level or a separately governed uncertainty procedure. Total reaction remains an equilibrium quantity rather than a mesh-convergence quantity.

## 10. BB-04 — recovery, paths, and SCL

The governed chain is:

```text
physical path point
→ candidate Q8 elements
→ inverse natural coordinates
→ unique or explicitly selected containing element
→ nine-Gauss-point tensor interpolation
→ orthonormal positively handed local frame
→ ordered authoritative samples
→ component-wise membrane/bending/peak decomposition
```

Recovery evidence retains:

```text
containingElementId
naturalCoordinates
mappingResidual
minimumNaturalCoordinateMargin
sourceGaussPointIds
interpolationWeights
recoveredTensor
```

`minimumNaturalCoordinateMargin` is dimensionless. It is not represented as a physical distance to the element boundary.

Ambiguous containment blocks unless a governed selector identifies the required element or material side. Missing or non-finite tensor components block. Display-only stress and ungoverned samples are inadmissible for SCL calculation.

Pressure correction requires an explicit convention identifier and component-wise corrections. Every manufactured SCL case retains and verifies its expected membrane, bending, and residual behavior.

## 11. BB-05 — interface transfer

Interface qualification is stress-derived. Direct caller-supplied traction is forbidden.

Each side supplies an independently evaluated stress tensor and displacement field. The evaluator:

- applies the declared normal to the left side and the opposing normal to the right side;
- checks an orthonormal, positively handed normal/tangent frame;
- integrates force and physical `r × traction` moment resultants;
- uses scale-aware absolute-plus-relative residual limits;
- checks displacement compatibility.

Manufactured cases cover uniform tension, pure shear, bending, and dissimilar modulus. Negative incompatible-displacement and traction-mismatch cases must block.

## 12. Authoritative shared-gate receipt

There is one authoritative qualification route:

```text
bucket-b-independent-checker-evidence/v1
→ bucket-b-shared-gate-qualification-receipt/v2
→ bucket-b-shared-gate-report/v2
```

The receipt binds:

```text
verification exact-head SHA
base SHA
source-artifact hashes
raw evidence hashes
semantic evidence hashes
changed-path audit
check results
independent-checker evidence
ancestry
```

A qualified receipt states:

```text
status = SHARED_Q8_GATES_QUALIFIED
bb06Authorized = true
applicationModulePromoted = false
axisymmetricAuthorized = false
productionSwitchAuthorized = false
```

No competing summary, synthetic PASS payload, or caller-created check map has qualification authority.

## 13. Exact-head execution

Run locally from the exact repository head:

```bash
export EXPECTED_HEAD_SHA="$(git rev-parse HEAD)"
export EXPECTED_BASE_REF="origin/agent/bucket-b-c2d-benchmark-record"
export STRICT_REPOSITORY_DIFFERENTIAL=1
node scripts/bucket-b-bb00-bb05-check.mjs
```

The GitHub Actions workflow performs the same exact-head run, `git diff --check`, changed-path audit, production-Q8 differential checks, assembled Q8 patch, Kirsch Q8 benchmark, adversarial authority checks, and report-artifact upload.

## 14. Axisymmetric block

`C2D-FLANGE-HUB` remains blocked until independent approval of:

```text
AXI-Q8-REG-001-A  constant-strain axisymmetric patch
AXI-Q8-REG-001-B  thick-cylinder Lamé benchmark
AXI-Q8-REG-001-C  full-circumference load normalization
```

No axisymmetric constitutive, element, loading, recovery, or flange-hub application authority is granted by BB-00 through BB-05.

## 15. Release interpretation

A passing BB-00..BB-05 receipt authorizes starting the controlled BB-06 implementation package. It does not itself execute, qualify, or promote any application module.

```text
BB_00_TO_BB_05_QUALIFIED = receipt-dependent
BB_06_AUTHORIZED = receipt-dependent
APPLICATION_MODULE_PROMOTED = false
AXISYMMETRIC_AUTHORIZED = false
```
