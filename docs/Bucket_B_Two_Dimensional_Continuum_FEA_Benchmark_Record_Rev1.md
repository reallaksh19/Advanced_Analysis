# Bucket B — Two-Dimensional Continuum FEA Benchmark Record

## Rev 1 execution authority

**Record:** `BKT-B-C2D-BMR-001`  
**Revision:** `Rev 1 — executable shared-gate architecture`  
**Status:** `SPECIFICATION_READY`  
**Planar application execution:** `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES`  
**Flange-hub execution:** `BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION`

Rev 1 converts the Rev 0 qualification specification into an executable benchmark architecture without modifying the active Bucket-01 Phase 3 route.

## Authority separation

The following authorities are independent and shall not be substituted for one another:

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

Bucket B must not modify or adjudicate:

```text
Bucket-01 T6 mesh generation
Phase 3 candidate projection
uniform reference replay
production-switch adjudication
BUCKET_01_QUALIFIED
```

A Phase 3 T6 result may be retained only as a cross-formulation diagnostic. It cannot qualify a Bucket B Q8 record.

## Mandatory identity fields

Every Bucket B application record shall bind:

```text
FORMULATION_PROFILE
ELEMENT_PROFILE
MESH_FAMILY_ID
RECOVERY_PROFILE_ID
LOAD_INTEGRATION_PROFILE_ID
```

The registered Q8 identities are:

```text
ENGINEERING_LEVEL = LINEAR_2D_CONTINUUM
ELEMENT_PROFILE = Q8_FULL_3X3
RECOVERY_PROFILE_ID = Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1
LOAD_INTEGRATION_PROFILE_ID = Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1
```

The legacy `LINEAR_2D_CONTINUUM_CST_ONLY` identity is not used by Bucket B. It remains untouched for existing routes until separately migrated under their own authority.

## Application record architecture

Each module has exactly three mandatory application records:

```text
BKT-B-<MODULE>-MESH-001
BKT-B-<MODULE>-CORE-001
BKT-B-<MODULE>-OUT-001
```

