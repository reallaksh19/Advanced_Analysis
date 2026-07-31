# LFEA Piping Phase 6D — Internal Exact-Head Evidence Intake

Program disposition remains `BLOCKED`.

## Purpose

Phase 6D validates persisted G0–G7 release evidence that is supplied to the existing release manifest. It does not run the engineering commands, create their outputs, populate paths, change gate status, or qualify the program.

Phase 6C covers the external G8–G10 evidence package. Phase 6D covers the internal exact-head, numerical-chain, application, interface, code and presentation evidence required for G0–G7.

## Exact-head manifest

The release artifact `exactHeadManifest` must reference a repository-relative JSON file using schema:

```text
lfea-piping-exact-head-manifest/v1
```

The manifest retains:

- exact repository and 40-character release head;
- exact UTC creation time;
- runtime, operating system, architecture and dependency-lock identity;
- clean-tree proof;
- ten mandatory command records;
- seven retained artifact references;
- semantic and evidence hashes.

## Mandatory commands

The exact command register is:

- `CLEAN_TREE`;
- `CODE_AND_ALLOWABLES`;
- `EXACT_HEAD_BASELINE`;
- `FULL_REPOSITORY_GATE`;
- `INTERFACES`;
- `INTERFACE_RECOVERY`;
- `PRESENTATION_EXPORT`;
- `SOURCE_ORCHESTRATION`;
- `T0_APPLICATION_SEQUENCING`;
- `UPSTREAM_NUMERICAL_CHAIN`.

Every command must retain its exact command text, `exitCode: 0`, `status: PASS`, bound artifact role and retained artifact content hash. Missing, duplicated, failed or incorrectly bound commands are rejected.

## Retained artifact roles

The manifest and release ledger must agree exactly on:

- `upstreamGateLog` — `text/plain`;
- `t0GateLog` — `text/plain`;
- `sourceOrchestrationEvidence` — `application/json`;
- `interfaceEvidence` — `application/json`;
- `interfaceRecoveryEvidence` — `application/json`;
- `codeAndAllowableEvidence` — `application/json`;
- `presentationExportEvidence` — `application/json`.

Text logs must contain the exact head and a `COMMAND_ID PASS` record for every command bound to that log. JSON evidence must retain the exact head, exact artifact role and `status: PASS`.

Content hashes use the repository hash authority:

- UTF-8 byte hash for retained text logs;
- canonical JSON semantic hash for JSON evidence.

## Path and file policy

Absolute paths, Windows drive paths, traversal, empty segments, symbolic links, non-files, incorrect extensions and evidence rooted under scripts, tests, e2e, fixtures or mocks are rejected.

Each artifact path must be unique and must differ from the exact-head manifest path.

## Modes

Policy mode:

```bash
node scripts/lfea-piping-internal-release-evidence-check.mjs
```

With the committed null `exactHeadManifest`, policy mode reports `UNRESOLVED_GATE`.

Internal release-intake mode:

```bash
node scripts/lfea-piping-internal-release-evidence-check.mjs --release
```

Release-intake mode additionally requires G0 through G7 to be `VERIFIED`.

The complete release decision remains governed by:

```bash
npm run check:lfea-piping-release -- --release
```

That command separately requires every G0–G10 gate, every internal and external artifact, the exact head and `programDisposition: QUALIFIED`.

## Qualification coverage

The committed Phase 6D suite is marked `[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE]`. It covers:

- unresolved policy mode and missing-manifest release rejection;
- complete policy and release-intake paths;
- exact command coverage and command-to-artifact binding;
- clean-tree enforcement;
- head and path mismatch rejection;
- retained artifact tamper rejection;
- required command evidence in logs;
- JSON role and status enforcement;
- G0–G7 gate enforcement;
- path containment and deterministic manifest identity.

The fixtures qualify validator behavior only. They cannot satisfy G0–G7 or populate the release manifest.

## Remaining conditions

- Execute every mandatory command on one clean exact head.
- Retain the real logs and phase evidence files.
- Populate the exact-head manifest and G0–G7 artifact paths.
- Independently review and promote G0 through G7.
- Retain successful exact-head Phase 6D, release-policy and full-release command logs.
