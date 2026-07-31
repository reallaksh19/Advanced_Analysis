# LFEA Piping Phase 6C — Persisted Release-Evidence Intake

Program disposition remains `BLOCKED`.

## Purpose

Phase 6B validates an in-memory external qualification package. Phase 6C validates the persisted release-candidate package and its external JSON artifacts against `release-evidence/lfea-piping-release-evidence.json`.

Phase 6C does not create evidence, execute external programs, change a gate, populate an artifact path, or sign a disposition.

## Manifest requirements

The release manifest reserves `artifacts.externalQualificationPackage`. In the committed non-release state this field remains `null`.

A release candidate must supply repository-relative paths for:

- `externalQualificationPackage`;
- `realModelReconciliation`;
- `commercialCorroboration`;
- `performanceEvidence`;
- `rollbackEvidence`;
- `signedDisposition`.

Absolute paths, traversal, empty segments, and evidence rooted under scripts, tests, fixtures, or mocks are rejected.

## Validation sequence

For a supplied release candidate, Phase 6C:

1. Parses and independently revalidates the Phase 6B package.
2. Requires the package exact head to equal the release manifest exact head.
3. Requires each manifest artifact path to equal the corresponding package artifact-reference path.
4. Requires `application/json` for each external artifact.
5. Parses each external JSON file and compares its canonical JSON record with the record retained in the package.
6. Computes the artifact content hash as the repository canonical `semanticHash(parsedJsonRecord)`.
7. Requires the artifact-reference semantic and evidence hashes to equal the persisted record hashes.
8. In `--release` mode, requires G8, G9, and G10 to be `VERIFIED`.

## Modes

Policy mode:

```bash
node scripts/lfea-piping-external-release-evidence-check.mjs
```

With the committed null package slot, policy mode reports `UNRESOLVED_GATE` without promoting anything.

Release-candidate mode:

```bash
node scripts/lfea-piping-external-release-evidence-check.mjs --release
```

Release-candidate mode fails closed unless the package, five external artifacts, exact head, hashes, and G8/G9/G10 gate states are complete and current.

## Evidence eligibility

The committed Phase 6C analytical checks are marked `[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE]`. They prove only the validator behavior. They cannot populate G8, G9, G10, or any external artifact path.

## Remaining conditions

- Supply non-fictional Phase 6B and external artifact JSON files.
- Populate the release manifest paths.
- Set the exact candidate head.
- Retain successful exact-head command logs.
- Promote G8, G9, and G10 only through an independently reviewed release-evidence change.
- Run the Phase 6C checker in release mode at the exact candidate head.
