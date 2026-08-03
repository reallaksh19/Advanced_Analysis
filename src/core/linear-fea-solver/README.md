# Sparse assembly and solver

This package assembles one bound `fea-linear-mechanical-model-compilation/v1` (B-2.5), its B-3.1/B-3.2 element contributions and one `fea-linear-physical-load-case/v1` (B-3.0) into a solved, qualified `fea-linear-execution/v1` record: DOF map, deterministic assembly, boundary-condition partitioning, factorization, displacement, reactions and the section 8.1 numerical qualification gates. It is the LFEA-B3.3 exit boundary (sections 7.2, 8, 8.1, 9 displacement/reaction).

It does not recover element end actions or component resultants at physical code points (B-3.4), and it does not evaluate any B31.3 stress, allowable or SIF (B-4.0). It reads no element or component mechanics itself: every stiffness and load vector it assembles was already sealed by B-3.1 or B-3.2, re-accepted here through `requireElementContribution` rather than re-derived.

## Backend identity and selection

The sealed solver profile selects one of two honestly named direct backends:

- `FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1` uses the existing deterministic Map-backed sparse Cholesky and pivoted LDLT implementation from `src/core/lafea-linear-solve/`. This is the production-path default used by the shared piping solver fixture.
- `FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1` retains the original dense Cholesky/LDLT implementation as an explicit selectable reference backend for equivalence checks.

The declared backend participates in the solver-profile semantic hash. There is no size heuristic, environment switch, hidden regularization or silent dense fallback. Both backends attempt Cholesky first and use LDLT only to classify a non-SPD system with the existing solver error semantics.

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

`loadCase.modelReference` must cite the same `modelIdentity`, `modelRevision`, `mechanicalModelSemanticHash` and `stiffnessStateHash` as the bound compilation, or the call is refused with `SOLVER_LOAD_CASE_MODEL_MISMATCH`.

## DOF map, assembly and boundary conditions

`buildDofMap` orders nodes by the B-2.0 `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1` rule and lays out the frozen six-DOF order per node. `assembleGlobalSystem` turns every element contribution and every `LINEAR_SPRING` constraint into `(row, col, value, tag)` triplets, sorts them by `(row, col, tag)` and sums duplicates in that order. The canonical deduplicated triplets are retained as the sparse factorization input.

`FIXED` and `PRESCRIBED_SLOT` constraints are eliminated into one canonical partition. The execution record reports `tripletCount` for the deduplicated both-triangle COO entries and `lowerTriangleNonzeroCount` for the sparse lower-triangle storage convention as distinct fields; neither count is silently normalized to the other. The normalized assembly symmetry residual is also retained.

## Factorization, scaling and reuse

Both backends apply the same `1/sqrt(Kii)` diagonal-energy scaling identity and retain every scale factor. Sparse Cholesky fails closed at a non-positive or below-tolerance pivot; that condition triggers sparse pivoted LDLT for diagnosis, never a switch to the dense backend. Sparse exceptions are translated to the existing `SOLVER_NEAR_ZERO_PIVOT` and `SOLVER_SYSTEM_INDEFINITE` semantics with node, DOF and connected-component attribution. Whole floating components remain blocked before factorization by `SOLVER_MECHANISM_FLOATING_COMPONENT`.

Reuse remains keyed by `` `${stiffnessStateHash}:${partitionHash}` `` and excludes load-case/evidence identity. Backend variants are segregated inside that engineering key, so a sparse request can never receive a cached dense factorization while repeated solves on the same backend retain object identity.

Each execution retains factorization method, backend, scaling method and factors, pivot statistics, condition estimate and the condition-estimation method/evidence. The dense backend reports the existing pivot-magnitude-ratio proxy; the sparse backend reports deterministic power/inverse-power iteration evidence.

## Qualification (section 8.1)

Every gate value and limit comes from the resolved solver profile via `requireDeclaredValue`. `residualCheck` retains the existing L2 normalized residual convention. Force equilibrium, moment equilibrium and energy balance continue to use the retained dense global matrix and dense `matVec` qualification layer. That dense evidence path is an explicit current scope limitation: production factorization and triangular solves are sparse, but this mission does not convert every post-solve matrix touch.

## Record and identity

The sealed `fea-linear-execution/v1` record carries the solver-profile hash, cited model/load hashes, DOF map, assembly/factorization statistics, canonical displacement and reaction entries, qualification diagnostics and overall status. `semanticHash` is computed by `shared-piping-model/canonical-json.js`; runtime cache-reuse evidence is excluded from engineering identity but retained in `evidenceHash`.

## Checks

```text
npm run check:lfea-b3.3
npm run check:lfea-b3.5
```

B-3.3 retains the closed-form FRAME-3D-01 and PRESCRIBED-01 checks and now exercises the sparse path by default. B-3.5 permanently solves the same fixtures with both declared backends, reports the measured output differences, verifies backend-separated reuse and checks deterministic sparse replay and diagnostic equivalence.
