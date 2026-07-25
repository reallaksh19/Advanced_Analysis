# LAFEA.5 trunnion-footprint load-introduction shell workflow

## Authority and capability boundary

This package implements Issue #164 as a deterministic, framework-independent adapter between accepted LAFEA.1 attachment-result evidence and the public LAFEA.4 thin-shell kernel.

```text
local-trunnion-footprint-source/v1
local-trunnion-footprint-model/v1
local-trunnion-footprint-result/v1
TRUNNION_FOOTPRINT_PIPE_SHELL_LOAD_INTRODUCTION_ONLY
```

The workflow validates and uses a caller-authored shell patch. It does not generate, project, relocate, smooth, or repair geometry. It models load introduction into a pipe shell only; it does not model the trunnion, weld, contact, bearing, internal pressure, or code acceptance.

Production modules import predecessor behavior only from:

```text
src/core/local-stress/index.js
src/core/local-shell/index.js
```

No private LAFEA.1 or LAFEA.4 file is an architectural dependency.

## Source evidence

The source contract retains:

- exact accepted LAFEA.1 canonical model and result evidence;
- a complete LAFEA.4-compatible shell template without load cases;
- explicit pipe and trunnion axes and radii;
- the ordered footprint node loop and reference point;
- explicit load-case mappings and mechanical scale factors;
- explicit assessment regions;
- a dedicated qualification profile and limitations.

LAFEA.1 model and result hashes are reconstructed through public exports. Rejected, stale, forged, mixed-ancestry, incomplete, or unit-incompatible evidence fails closed. Mechanical mappings are required; pressure-only evidence is unsupported and is never superimposed on the generated shell model.

Canonical units are millimetres, newtons, newton-millimetres, megapascals, and radians. The retained unit bridge explicitly recognizes the equivalent LAFEA.1 `N·mm` and LAFEA.4 `N*mm` spellings.

## Cylinder and footprint qualification

The pipe cylinder is defined by an explicit axis point, unit axis direction, and midsurface radius. Every caller-authored shell node must satisfy the pipe radial-distance rule. Its director must align with the outward pipe radial direction.

The trunnion cylinder is defined independently by an explicit axis point, unit axis direction, and outer radius. Every footprint node must satisfy both cylinders. Initial support is limited to stable non-parallel axes.

Each accepted radial check retains:

- axial coordinate and closest axis point;
- radial vector and radial distance;
- outward direction;
- signed residual;
- workflow-profile qualification;
- caller-declared radial or intersection tolerance qualification.

No node is projected or repaired.

The footprint is an implicitly closed simple mesh-edge cycle with at least three unique nodes. Every consecutive pair, including the closing pair, must exist as an edge in the supplied triangular shell mesh. Cyclic rotations and reversed declarations normalize to one deterministic code-unit identity.

For edge lengths `L_i`, the retained tributary weights are:

```text
tributaryLength_i = 0.5 * (L_previous + L_next)
normalizedWeight_i = tributaryLength_i / footprintPerimeter
```

The loop evidence retains canonical node order, every edge, perimeter qualification, tributary lengths, normalized weights, and a reconstructable footprint hash.

## Reference-point transfer

For each explicit mapping, the accepted LAFEA.1 canonical resultant at source point `r_S` is scaled by the declared mechanical scale factor and transferred to footprint point `r_T`:

```text
F_T = F_S
M_T = M_S + (r_S - r_T) × F_S
```

The workflow reconstructs:

```text
M_S = M_T - (r_S - r_T) × F_S
```

and qualifies the residual independently. The retained formula identity is:

```text
ATTACHMENT_REFERENCE_TRANSFER_V1
```

## Weighted force-only footprint fit

For footprint-node offsets `r_i` and translational nodal forces `f_i`, the generated loading satisfies:

```text
Σ f_i = F_T
Σ (r_i × f_i) = M_T
```

No nodal moment, drilling load, pressure load, weak spring, or automatic support is generated.

With the six-row equilibrium matrix `A`, block-diagonal tributary weight matrix `W`, and target resultant `b`, the unique weighted minimum-norm solution is:

```text
minimize  fᵀ W⁻¹ f
subject to A f = b

f = W Aᵀ (A W Aᵀ)⁻¹ b
```

