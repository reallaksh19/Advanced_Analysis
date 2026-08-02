# LFEA Piping Phase 6H — Governed External-Evidence Materialization

Program disposition remains `BLOCKED` in the committed repository template.

## Purpose

Phase 6B defines the external qualification package and the independent G8–G10 evidence contracts. Phase 6C validates the persisted legacy package and its five governed external records. Phase 6G consumes only a WP-2-bound governed external artifact.

Phase 6H converts caller-supplied, already sealed source records and an approved Project Authority Index into the standalone artifact consumed by Phase 6G.

Phase 6H derives package, artifact-reference and binding metadata only. It does not create engineering values, run a commercial program, approve WP-2, seal supplied source records, sign a disposition or promote any release gate.

## Candidate and tooling identities

The only eligible evidence candidate is:

```text
CANDIDATE_SHA: 617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
CANDIDATE_REF: release/lfea-piping-phase6i-617f7c2
```

The workflow may execute qualification tooling from a later reviewed tooling head, but `github.sha` is never substituted for the candidate identity. The workflow verifies both the tooling checkout and the immutable candidate ref before materialization. Every request, WP-2 index, source record, package and uploaded artifact remains bound to the immutable candidate SHA.

## Materialization request

The input artifact must contain one request record:

```json
{
  "schema": "lfea-piping-external-materialization-request/v2",
  "packageId": "<project-controlled package identity>",
  "exactHead": "617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54",
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

The Project Authority Index path and all seven record paths must be unique relative `.json` paths inside the supplied input root. Absolute paths, drive-qualified paths, traversal, empty segments, symbolic links, non-files and script/test/fixture/mock roots are rejected.

## WP-2 authority requirement

The supplied Project Authority Index must:

- use the governed WP-2 schema;
- bind the immutable candidate SHA and ref;
- contain all eleven authority groups;
- have no unresolved authority or pending approval;
- retain responsible-engineer approval evidence;
- reconstruct its semantic and evidence hashes exactly;
- remain `releaseQualified: false`.

The Phase 6H materializer validates the index but does not create or approve it.

## Supplied source authorities

The caller supplies:

- one approved Project Authority Index;
- one fully qualified current application result;
- its current presentation;
- one passing real-model reconciliation record;
- one passing independent commercial corroboration record;
- one exact-head performance-evidence record;
- one exact-head rollback-evidence record;
- one signed release-review disposition.

The existing external-package compiler validates the seven records, current application/presentation identity, selector coverage, authority independence, performance envelope, rollback state and signed-disposition head. Package schema v2 also embeds the approved WP-2 index as a mandatory parent.

Phase 6H does not call evidence sealing functions. Every supplied record must already carry its current semantic and evidence hashes.

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

The approved WP-2 record is separately retained as:

```text
external/project-authority-index.json
```

## Atomic materialization and WP-2 binding

Materialization occurs in a new sibling staging directory. Phase 6H writes the approved Project Authority Index, the five governed supplied records and the compiled v2 external package, then runs the existing Phase 6C persisted external-evidence intake in release mode.

Publication of the materialized package requires:

- package status `ELIGIBLE_FOR_RELEASE_REVIEW`;
- package exact head equal to the immutable candidate;
- all five persisted records canonically equal to their package records;
- all content and record hashes current;
- G8, G9 and G10 intake accepted by the existing validator.

After materialization, the WP-2 binder:

- compares the retained Project Authority Index byte-semantically with the package-embedded index;
- requires the WP-2 candidate SHA to equal the package exact head;
- binds the retained index content, semantic and evidence hashes;
- rejects path collisions with the package and its five evidence artifacts;
- writes `external/project-authority-bound-package.json`;
- writes `external/project-authority-binding-summary.json`.

On success, the output contains:

- the five governed evidence records;
- `external/project-authority-index.json`;
- `external/external-qualification-package.json`;
- `external/project-authority-bound-package.json`;
- `external/materialization-summary.json`;
- `external/project-authority-binding-summary.json`.

The materializer staging directory is atomically renamed to the requested output path. Binder outputs use create-only writes. Failure cannot overwrite an existing requested output.

## CLI

Materialize:

```bash
node scripts/lfea-piping-external-evidence-materializer.mjs \
  --input-root=/path/to/caller-supplied-source \
  --request=request/external-materialization-request.json \
  --output=/path/to/new/external-artifact \
  --exact-head=617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
```

Bind WP-2:

```bash
node scripts/lfea-piping-phase6h-project-authority-binder.mjs \
  --root=/path/to/new/external-artifact \
  --package=external/external-qualification-package.json \
  --authority-index=external/project-authority-index.json \
  --output=external/project-authority-bound-package.json \
  --exact-head=617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
```

The materializer output path must not exist and must not overlap the repository or input root.

## Manual workflow

`.github/workflows/lfea-piping-external-evidence-materialization.yml` accepts:

- the immutable candidate SHA;
- the workflow run ID containing the caller-supplied source artifact;
- the source artifact name;
- the request path inside that artifact.

The workflow checks out the selected qualification-tooling head, verifies that the immutable candidate ref resolves to the supplied candidate SHA, downloads the source artifact, materializes the v2 package, binds WP-2, and uploads:

```text
lfea-piping-external-evidence-${{ inputs.candidate_sha }}
```

That artifact is the only eligible external input to the Phase 6G WP-2 runtime-bundle assembly workflow.

## Qualification boundary

The committed checks are marked:

```text
[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]
```

They use synthetic records and injected compiler/intake seams. They prove request/path handling, WP-2 validation, candidate/head binding, artifact-reference derivation, canonical record persistence, retained-record equality, deterministic hashes, collision rejection, exact-head rejection and atomic cleanup. They do not prove any project, commercial, performance, rollback, approval or signature claim.

## Remaining conditions

- Populate and approve the real candidate-bound WP-2 index.
- Produce the seven non-fictional sealed source records for the immutable candidate.
- Retain them as a caller-controlled source artifact.
- Run Phase 6H and retain the governed WP-2-bound external artifact.
- Run Phase 6F for the same candidate.
- Run Phase 6G assembly and Phase 6E runtime certification.
- Retain successful workflow logs and complete independent Section 9 review.
