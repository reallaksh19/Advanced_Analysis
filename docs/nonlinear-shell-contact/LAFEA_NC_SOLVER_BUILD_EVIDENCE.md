# LAFEA-NC — Controlled CalculiX Build Evidence

## Purpose

This work package attempts the first reproducible build of the exact CalculiX CrunchiX 2.22 source already retained by the source-and-license evidence run. It is stacked on that evidence and does not create a new NC phase.

## Inputs

```text
CalculiX source commit: cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54
source archive SHA-256: sha256:901908b655837fadc0a2753331bbaf81916ee1701b4c015254f1b09a15eec97f
license SHA-256:        sha256:8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643
source evidence run:    30995729131
```

The upstream makefile uses C and Fortran compilers, SPOOLES 2.2, ARPACK, BLAS/LAPACK, POSIX threads, the math and C libraries, and OpenMP. Its `date.pl` script inserts the wall-clock date into source before linking. The controlled build leaves upstream source unchanged and supplies a fixed `date` executable through `PATH` so two clean source extractions receive the same embedded timestamp.

## Build procedure

The exact-head workflow:

1. downloads and re-hashes the retained exact source archive and license;
2. downloads SPOOLES 2.2 twice from Netlib and requires byte equality;
3. installs pinned runner-package versions of ARPACK, BLAS and LAPACK;
4. builds SPOOLES and CalculiX independently in two clean roots with one build job;
5. maps both absolute build roots to one canonical source prefix;
6. strips debug sections and requires byte-identical `ccx_2.22` executables;
7. executes the binary under `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, and `MKL_NUM_THREADS=1`;
8. retains normalized build logs, compiler and package identities, platform probe, runtime probe, static dependency archives, every resolved runtime shared object, generated records, inventory and report;
9. independently re-evaluates the final evidence.

## Evidence boundary

A successful run can verify seven of the eight custody classes:

```text
SOURCE_ARCHIVE
EXECUTABLE_BINARY
BUILD_RECORD
PLATFORM_RECORD
LINKED_LIBRARIES_RECORD
THREAD_POLICY_RECORD
LICENSE_RECORD
```

`CONTAINER_RECORD` remains intentionally missing. Therefore even a successful reproducible build remains:

```text
status: SOLVER_CUSTODY_BLOCKED
solverCustodyQualified: false
solverBridgeQualified: false
productionExecutionAuthorized: false
mergeAuthorized: false
```

An immutable OCI image and archive are a separate bounded work package. Solver-bridge authority also requires controlled numerical execution, deterministic replay, raw-output custody, parser reconstruction and acceptance of the NC-00 benchmark evidence.