The implementation solves the deterministic six-by-six constrained system using row scaling and dense Cholesky factorization. Row scaling changes conditioning only, not the feasible equilibrium set. The evidence retains the unscaled and scaled Gram matrices, scaling factors, Cholesky lower factor, pivots, pivot tolerance, fitted nodal forces, reconstructed resultants, and independent force and moment qualifications.

There is no regularization, diagonal shift, pseudoinverse fallback, weak-spring path, hidden redistribution, or tolerance relaxation. Rank-deficient or ill-conditioned footprint geometry fails closed.

Formula identities are:

```text
FOOTPRINT_TRIBUTARY_LINE_WEIGHT_V1
WEIGHTED_FORCE_ONLY_RESULTANT_FIT_V1
RESULTANT_RECONSTRUCTION_V1
```

## Public LAFEA.4 adoption

Before load fitting, the caller shell template is canonicalized and validated through the public LAFEA.4 APIs with a temporary empty mechanical case. The temporary case is not retained.

The workflow preserves caller-authored:

- materials;
- three-dimensional nodes, directors, and tangent bases;
- triangular elements and thicknesses;
- prescribed constraints;
- shell qualification profile;
- result requests;
- limitations.

It generates only explicit nodal-force cases with `m1 = m2 = 0` and empty `pressureLoads`. The complete model is passed through:

```text
createCanonicalLocalShellModel()
validateCanonicalLocalShellModel()
calculateLocalShell()
reconstructShellResultHashes()
```

A rejected shell model or result rejects the workflow without retaining partial authoritative shell arrays.

## Raw stress and assessment regions

Supported region classifications are:

```text
FOOTPRINT_ADJACENT
NEAR_FIELD
FAR_FIELD
BOUNDARY_INFLUENCED
```

Regions may overlap. Every record retains exact shell load-case, element, DKT integration-point, and surface provenance. Membrane, bending, and combined stress remain separate. Governing records are selected from raw same-point combined von Mises values using deterministic provenance tie-breaking.

No nodal averaging, smoothing, extrapolation, tensor mixing, stress linearization, hot-spot extrapolation, or contour authority is emitted. `FOOTPRINT_ADJACENT` records remain explicitly load-introduction-sensitive and are not represented as mesh-objective weld or code stress.

## Hash scopes and rejection containment

The result retains separate hashes for:

```text
sourceEvidenceSemanticHash
canonicalWorkflowModelSemanticHash
footprintGeometryHash
loadDistributionInputHash
loadDistributionResultHash
canonicalShellModelHash
shellResultHash
resultPayloadSemanticHash
executionEvidenceHash
qualificationEvidenceHash
```

Accepted evidence is deeply immutable, JSON-safe, negative-zero normalized, and deterministic under caller-array permutations, footprint cycle rotation, and footprint cycle reversal.

Rejected results retain diagnostics, qualification, ancestry when safely readable, limitations, and reconstructable rejection hashes. They do not retain authoritative footprint geometry, nodal-force distributions, generated shell models, displacements, reactions, strain, curvature, stress, or energy arrays.

## Certification

```bash
npm run check:lafea.5
```

The dedicated suite covers closed contracts, hostile JavaScript values, caller isolation, immutable results, accepted/rejected/stale/forged LAFEA.1 evidence, unit and ancestry mismatch, pipe/trunnion geometry, topology and loop invariance, pure and combined six-component loading, nonzero transfer, exact reconstruction, reversal, scaling, rigid covariance, tributary weights, rank rejection, public LAFEA.4 adoption, stable and singular shell cases, raw stress provenance, deterministic governing selection, repeated-byte identity, hash reconstruction, runtime hygiene, source size, dependency boundaries, and exact-baseline scope.

## Mandatory limitations

```text
NO_TRUNNION_STIFFNESS
NO_WELD_STRESS
NO_CONTACT
NO_PRESSURE_SUPERPOSITION
NO_CODE_COMPLIANCE
RAW_SHELL_STRESS_ONLY
FOOTPRINT_ADJACENT_PEAKS_ARE_LOAD_INTRODUCTION_SENSITIVE
```