Each completed record shall bind:

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
semanticHash
```

Qualification states are distinct:

```text
FORMULATION_QUALIFIED
APPLICATION_PROCEDURE_QUALIFIED
NUMERICAL_OUTPUT_QUALIFIED
CODE_ASSESSMENT_QUALIFIED
MODULE_QUALIFIED
```

`NUMERICAL_OUTPUT_QUALIFIED` does not imply `CODE_ASSESSMENT_QUALIFIED`. A module cannot reach `MODULE_QUALIFIED` from an analytical companion benchmark alone.

## Registered module formulations

| Module | Formulation profile | Element profile | Rev 1 state |
|---|---|---|---|
| `C2D-LUG-PINHOLE` | `PLANE_STRESS` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-CLAMP-EAR` | `PLANE_STRESS` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-BRACKET-GUSSET` | `PLANE_STRESS` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-PIPE-PAD-SECTION` | `PLANE_STRAIN` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-NOZZLE-REPAD-SECTION` | `PLANE_STRAIN` | `Q8_FULL_3X3` | `EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES` |
| `C2D-FLANGE-HUB` | `AXISYMMETRIC` | `AXI_Q8_FULL_3X3` | `BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION` |

No formulation may be inferred from a template or module name.

## Shared prerequisite benchmark suite

The following gates shall pass before application-shaped execution:

```text
BKT-B-SH-Q8-PS-PATCH-001
BKT-B-SH-Q8-PE-PATCH-001
BKT-B-SH-Q8-DISTORTED-PATCH-001
BKT-B-SH-Q8-CURVED-LOAD-001
BKT-B-SH-Q8-MESH-QUALITY-001
BKT-B-SH-Q8-RECOVERY-001
BKT-B-SH-SCL-001
BKT-B-SH-INTERFACE-001
```

## BB-00 through BB-05 implementation

### BB-00 — registry and authority

Implemented in `src/core/bucket-b/registry.js`:

- formulation and element-profile registry;
- mandatory record IDs and binding fields;
- fail-closed flange-hub axisymmetric gate;
- qualification-state transition enforcement;
- separate numerical-output and code-assessment states.

### BB-01 — Q8 formulation

Implemented in `q8-kernel.js` and `formulation-benchmarks.js`:

- Q8 serendipity shape functions;
- 3 × 3 full integration identity;
- partition of unity;
- rigid translations and rotation;
- constant normal and engineering-shear strain patches;
- stiffness symmetry;
- exact reaction equilibrium;
- exact strain-energy reconstruction;
- plane-stress `sigmaZ = 0` custody;
- plane-strain `epsilonZ = 0`, recovered `sigmaZ`, and declared Poisson-ratio scope.

Near-incompressible plane strain is not qualified by this package.

### BB-02 — variable curved-edge loads

Implemented in `variable-edge-load.js`:

```text
tractionAt(s, x, y, normal, tangent)
pressureAt(s, x, y)
```

Both are integrated with the registered quadratic three-point edge rule. Evidence includes nodal consistent forces, true arc length, total resultant, moment about a declared origin, and normalization residual. Registered cases cover constant traction, curved uniform pressure, cosine pressure, and analytical Kirsch traction.

### BB-03 — Q8 quality and convergence

Implemented in `q8-quality.js` and `convergence.js`:

```text
minimumDetJAtGaussPoints
minimumDetJAtControlPoints
qJDeterminantRatio
minimumScaledJacobian
aspectRatio
midsidePlacementResidual
```

The determinant ratio is evaluated over both Gauss and control points. Local stress, SCL, finite-radius peak, reaction split, reaction density, and reaction moment require four mesh levels. Richardson order is solved using actual characteristic-size ratios; `ln(2)` is not assumed. Total reaction is classified as equilibrium-only.

### BB-04 — fixed-coordinate recovery, paths and SCL

Implemented in `fixed-coordinate-recovery.js` and `path-and-scl.js`:

```text
geometry path
→ containing Q8 element
→ inverse natural coordinates
→ nine-point Gauss interpolation
→ local tensor rotation
→ ordered authoritative samples
→ component-wise membrane/bending/peak
```

The recovery record retains containing element, natural coordinates, mapping residual, boundary distance, source Gauss IDs, interpolation weights, and recovered tensor. SCL manufactured cases cover membrane, bending, combined response, nonlinear residual peak, rotated tensor, and pressure-corrected/uncorrected variants.

### BB-05 — conformal interface resultants

Implemented in `interface-resultants.js`:

- two-sided force resultant;
- two-sided moment resultant;
- explicit traction sign convention;
- normal/tangent orientation;
- displacement compatibility;
- uniform tension, pure shear, bending, and dissimilar-modulus benchmark cases.

## Mesh-level correction

Local qualifying quantities require:

```text
M0
M1
M2
M3
```

Three levels may remain sufficient for monotonic global displacement and energy quantities. Actual global and probe-local characteristic sizes must be retained.

## Independent reference rule

Every application-shaped case without a closed-form solution requires an independently prepared reference. A finer mesh produced by the same mesh generator, solver, recovery implementation, and extraction path is not independent verification.

## Axisymmetric block

`C2D-FLANGE-HUB` remains blocked until independent approval of:

```text
AXI-Q8-REG-001-A  constant-strain axisymmetric patch
AXI-Q8-REG-001-B  thick-cylinder Lamé benchmark
AXI-Q8-REG-001-C  full-circumference load normalization
```

No axisymmetric constitutive, element, loading, recovery, or flange-hub record is introduced by BB-00 through BB-05.

## Executable check

Run:

```bash
node scripts/bucket-b-bb00-bb05-check.mjs
```

A passing run confirms the shared implementation checks only. It does not promote any application module beyond its registered blocked state and does not constitute code-assessment approval.
