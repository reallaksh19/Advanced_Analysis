# LAFEA-NC Solver Interpreter Custody Evidence

## Purpose

This evidence increment corrects a runtime-custody omission discovered after the reproducible CalculiX 2.22 build was sealed. The executable's ELF program interpreter is required before any retained shared library can be loaded, but the first controlled-build ledger recorded only the libraries reported through the original `ldd` path extraction.

This is not a new NC phase. It does not rebuild the solver, change the executable, qualify the solver bridge, or authorize engineering use.

## Bound input

The workflow consumes the exact controlled-build artifact from run `30999218704` and requires executable SHA-256:

```text
9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e
```

The ELF header must request exactly:

```text
/lib64/ld-linux-x86-64.so.2
```

## Evidence procedure

The exact-head workflow:

1. verifies the retained `7/8` build-custody report and executable hash;
2. resolves the interpreter through `readelf`, not through filename inference;
3. retains the dereferenced interpreter bytes and records the exact `libc6` package version;
4. adds the interpreter to the linked-library input and aggregate ledger;
5. assembles a minimal chroot using only the sealed executable, retained interpreter, and retained shared libraries;
6. requires the deterministic single-thread environment, exit status `201`, and exact CalculiX usage message;
7. regenerates the solver-custody report twice and requires byte-identical evidence trees.

## Authority boundary

The expected result remains:

```text
verified evidence classes: 7/8
missing evidence:          CONTAINER_RECORD
status:                    SOLVER_CUSTODY_BLOCKED
solverCustodyQualified:    false
solverBridgeQualified:     false
mergeAuthorized:           false
```

The corrected artifact becomes the sole allowed input for the subsequent immutable OCI image work package.
