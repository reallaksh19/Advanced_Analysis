# LFEA Piping Phase 6H — Governed External-Evidence Materialization

Program disposition remains `BLOCKED` in the committed repository template.

## Purpose

Phase 6B defines the external qualification package and the independent G8–G10 evidence contracts. Phase 6C validates that package after it is persisted. Phase 6G consumes a governed external artifact.

Phase 6H provides the missing production file boundary that converts caller-supplied, already sealed source records into the standalone artifact consumed by Phase 6G.

Phase 6H derives package and artifact-reference metadata only. It does not create engineering values, run a commercial program, seal the supplied source records, sign a disposition or promote any release gate.

## Materialization request

The input artifact must contain one request record:

```json
{
  "schema": "lfea-piping-external-materialization-request/v1",
  "packageId": "<project-controlled package identity>",
  "exactHead": "<40-character repository SHA>",
  "records": {
    "applicationResult": "records/application-result.json",
    "presentation": "records/presentation.json",
    "realModelReconciliation": "records/real-model-reconciliation.json",
    "commercialCorroboration": "records/commercial-corroboration.json",
    "performanceEvidence": "records/performance-evidence.json",
    "rollbackEvidence": "records/rollback-evidence.json",
    "reviewDisposition": "records/signed-disposition.json"
  }
}
```

The request contains paths only. It cannot embed or override engineering values.

All seven paths must be unique relative `.json` paths inside the supplied input root. Absolute paths, drive-qualified paths, traversal, empty segments, symbolic links, non-files and script/test/fixture/mock roots are rejected.

## Supplied source authorities

The caller supplies:

- one fully qualified current application result;
- its current presentation;
- one passing real-model reconciliation record;
- one passing independent commercial corroboration record;
- one exact-head performance-evidence record;
- one exact-head rollback-evidence record;
- one signed release-review disposition.

The existing `compileLinearPipingExternalQualificationPackage` authority validates all seven records, current application/presentation identity, selector coverage, authority independence, performance envelope, rollback state and signed-disposition head.

Phase 6H does not call the evidence sealing functions. Every source record must already carry its current semantic and evidence hashes.

## Derived artifact references

For the five retained external evidence roles, Phase 6H derives only:

- the fixed governed output path;
- `application/json` media type;
- canonical content hash;
- record semantic hash;
- record evidence hash.

The governed output paths are:

- `external/real-model-reconciliation.json`;
- `external/commercial-corroboration.json`;
- `external/performance-evidence.json`;
- `external/rollback-evidence.json`;
- `external/signed-disposition.json`.

These references are passed to the existing Phase 6B package compiler.

## Atomic output

Materialization occurs in a new sibling staging directory. Phase 6H writes the five supplied records and the compiled package, then runs the existing Phase 6C persisted external-evidence intake in release mode.

Publication requires:

- package status `ELIGIBLE_FOR_RELEASE_REVIEW`;
- exact package head equal to the selected checkout head;
- all five persisted records canonically equal to their package records;
- all content and record hashes current;
- G8, G9 and G10 intake status accepted by the existing validator.

On success, the output contains:

- the five governed evidence records;
- `external/external-qualification-package.json`;
- `external/materialization-summary.json`.

The staging directory is atomically renamed to the requested output path. On failure, only the materializer-created staging directory is removed; the requested output remains absent.

## CLI

```bash
node scripts/lfea-piping-external-evidence-materializer.mjs \
  --input-root=/path/to/caller-supplied-source \
  --request=request/external-materialization-request.json \
  --output=/path/to/new/external-artifact \
  --exact-head=<selected checkout SHA>
```

The output path must not exist and must not overlap the repository or input root.

## Manual workflow

`.github/workflows/lfea-piping-external-evidence-materialization.yml` accepts:

- the workflow run ID containing the caller-supplied source artifact;
- the source artifact name;
- the request path inside that artifact.

The workflow checks out the selected exact head, downloads the supplied records, runs Phase 6H with `${{ github.sha }}` and uploads:

```text
lfea-piping-external-evidence-${{ github.sha }}
```

That artifact is the external input to the Phase 6G runtime-bundle assembly workflow.

## Qualification boundary

The committed check is marked:

```text
[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]
```

It uses synthetic records and injected compiler/intake seams. It proves request/path handling, artifact-reference derivation, canonical record persistence, deterministic output, exact-head rejection and atomic cleanup. It does not prove any project, commercial, performance, rollback or signature claim.

## Remaining conditions

- Produce the seven non-fictional sealed source records for one selected exact head.
- Retain them as a caller-controlled source artifact.
- Run Phase 6H and retain the governed external artifact.
- Run Phase 6F for the same exact head.
- Run Phase 6G assembly and Phase 6E runtime certification.
- Retain successful workflow logs and complete independent Section 9 review.
