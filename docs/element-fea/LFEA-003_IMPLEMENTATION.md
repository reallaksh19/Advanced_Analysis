# LFEA-003 — Mesh-convergence and governed stress-interpretation evidence

## Authority and baseline

- Authorized baseline: `b382a6f771d24adf33a31bcd62448a20973e58f0`.
- LFEA-001 and LFEA-002 solver formulations and raw-result meanings remain unchanged.
- This increment adds post-processing contracts only. It does not modify stiffness, load assembly, constraints, solution, reactions, or raw integration-point recovery.
- No application-shell, workspace, W11, graphical contour, automatic meshing, or production-solver behavior is added.

## Contracts

```text
fea-continuum-model/v1
+ fea-continuum-result/v1 or v2
+ fea-convergence-study/v1
→ fea-convergence-result/v1

qualified raw stress
→ fea-stress-projection/v1
  status = NON_AUTHORITATIVE_REVIEW_PROJECTION
```

Every study and projection is immutable and separately hashed using the repository canonical JSON and semantic-hash authority.

## Comparable-problem qualification

Each mesh level explicitly retains model/result identities and semantic hashes, source ancestry, study-region mapping, physical-entity mappings, material mappings, load mappings, restraint mappings, point-probe mappings, and any displacement-functional mapping.

The study fails closed unless all levels prove the same:

- formulation and units;
- material properties;
- thickness or plane-strain out-of-plane scale;
- load-case identity;
- applied force and moment totals;
- canonical geometry, material, load, and restraint entities;
- requested quantities and physical probe coordinates;
- immutable model/result ancestry.

Equal force totals alone are not accepted as physical-problem identity.

## Mesh metric and order

For each declared region:

```text
h = max sqrt(Ae)
```

T3 area uses accepted positive signed area. Q4 area is the deterministic sum of positive `det(J)` values under the qualified full `2 × 2` rule. The result also retains minimum, maximum, and mean element size, element counts, T3/Q4 composition, and refinement ratios.

Levels are canonically ordered by decreasing `h`. A required declared order must agree with that derived order. Equal or increasing `h` fails closed; levels are never silently relabelled.

## Fixed physical probes

Every probe mapping supplies the containing element, element type, natural or area coordinates, reconstructed global coordinates, and reconstruction residual. The implementation verifies reconstruction against the same declared physical point at every level.

- Q4 displacement, strain, and stress are recovered directly from the Q4 field at the supplied natural coordinates.
- T3 displacement uses area-coordinate interpolation and its constant strain/stress field.
- Nearest-node substitution and automatic point search are absent.

Supported point quantities are `UX`, `UY`, displacement magnitude, `EX`, `EY`, `GXY`, `SX`, `SY`, `TXY`, `SIGMA_Z`, von Mises, and the three principal values.

## Scalar convergence evidence

Each quantity retains its ordered `(h, q)` history, signed and relative successive changes, scale policy, difference sequence, monotonicity evidence, and deterministic classification:

```text
EXACT_OR_INVARIANT
MONOTONIC_CONVERGING
OSCILLATORY_CONVERGING
NONCONVERGENT_RISING
NONCONVERGENT_OSCILLATORY
ZERO_CROSSING_UNRESOLVED
INSUFFICIENT_LEVELS
INCOMPARABLE
```

No generic `CONVERGED` status is emitted from a single small final increment.

Observed order is reported only for a monotonic, shrinking-difference sequence with at least three levels, positive approximately constant refinement ratio, nonzero same-sign differences, and positive finite order:

```text
p = ln(|(q1-q2)/(q2-q3)|) / ln(r)
```

Conditional Richardson evidence is labelled `ESTIMATED_ASYMPTOTIC_VALUE`:

```text
qext = q3 + (q3-q2)/(r^p-1)
```

It is not represented as an exact answer or certified error bound. No Grid Convergence Index is implemented.

## Stress-trend interpretation

Raw fixed-probe and regional-maximum histories are reported separately. Required statuses are:

```text
BOUNDED_AND_STABILIZING
RISING_WITH_REFINEMENT
OSCILLATORY
LOCATION_MIGRATING
INSUFFICIENT_EVIDENCE
INCOMPARABLE
```

Governing-location migration is based on physical coordinates where available, with identity fallback only when coordinate evidence is unavailable. A rising sequence plus declared feature ancestry may produce `SINGULARITY_SUSPECTED`; `SINGULARITY_PROVEN` is never produced.

## Governed stress projection

Raw element and integration-point stress remains authoritative.

T3 projected corners copy the constant element stress while retaining the source element and raw-point identity. Q4 projection applies the versioned matrix `Q4_GAUSS_2X2_TO_NATURAL_CORNERS_V1` component by component in fixed `GP1..GP4` and `C1..C4` order. Every corner record retains all source Gauss-point identities and coefficients.

Nodal review projection is area weighted and retains contributor element/corner identities, source integration points, weights, weighted value, minimum, maximum, and contributor spread. Projection patches remain separate across:

- material identity/properties;
- formulation;
- thickness or out-of-plane scale;
- declared discontinuities;
- disconnected edge-connected patches;
- source ancestry.

Projected stress is explicitly prohibited for convergence order, singularity classification, acceptance, design-code checks, governing maxima, reaction/equilibrium evidence, or replacement of raw stress tables.

## Qualification

Run:

```text
node scripts/lfea-003-check.mjs
```

The suite covers invariant, monotonic, oscillatory, zero-crossing, rising and migrating histories; guarded order/Richardson evidence; T3/Q4 fixed probes; comparable-problem rejection; stale hashes; Q4 constant/linear extrapolation; area-weighted averaging and boundary separation; authority rejection; determinism; and immutability.

The dedicated workflow checks out the exact authorized head, runs LFEA-001 and LFEA-002 behavioral regressions without predecessor path guards, runs LFEA-003 qualification and syntax checks, and invokes only the LFEA-003 source guard.

## Limitations

- Evidence and interpretation only; no validation against physical reality is claimed.
- Model-form uncertainty remains outside discretization trend evidence.
- No automatic point search, meshing, refinement, adaptive error estimation, or remeshing.
- The scalar region metric `h = max sqrt(Ae)` does not by itself characterize anisotropic element directions, strongly graded meshes, local refinement away from the quantity of interest, or refinement concentrated outside the declared study region.
- Mixed T3/Q4 areas are comparable through physical area, but element shape quality and directional resolution remain separate evidence.
- No GCI, safety factor, certified error bound, stress linearization, fracture, fatigue, code compliance, or commercial-solver equivalence.
- No new element, reduced integration, locking remedy, sparse backend, nonlinear analysis, or application UI.
