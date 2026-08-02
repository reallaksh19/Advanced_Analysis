# LFEA Piping Phase 6H — Governed External-Evidence Materialization

Program disposition remains `BLOCKED` in the committed repository template.

## Purpose

Phase 6B defines the external qualification package and the independent G8–G10 evidence contracts. Phase 6C validates that package after it is persisted. Phase 6G consumes a governed external artifact.

Phase 6H provides the production file boundary that converts caller-supplied, already sealed source records into the standalone artifact consumed by Phase 6G.

Phase 6H derives package and artifact-reference metadata only. It does not create engineering values, run a commercial program, seal the supplied source records, sign a disposition or promote any release gate.

## WP-2 prerequisite

Phase 6H requires one canonical, approved Project Authority Index before reading the seven external evidence records.

The authority index must:

- use schema `lfea-piping-phase6i-project-authority-index/v1`;
- bind the frozen candidate `617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54`;
- bind immutable ref `release/lfea-piping-phase6i-617f7c2`;
- have status `WP2_COMPLETE`;
- retain no unresolved authorities or pending approvals;
- reconstruct its semantic and evidence hashes exactly;
- retain `releaseQualified: false`.

Phase 6H does not populate or approve this record. Missing, unresolved, unsigned, wrong-candidate or tampered authority fails closed.

## Materialization request

The input artifact must contain one v2 request record:

```json
{
  "schema": "lfea-piping-external-materialization-request/v2",
  "packageId": "<project-controlled package identity>",
  "exactHead": "<40-character repository SHA>",
  "projectAuthorityIndex": "records/project-authority-index.json",
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

The authority path and all seven record paths must be unique relative `.json` paths inside the supplied input root. Absolute paths, drive-qualified paths, traversal, empty segments, symbolic links, non-files and script/test/fixture/mock roots are rejected.

Legacy `lfea-piping-external-materialization-request/v1` requests are rejected.

## Supplied source authorities

The caller supplies:

- one approved WP-2 Project Authority Index;
- one fully qualified current application result;
- its current presentation;
- one passing real-model reconciliation record;
- one passing independent commercial corroboration record;
- one exact-head performance-evidence record;
- one exact-head rollback-evidence record;
- one signed release-review disposition.

The existing `compileLinearPipingExternalQualificationPackage` authority validates all records, current application/presentation identity, WP-2 approval, selector coverage, authority independence, performance envelope, rollback state and signed-disposition head.

Phase 6H does not call the evidence sealing functions. Every source record must already carry its current semantic and evidence hashes.

## External package v2

Phase 6H compiles:

```text
linear-piping-external-qualification-package/v2
```

The package embeds the complete approved Project Authority Index. Its semantic projection includes the authority semantic hash. Its evidence hash includes the authority evidence hash.

This means a change to the authority basis invalidates the external package identities and therefore invalidates stale Phase 6G and Phase 6E evidence without adding another release route.

## Derived artifact references

For the five retained G8–G10 external evidence roles, Phase 6H derives only:

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

The approved authority index is additionally retained as:

- `external/project-authority-index.json`.

The v2 package contains the same canonical authority record and binds its identities.

## Atomic output

Materialization occurs in a new sibling staging directory. Phase 6H writes the authority record, the five retained external evidence records and the compiled package, then runs the existing Phase 6C persisted external-evidence intake in release mode.

Publication requires:

- package status `ELIGIBLE_FOR_RELEASE_REVIEW`;
- exact package head equal to the selected checkout head;
- package authority identities equal to the validated WP-2 record;
- all five persisted G8–G10 records canonically equal to their package records;
- all content and record hashes current;
- G8, G9 and G10 intake status accepted by the existing validator.

On success, the output contains:

- `external/project-authority-index.json`;
- the five governed G8–G10 evidence records;
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
- the v2 request path inside that artifact.

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

It uses synthetic records and injected authority/compiler/intake seams. It proves request/path handling, authority-first validation, legacy-request rejection, package binding, canonical record persistence, deterministic output, exact-head rejection and atomic cleanup. It does not prove any project, commercial, performance, rollback or signature claim.

## Remaining conditions

- Populate and approve the real candidate-bound WP-2 Project Authority Index.
- Produce the seven non-fictional sealed source records for one selected exact head.
- Retain them as a caller-controlled source artifact with the v2 request.
- Create a new immutable execution candidate for this source-contract revision.
- Run Phase 6H and retain the governed external artifact.
- Run Phase 6F for the same exact head.
- Run Phase 6G assembly and Phase 6E runtime certification.
- Retain successful workflow logs and complete independent Section 9 review.
