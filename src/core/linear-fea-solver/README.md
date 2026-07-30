# Sparse assembly and solver

This package assembles one bound `fea-linear-mechanical-model-compilation/v1` (B-2.5), its B-3.1/B-3.2 element contributions and one `fea-linear-physical-load-case/v1` (B-3.0) into a solved, qualified `fea-linear-execution/v1` record: DOF map, deterministic assembly, boundary-condition partitioning, factorization, displacement, reactions and the section 8.1 numerical qualification gates. It is the LFEA-B3.3 exit boundary (sections 7.2, 8, 8.1, 9 displacement/reaction).

It does not recover element end actions or component resultants at physical code points (B-3.4), and it does not evaluate any B31.3 stress, allowable or SIF (B-4.0). It reads no element or component mechanics itself: every stiffness and load vector it assembles was already sealed by B-3.1 or B-3.2, re-accepted here through `requireElementContribution` rather than re-derived.

## Backend identity, stated honestly

Section 8 asks for "sparse Cholesky for qualified positive-definite systems". Assembly here is genuinely sparse — deterministic COO triplets, sorted and summed in canonical order before anything touches a dense array. The factorization backend is a direct dense Cholesky, falling back to LDLT with pivot diagnostics, implemented in pure JS for the single-system, single-digit-to-low-hundreds-of-DOF scale this release targets. Its identity is named for what it is, `FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1`, rather than borrowing the illustrative production-sparse-solver string in the section 13 example. No section 8.1 gate is loosened by that choice; every threshold is enforced exactly as declared, against the real factorization this package performs.

## Inputs

Every input is passed explicitly; the package reads no module-level state:

```text
compilation           fea-linear-mechanical-model-compilation/v1   (B-2.5 validator)
elementContributions  one fea-linear-frame-element/v1 or fea-linear-piping-component/v1
                       span per model element, normalized through
                       elementContributionFromFrameElement / elementContributionsFromPipingComponent
loadCase              fea-linear-physical-load-case/v1              (B-3.0 validator)
solverProfile         fea-linear-solver-profile/v1
cache                 optional factorization cache (Map); a one-shot cache is created if omitted
```

`loadCase.modelReference` must cite the same `modelIdentity`, `modelRevision`, `mechanicalModelSemanticHash` and `stiffnessStateHash` as the bound compilation — section 7.2's "one factorizable stiffness state plus one physical right-hand side" bound to that same state — or the call is refused with `SOLVER_LOAD_CASE_MODEL_MISMATCH` rather than solved against a mismatched model.

## DOF map, assembly, boundary conditions

`buildDofMap` orders nodes by the B-2.0 `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1` rule and lays out the frozen six-DOF order per node, exported as `fea-linear-dof-map/v1` evidence. `assembleGlobalSystem` turns every element contribution and every `LINEAR_SPRING` constraint into `(row, col, value, tag)` triplets, sorts them by `(row, col, tag)` — never by object or `Map` iteration order — and sums duplicates in that order, so the assembled system is reproducible independent of input ordering. `FIXED` and `PRESCRIBED_SLOT` constraints are eliminated identically into the same partition (section 7.2); the partition itself is hashed (`partitionHash`) from the constrained DOF identities alone.

## Factorization, scaling and reuse

`computeDiagonalEnergyScaling` builds a genuine `1/sqrt(Kii)` diagonal preconditioner over the free-free partition (`DIAGONAL_ENERGY_SCALING_V1`), retaining every factor. `factorizeFreePartition` attempts Cholesky first; a non-positive pivot falls back to LDLT, whose pivots are read directly for diagnostics rather than only trusted to succeed or fail. A whole connected component carrying no restraint of any kind is refused before factorization even starts (`SOLVER_MECHANISM_FLOATING_COMPONENT`, `connectedComponents`/`detectFloatingComponents`); a near-zero or negative LDLT pivot is reported by the exact `nodeId:dof` and connected component it occurred at (`SOLVER_NEAR_ZERO_PIVOT`), and a fully negative-definite free-free system is `SOLVER_SYSTEM_INDEFINITE`.

Reuse is keyed by `` `${stiffnessStateHash}:${partitionHash}` `` (section 7.2: "not load-case or evidence hash") through a plain `Map` cache the caller owns and passes in; `getOrFactorize` returns the identical factorization object on a cache hit, so reuse is provable with `===`, not merely claimed. A changed stiffness state or a changed partition always misses.

## Qualification (section 8.1)

Every gate value and every limit it is judged against comes from the resolved solver profile via `requireDeclaredValue` — none is a literal in this package. `residualCheck` normalizes `||Kff Uf - Ffree||` against `max(||Ffree||, floor)`; `forceEquilibriumCheck` and `momentEquilibriumCheck` sum `K U` over every node as an independent free-body balance (moment about the first canonical node, `FIRST_CANONICAL_NODE_V1`); `energyBalanceCheck` compares internal strain energy against external work, an identity the `R = K U - F` convention makes exact up to solver residual; `conditioningReport` always reports the factorization's condition estimate against declared warning and block thresholds. `worstStatus` folds all five into `QUALIFIED` / `CONDITIONAL` / `BLOCKED`.

## Record and identity

The sealed `fea-linear-execution/v1` record carries the solver-profile hash, the cited `mechanicalModelSemanticHash` and `stiffnessStateHash` (cited, never re-derived), the `physicalLoadCaseHash`, the DOF map, assembly and factorization evidence (including retained scale factors), canonical displacement and reaction entries sorted by `nodeId:dof`, the qualification diagnostics and the overall status. `semanticHash` is computed by `shared-piping-model/canonical-json.js` over everything but itself and `evidenceHash`; `requireSolverExecution` re-accepts a record by exact keys and hash, refusing a stale one with `SOLVER_HASH_MISMATCH`.

## Checks

```text
npm run check:lfea-b3.3
```

`scripts/lfea-b3.3-solver-check.mjs` holds the contract check and benchmarks — FRAME-3D-01 (unsymmetrical space frame reactions), PRESCRIBED-01 (support settlement, partition coupling and reaction recovery), factorization-reuse proof by object identity, floating-mechanism and near-zero-pivot refusal, and the section 8.1 gates at their declared thresholds. `scripts/lfea-b3.3-reviewer-check.mjs` holds the permanent deliberate regressions (section 15.5: diagnostic text never entering `stiffnessStateHash`; a stale stiffness state never reusing a cached factorization; a genuine mechanism never silently solved) and `scripts/lfea-b3.3-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.
