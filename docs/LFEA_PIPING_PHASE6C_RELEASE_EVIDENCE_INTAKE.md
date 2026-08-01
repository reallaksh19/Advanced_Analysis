# LFEA Piping Phase 6C — Persisted Release-Evidence Intake

Program disposition remains `BLOCKED`.

## Purpose

Phase 6B validates an in-memory external qualification package. Phase 6C validates the persisted release-candidate package and its external JSON artifacts against `release-evidence/lfea-piping-release-evidence.json`.

Phase 6C does not create evidence, execute external programs, change a gate, populate an artifact path, or sign a disposition.

## Manifest and gate integration

The release manifest reserves `artifacts.externalQualificationPackage`. In the committed non-release state this field remains `null`.

The field is part of the existing `REQUIRED_ARTIFACTS` exact-key contract. The existing `check:lfea-piping-release-policy` and repository `gate` routes invoke the Phase 6C containment and analytical checks. Adding the field therefore cannot bypass or break the normal release gate.

A release candidate must supply repository-relative JSON paths for:

- `externalQualificationPackage`;
- `realModelReconciliation`;
- `commercialCorroboration`;
- `performanceEvidence`;
- `rollbackEvidence`;
- `signedDisposition`.

Absolute paths, Windows drive paths, traversal, empty segments, symbolic links, non-files, non-JSON paths, and evidence rooted under scripts, tests, fixtures, or mocks are rejected.

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
9. Leaves the complete release decision to the existing release-readiness checker, which separately requires every G0–G10 gate, every artifact, the exact head, and `programDisposition: QUALIFIED`.

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

The complete release-policy route remains:

```bash
npm run check:lfea-piping-release -- --release
```

## Qualification coverage

The committed checks are marked `[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE]`. They exercise:

- unresolved policy mode and missing-package release rejection;
- a complete persisted package in policy and release-intake modes;
- package-head mismatch;
- manifest/package path mismatch;
- record tamper rejection;
- canonical content-hash mismatch;
- G8/G9/G10 status rejection;
- traversal and ineligible-root rejection;
- deterministic canonical JSON hashing.

These checks prove only validator behavior. They cannot populate G8, G9, G10, or any external artifact path.

## Remaining conditions

- Supply non-fictional Phase 6B and external artifact JSON files.
- Populate the release manifest paths.
- Set the exact candidate head.
- Retain successful exact-head command logs.
- Promote G8, G9, and G10 only through an independently reviewed release-evidence change.
- Run both the Phase 6C checker and the complete release checker in release mode at the exact candidate head.
