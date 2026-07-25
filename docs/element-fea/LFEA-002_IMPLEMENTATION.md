# LFEA-002 — Q4 isoparametric element and mixed-mesh qualification

## Authority and baseline

- Required baseline: `a2adcffb7b10534daba740d2a488faaba21e7a2e`.
- LFEA-001 remains authoritative for T3, constraints, loads, reactions, residuals, energy, identity and immutable evidence.
- No W10.11, application-shell, registry, view-state, UI or contour behavior is modified.
- The dense LDLᵀ backend remains a small-model reference backend; no sparse or production-scale claim is made.

## Q4 formulation

The implemented Q4 uses the versioned node convention:

```text
N1=(-1,-1), N2=(+1,-1), N3=(+1,+1), N4=(-1,+1)
Q4_CCW_N1_NEG_NEG_N2_POS_NEG_N3_POS_POS_N4_NEG_POS_V1
```

Natural interpolation is bilinear. The Jacobian convention maps global gradients to natural gradients, and its inverse maps natural shape-function derivatives to global derivatives. Engineering shear is retained as `GXY`.

Element stiffness uses fixed full integration:

```text
Q4_GAUSS_2X2_FULL_V1
GP1=(-g,-g), GP2=(+g,-g), GP3=(+g,+g), GP4=(-g,+g)
g=1/sqrt(3), all weights=1
```

Reduced integration, hourglass stiffness, selective integration, assumed strain, enhanced strain and incompatible modes are absent.

## Geometry and Jacobian policy

Q4 connectivity is accepted only when the supplied order is strictly convex and counterclockwise. No connectivity repair or absolute determinant is used. Jacobian determinants are checked against the existing geometry tolerance at every Gauss point and every natural corner. Corner checks prevent an internal sign change that centre-only or Gauss-only evidence could miss for a bilinear mapping.

Quality evidence retains:

- turn measures;
- Gauss-point and corner determinants;
- minimum and maximum determinant;
- determinant ratio;
- edge lengths and edge-length ratio;
- maximum absolute corner cosine.

Extreme aspect ratio and skew are exposed as evidence but are not silently repaired or assigned an invented acceptance threshold.

## Mixed T3/Q4 conformity

T3 and Q4 edges are both linear two-node edges. A conforming interface therefore requires the same two node identities and the same global DOFs. The model validator rejects duplicate coincident nodes and nodes lying in the interior of another element edge. Edge ownership is deterministic and shared internal edges cannot receive ordinary boundary loads.

No hanging-node constraint, multipoint constraint, automatic merge or geometric repair is introduced.

## Edge loading

Q4 edge traction and pressure use deterministic two-point one-dimensional Gauss integration. Edge parameterization follows the counterclockwise element boundary. The edge Jacobian comes from the global tangent, and the outward normal is the right-hand normal to that tangent. Positive pressure is compressive and acts opposite the outward normal.

The result retains each edge integration point, shape functions, natural/global coordinates, edge Jacobian, normal, traction and nodal-force contribution.

## Stress and result evidence

Pure T3 runs retain `fea-continuum-result/v1` without reinterpretation. Any Q4 or mixed run returns the closed successor:

```text
fea-continuum-result/v2
```

Q4 raw strain and stress remain at the four Gauss points. Each record includes element identity/type, integration-point identity, natural/global coordinates, strain, stress, `sigmaZ`, principal stresses, principal orientation, von Mises stress and energy contribution.

No extrapolated corner, nodal, averaged, smoothed or unrestricted nodal-maximum stress is created.

## Plane strain and locking

Constitutive admissibility remains `-1 < nu < 0.5`. Algebraic conditioning remains backend evidence. Full-integration Q4 plane strain can exhibit volumetric locking near incompressibility even when the material and matrix remain admissible. LFEA-002 adds a visible applicability diagnostic and limitation for every plane-strain Q4 run; it does not invent a Poisson-ratio threshold or change the formulation.

## Qualification

Run:

```text
node scripts/lfea-002-check.mjs
```

The suite covers interpolation, Jacobian mapping, B matrices, hand calculation, regular/distorted patches, rigid modes, plane stress/strain, shear, biaxial response, all-edge pressure direction, global traction, reactions, prescribed displacement, mixed T3/Q4 conformity, reversed/crossed/concave/collapsed rejection, determinant sign change, unsupported integration requests, singularity, determinism and immutability.

The dedicated workflow also executes the merged LFEA-001 suite and invokes no W10.11 authority.

## Limitations

- Q4 full 2×2 integration only.
- T3 and Q4 linear continuum elements only.
- No nonconforming interfaces or hanging nodes.
- No stress extrapolation or smoothing.
- No automatic mesh generation, repair or refinement.
- No near-incompressible mixed or assumed-strain remedy.
- No body force, gravity, thermal, nonlinear, contact, buckling or dynamics.
- No application integration or piping-code qualification.
