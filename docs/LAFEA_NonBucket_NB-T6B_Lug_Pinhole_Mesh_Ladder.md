# LAFEA Non-Bucket NB-T6B — Lug-Pinhole Production Mesh Ladder

## Purpose

NB-T6B closes one previously explicit LAFEA.3 gap: deterministic production generation of a qualified T6 mesh ladder for the selected `C2D-LUG-PINHOLE` pilot.

The accepted geometry class is intentionally narrow:

```text
one circular outer boundary
minus one concentric circular pin hole
```

The producer does not claim arbitrary lug profiles, arbitrary holes, fillets, notches, weld details or automatic application-geometry inference.

## Generated chain

```text
exact source hash
  + canonical-model hash
  + exact annular analysis-geometry hash
  + three retained mesh profiles
  -> deterministic annular corner rings
  -> shared quadratic midside nodes
  -> counter-clockwise T6 elements
  -> explicit hole/outer/radial feature sets
  -> NB-T4A analysis-mesh evidence at each level
  -> immutable three-level mesh-ladder identity
```

The default qualification fixture uses:

```text
level 1: radial 2, circumferential 16 ->   64 T6 elements
level 2: radial 4, circumferential 32 ->  256 T6 elements
level 3: radial 8, circumferential 64 -> 1024 T6 elements
```

## Geometry representation

Each radial ring is concentric with the declared hole center. Circumferential corner nodes are placed at exact angular stations. Quadratic midside nodes on circumferential edges remain on their analytic ring; radial and diagonal midsides use exact straight-edge midpoints.

Every annular cell is divided into two counter-clockwise triangles. Shared corner edges resolve to one shared midside identity, preventing cracks or duplicate quadratic nodes between adjacent elements.

## Feature evidence

Each generated level retains immutable feature sets for:

- the complete hole boundary;
- the complete outer boundary;
- four quarter radial lines.

Circular boundaries retain ordered T6 edge triplets:

```text
[corner, analytic midside, next corner]
```

These identities are suitable for a later, separately governed material/load/restraint mapping package. NB-T6B does not infer those mappings.

## Quality and determinism

The generator rejects:

- non-positive or reversed radii;
- fewer than eight circumferential divisions;
- circumferential counts not divisible into four exact quarters;
- non-positive Jacobians;
- duplicate node identities;
- non-counter-clockwise element corners.

The package records:

- node and element counts;
- minimum corner scaled Jacobian;
- minimum integration-point Jacobian determinant;
- maximum corner aspect ratio;
- minimum corner angle;
- integrated quadratic-element area;
- analytical annular area and relative error;
- maximum hole and outer-boundary radius error.

The three-level producer additionally requires increasing element counts, distinct mesh hashes and non-increasing geometric area error.

## Authority boundary

NB-T6B introduces production mesh generation only for the selected concentric annular pilot geometry. It does not:

- generate arbitrary application geometry;
- create or modify material, load or restraint mappings;
- construct executable stage documents;
- execute the continuum solver;
- recover stress;
- establish convergence;
- register lifecycle descendants;
- assess code;
- qualify reports or release;
- change shell authority;
- enable LAFEA.6.

The ladder therefore retains:

```text
productionMeshGenerated = true
solverExecuted          = false
recoveryProduced        = false
convergenceProduced     = false
codeAssessmentProduced  = false
releaseQualified        = false
```

## Next package

A later bounded package may project declared physical-problem data and B7A feature mappings onto this ladder and supply the resulting three stage documents to the merged B7D controlled-continuum controller. General lug outlines and arbitrary hole topology require separate meshing authority and independent benchmarks.
