# LAFEA-NC — Solver Custody Evidence Intake

## Purpose

This work package begins actual LAFEA-NC evidence execution. It does not add another NC phase and it does not qualify the solver bridge. It inventories the provisional external solver identity and provides a file-backed, fail-closed verifier for the source, build, executable, runtime, dependency, threading, and licensing evidence required before solver execution can become authoritative.

## Bound solver identity

```text
solver id:          CALCULIX.CCX.2.22
family:             CALCULIX_CRUNCHIX
version:            2.22
source repository:  https://github.com/Dhondtguido/CalculiX
source commit:      cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54
```

Changing any identity field invalidates the inventory before filesystem access.

## Required evidence classes

1. `SOURCE_ARCHIVE` — exact source archive bytes and SHA-256.
2. `EXECUTABLE_BINARY` — exact `ccx` executable bytes and SHA-256.
3. `CONTAINER_RECORD` — immutable image identity plus a verified OCI archive.
4. `BUILD_RECORD` — source binding, compiler identity/version, flags, command hash, and verified build transcript.
5. `PLATFORM_RECORD` — operating system, architecture, libc, kernel, fingerprint, and verified platform probe.
6. `LINKED_LIBRARIES_RECORD` — occurrence-preserving library ledger with each linked binary verified independently.
7. `THREAD_POLICY_RECORD` — deterministic single-thread policy, environment variables, and verified runtime probe.
8. `LICENSE_RECORD` — SPDX identity, upstream source path, and verified license text.

Every path is a safe repository-relative POSIX path. Every evidence file and nested referenced file is byte-hashed. Placeholder hashes, identity drift, path traversal, empty files, malformed records, hash mismatches, non-immutable containers, non-single-thread policies, unbound builds, and linked-library ledger drift fail closed.

## Current repository inventory

The inventory at `evidence/nonlinear-shell-contact/solver-custody/inventory.json` records all eight evidence classes as missing. This is an evidence result, not a placeholder success case.

Deterministic repository report:

```text
status:                    SOLVER_CUSTODY_BLOCKED
required evidence:         8
verified evidence:         0
missing evidence:          8
inventory hash:            sha256:15b50c58495c2c674cea1fe458f71d071e080a2b9ae6028b8d80a30d18911610
report semantic hash:      sha256:1ebe3990276e1bd632914e75ede8dbc689ea85fce4f8556dfe2689ab48c02bfe
qualification requested:   false
```

## Verification boundary

The test suite constructs a complete temporary, file-backed synthetic custody set to prove the qualified evaluator path and then tampers with primary and nested evidence. Synthetic test data is never written into the programme inventory and grants no programme authority.

Even a complete custody set only permits `solverCustodyQualified=true`. The evaluator always leaves these authorities false:

```text
solverBridgeQualified
shellFormulationQualified
contactProcedureQualified
codeAssessmentQualified
moduleQualified
productionExecutionAuthorized
mergeAuthorized
```

Solver-bridge qualification still requires controlled solver execution, deterministic replay, raw-output custody, parser reconstruction, independent checks, and acceptance of the relevant NC-00 numerical evidence.
