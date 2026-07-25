# LFEA-004 — Deterministic sparse CSR and PCG solution backend

## Authority and baseline

- Required baseline: `5dff9c06b67f3adaef4455afe910763075ec0a9c`.
- Implementation is explicitly authorized by the LFEA-004 Work Pack.
- Dense LDLᵀ remains the small-model reference backend.
- T3/Q4 formulation, material matrices, loads, restraints, prescribed displacements, recovery, residuals, equilibrium, energy, LFEA-003 convergence, and stress-projection meaning remain unchanged.

## Closed identities

```text
lfea-profile/v2
fea-continuum-result/v3
CSR_FULL_V1
SPARSE_PCG_V1
JACOBI_PRECONDITIONER_V1
```

Legacy `lfea-profile/v1` selects only the existing dense reference backend. Sparse execution requires an explicit v2 profile. No model-size selection or backend fallback exists.

## Sparse profile

The v2 profile requires explicit finite positive values for:

```text
linearBackend = SPARSE_PCG_V1
preconditioner = JACOBI_PRECONDITIONER_V1
absoluteResidualTolerance
relativeResidualTolerance
maximumIterations
maximumDofs
maximumNonzeros
maximumEstimatedStorageBytes
```

No hidden residual, iteration, or capacity default is supplied.

## Deterministic full CSR

The original full stiffness matrix is represented by:

```text
rowPointers   : Int32Array
columnIndices : Int32Array
values        : Float64Array
```

The structural pattern is derived from canonical element DOF lists before value assembly. Contributions are accumulated in element-identity order and local row-major order. Columns are strictly increasing in every row, duplicates are consolidated, cancelled off-diagonal zeros are removed, and every diagonal must remain finite and nonzero.

The implementation never extends a row while numerical values are being accumulated. It validates transpose structure and paired coefficients without averaging or repair.

Matrix evidence contains:

```text
matrixIdentity
storageIdentity
rowCount
columnCount
nonzeroCount
rowPointersHash
columnIndicesHash
valuesHash
symmetryEvidence
diagonalEvidence
estimatedStorageBytes
capacityEvidence
```

The full original matrix remains available internally for reactions, complete residuals, equilibrium, and strain energy.

## Constraint partition

The sparse partition preserves:

```text
Kff uf = Ff - Kfc uc
```

Free and constrained indices follow canonical global equation order. The implementation retains zero and nonzero prescribed displacement, constrained-DOF applied load, the full load vector, and the full original sparse stiffness matrix.

Reactions remain:

```text
R = Ku - F
```

using the original full system, never the reduced matrix alone.

## Jacobi PCG

Initial state:

```text
u0 = 0
r0 = b - A u0
z0 = M^-1 r0
p0 = z0
Mii = Aii
```

Iteration:

```text
alpha = (rᵀz)/(pᵀAp)
u <- u + alpha p
r <- r - alpha Ap
z <- M^-1 r
beta = (r_newᵀz_new)/(r_oldᵀz_old)
p <- z + beta p
```

All vector and matrix traversals use fixed ascending index order.

Stopping threshold:

```text
targetResidual = max(
  absoluteResidualTolerance,
  relativeResidualTolerance * ||b||2
)
```

When the recursively updated residual reaches the threshold, the implementation recomputes `b - Au` from the final solution and reduced CSR matrix. Qualification requires the true residual norm to satisfy the target.

## Failure containment

Sparse solution fails closed for:

- invalid or inconsistent CSR structure;
- non-finite matrix, vector, or scalar;
- missing or non-positive free diagonal;
- non-positive or non-finite `pᵀAp`;
- non-positive or non-finite `rᵀz`;
- invalid alpha or beta;
- iteration exhaustion;
- final true residual above target;
- singular or inadequately constrained systems;
- unsupported backend identity;
- capacity rejection.

No weak spring, diagonal shift, denominator clamp, tolerance relaxation, retry, dense fallback, or partial qualified engineering result is produced.

## Result v3

Sparse runs use `fea-continuum-result/v3`. It retains:

- model/source ancestry and semantic hashes;
- sparse backend, storage, preconditioner, and capacity evidence;
- residual tolerances and target;
- initial, recursive-final, and true-final residuals;
- iteration and matrix-vector-product counts;
- complete residual history and explicit termination status;
- original-system reactions, residuals, force/moment equilibrium, and energy;
- authoritative T3/Q4 raw element or integration-point results;
- limitations.

Dense v1/v2 meanings are unchanged. Dense and sparse results need not share semantic hashes.

Wall-clock time, runner identity, process identity, and heap measurements are excluded from semantic evidence.

## Cross-backend qualification

Small T3, Q4, and mixed T3/Q4 models compare dense and sparse:

- nodal and prescribed displacements;
- reactions;
- free and complete residuals;
- force and moment balance;
- strain energy;
- raw stresses including plane-strain `sigmaZ`;
- principal and von Mises stress.

Existing independently derived LFEA-001 and LFEA-002 benchmark suites remain part of the dedicated workflow.

## Medium benchmark

The structured Q4 benchmark contains 3,111 nodes, 3,000 elements, 6,222 active DOFs, and 6,120 free DOFs. Its limits require fewer than 200,000 nonzeros and less than 64 MiB of derived CSR storage. It verifies true residual, original-system equilibrium, energy consistency, capacity evidence, and repeated byte identity.

This bounded fixture is not evidence of unrestricted production-scale capability.

## LFEA-003 compatibility

`fea-convergence-study/v1` accepts qualified `fea-continuum-result/v3` as raw authoritative solver evidence. Sparse results are not projected into a different convergence authority and do not alter LFEA-003 classification or projection rules.

## Qualification

```text
node scripts/lfea-004-check.mjs
node scripts/lfea-004-source-guard.mjs
```

The dedicated workflow checks out the exact head, runs LFEA-001/002/003 behavioral regressions without predecessor path guards, runs all LFEA-004 checks, validates syntax, and invokes only the LFEA-004 source guard.

## Limitations

- Jacobi-preconditioned CG only.
- Symmetric positive-definite free systems only.
- No sparse direct factorization, incomplete factorization, multigrid, GPU, WebAssembly, worker, or multithreaded path.
- No automatic backend choice or fallback.
- No production-scale performance or memory claim.
- No new finite element, locking remedy, nonlinear analysis, contact, plasticity, buckling, dynamics, stress linearization, code check, contour UI, W11 coupling, or commercial-solver parity claim.
