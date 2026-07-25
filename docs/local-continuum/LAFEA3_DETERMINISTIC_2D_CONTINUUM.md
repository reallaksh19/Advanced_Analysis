# LAFEA.3 deterministic 2D continuum solver foundation

## Authority and scope

This module implements Issue #151 as a framework-independent, small-model,
linear-elastic continuum kernel. It supports only three-node constant-strain
triangles with two translational degrees of freedom per node.

Engineering level:

```text
LINEAR_2D_CONTINUUM_CST_ONLY
```

Supported formulations:

```text
PLANE_STRESS
PLANE_STRAIN
```

The module does not import from `src/core/element-fea/**` and has no UI,
Workspace, application-shell, registry, view-state, network, filesystem,
clock, random, shell, contact, nonlinear, weld, fatigue, buckling, fracture,
or code-compliance integration.

## Public API

```js
import {
  createCanonicalLocalContinuumModel,
  validateCanonicalLocalContinuumModel,
  calculateLocalContinuum,
  reconstructContinuumResultHashes,
} from './src/core/local-continuum/index.js';
```

Contracts:

```text
local-continuum-model/v1
local-continuum-result/v1
```

The creation boundary rejects unknown fields, coerced or non-finite numbers,
functions, symbols, cycles, non-plain objects, duplicate identities, unresolved
references, disconnected nodes, duplicate triangles, and unsupported element
shapes. It converts only explicitly registered units, canonicalizes all identity
collections by code-unit order, normalizes triangle orientation to a unique
counter-clockwise node order, retains source evidence, and seals the model with
reconstructable hashes.

## Canonical units

```text
length  = mm
force   = N
stress  = MPa = N/mm^2
modulus = MPa
strain  = dimensionless
```

Plane-stress thickness is the physical out-of-plane thickness. Plane-strain
thickness is the declared representative width used only for force, reaction,
stiffness, and energy scaling.

## CST formulation

Engineering strain and stress ordering is:

```text
epsilon = [epsilonX, epsilonY, gammaXY]^T
sigma   = [sigmaX, sigmaY, tauXY]^T
```

Each element retains its canonical area, area qualification, B matrix,
constitutive D matrix, local DOF ordering, local stiffness matrix, geometry
conditioning, rigid-body residual, affine patch residual, symmetry residuals,
source references, and executed formula identities.

```text
Ke = thickness * area * transpose(B) * D * B
```

The `signedAreaBeforeNormalization` field is evaluated immediately before the
CST matrix construction on the canonical counter-clockwise node order. Input
clockwise and cyclic node declarations therefore produce the same canonical
model and element evidence.

No numerical symmetrization is applied to an element or global stiffness
matrix. Symmetry is measured and qualified directly.

## Loads and constraints

Each load case explicitly contains its nodal-force records and uniform
boundary-edge traction records. No load combination or default case is
invented.

For a declared boundary edge:

```text
forceAtEachEnd = traction * edgeLength * thickness / 2
```

Traction components are global `tx` and `ty` stress components. The kernel does
not infer a pressure-normal direction. A traction edge must belong to the
specified element and must be used by exactly one element. Reversing its two
node IDs does not change canonical identity or results.

Prescribed displacements are enforced by exact free/constrained matrix
partitioning. Penalty stiffness is not used.

## Global solution

DOFs are ordered deterministically:

```text
nodeId in code-unit order, then UX, then UY
```

The free stiffness system is solved by a deterministic dense Cholesky factor.
Non-positive or inadequately small pivots fail closed as indefinite, singular,
or under-constrained systems. Accepted load-case evidence includes:

- complete assembled force evidence;
- free and constrained DOF identities;
- Cholesky pivots, pivot scale, tolerance, and pivot ratio;
- nodal displacements;
- constrained-DOF reactions from `R = K u - F`;
- free-DOF residuals;
- reaction-plus-applied-force equilibrium;
- element and global strain-energy reconstruction.

## Stress recovery

For every accepted element and load case:

```text
epsilon = B * ue
sigma   = D * epsilon
```

Plane stress emits `sigmaZ = 0`.

Plane strain emits:

```text
epsilonZ = 0
sigmaZ = poissonRatio * (sigmaX + sigmaY)
```

Principal stresses and maximum in-plane shear use the same constant element
stress state. Von Mises uses the full three-dimensional state including the
formulation-correct `sigmaZ`.

The CST stress is element-constant. No nodal, averaged, smoothed, extrapolated,
or contour-authority stress is emitted.

## Determinism and hashes

The model and result use JSON-safe plain data, calculated negative-zero
normalization, code-unit ordering, caller isolation, deep immutability, and
separate evidence scopes:

```text
sourceEvidenceSemanticHash
canonicalModelSemanticHash
loadCaseInputSemanticHash
resultPayloadSemanticHash
executionEvidenceHash
qualificationEvidenceHash
```

Rejected results retain deterministic qualification, diagnostics, limitations,
and hashes but omit authoritative mesh, displacement, reaction, strain, stress,
and energy arrays.

## Certification

```bash
npm run check:lafea.3
```

The dedicated command covers contracts, containment, JSON safety, affine and
rigid-body element fields, orientation invariance, constitutive and stiffness
symmetry, material and thickness scaling, constrained and singular solves,
two-triangle extension patches, nodal-force/traction parity, load scaling and
reversal, plane-stress and plane-strain stress recovery, pure shear, principal
and von Mises reconstruction, reaction and residual qualification, energy,
permutation invariance, repeated-byte identity, negative-zero elimination, and
exact-baseline source scope.

## Mandatory limitations

```text
NO SHELL ELEMENTS
NO BENDING DOF
NO DRILLING DOF
NO CONTACT
NO FRICTION
NO PLASTICITY
NO LARGE DISPLACEMENT
NO MATERIAL NONLINEARITY
NO BUCKLING
NO FATIGUE
NO CRACK OR FRACTURE
NO ADAPTIVE MESHING
NO AUTOMATIC MESH GENERATION
NO STRESS SINGULARITY ACCEPTANCE
NO ATTACHMENT-SPECIFIC LOCAL STRESS
NO WELD STRESS
NO CODE COMPLIANCE
NO NODAL STRESS AVERAGING
NO CONTOUR AUTHORITY
NO UI OR APPLICATION INTEGRATION
```
