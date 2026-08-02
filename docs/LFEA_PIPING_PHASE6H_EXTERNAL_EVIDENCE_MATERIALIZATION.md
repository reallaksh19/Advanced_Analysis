# LFEA Piping Phase 6H — Governed External-Evidence Materialization

Program disposition remains `BLOCKED` in the committed repository template.

## Purpose

Phase 6B defines the external qualification package and the independent G8–G10 evidence contracts. Phase 6C validates the persisted package and its five governed external records. Phase 6G consumes only a WP-2-bound governed external artifact.

Phase 6H converts a caller-controlled WP-3 source artifact containing an accepted handoff, an approved Project Authority Index and seven already sealed source records into the standalone artifact consumed by Phase 6G.

Phase 6H derives handoff-acceptance, package, artifact-reference and binding metadata only. It does not create engineering values, run a commercial program, approve WP-2 or WP-3, seal supplied source records, sign a disposition or promote any release gate.

## Candidate and tooling identities

The only eligible evidence candidate is:

```text
CANDIDATE_SHA: 617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
CANDIDATE_REF: release/lfea-piping-phase6i-617f7c2
```

The workflow may execute qualification tooling from a later reviewed tooling head, but `github.sha` is never substituted for the candidate identity. The workflow verifies both the tooling checkout and the immutable candidate ref before handoff validation or materialization. Every handoff, request, WP-2 index, source record, package and uploaded artifact remains bound to the immutable candidate SHA.

## Required WP-3 source layout

The caller-controlled source artifact must contain, at minimum:

```text
request/external-evidence-handoff.json
request/external-materialization-request.json
records/project-authority-index.json
records/application-result.json
records/presentation.json
records/real-model-reconciliation.json
records/commercial-corroboration.json
records/performance-evidence.json
records/rollback-evidence.json
records/signed-disposition.json
```

All paths must be safe relative JSON paths inside the downloaded artifact. Absolute paths, drive-qualified paths, traversal, empty segments, symbolic links, non-files and script/test/fixture/mock roots are rejected.

## WP-3 source handoff

Before Phase 6H reads any source record for package compilation, it requires:

```json
{
  "schema": "lfea-piping-phase6i-external-evidence-handoff/v1",
  "candidateSha": "617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54",
  "candidateRef": "release/lfea-piping-phase6i-617f7c2",
  "wp2Status": "WP2_COMPLETE",
  "wp3Status": "WP3_COMPLETE",
  "g8G9Independence": "CONFIRMED",
  "sourceRunId": "<exact workflow run ID>",
  "sourceArtifactName": "<exact artifact name>",
  "requestPath": "request/external-materialization-request.json",
  "recordCount": 7,
  "unresolvedAuthorities": [],
  "projectAuthorityIndexSemanticHash": "<current hash>",
  "projectAuthorityIndexEvidenceHash": "<current hash>",
  "requestContentHash": "<canonical request hash>",
  "releaseQualified": false,
  "semanticHash": "<current handoff hash>",
  "evidenceHash": "<current handoff evidence hash>"
}
```

The handoff is accepted only when:

- the candidate SHA and immutable ref are exact;
- WP-2 and WP-3 are explicitly complete;
- G8/G9 authority separation is explicitly confirmed;
- the workflow run ID and artifact name equal the dispatch inputs;
- the request path equals the dispatch request path;
- the request bytes reconstruct `requestContentHash`;
- the request identifies exactly seven source records;
- the approved WP-2 index reconstructs the handoff authority hashes;
- every source record exists as a regular JSON file and exposes semantic/evidence identity;
- unresolved authorities are empty;
- `releaseQualified` remains false.

Acceptance produces `lfea-piping-phase6i-external-evidence-handoff-acceptance/v1` with status `HANDOFF_ACCEPTED_FOR_PHASE6H`. Acceptance is permission to enter Phase 6H only. It is not gate promotion, result acceptance or release approval.

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

The handoff path, request path, Project Authority Index path and all seven record paths must be unique under case-insensitive comparison.

## WP-2 authority requirement

The supplied Project Authority Index must:

- use the governed WP-2 schema;
- bind the immutable candidate SHA and ref;
- contain all eleven authority groups;
- have no unresolved authority or pending approval;
- retain responsible-engineer approval evidence;
- reconstruct its semantic and evidence hashes exactly;
- remain `releaseQualified: false`.

The handoff validator and Phase 6H materializer validate the index but do not create or approve it.

## Supplied source authorities

The caller supplies:

- one accepted WP-3 source handoff;
- one approved Project Authority Index;
- one fully qualified current application result;
- its current presentation;
- one passing real-model reconciliation record;
- one passing independent commercial corroboration record;
- one exact-head performance-evidence record;
- one exact-head rollback-evidence record;
- one signed release-review disposition.

The external-package compiler validates the seven records, current application/presentation identity, selector coverage, authority independence, performance envelope, rollback state and signed-disposition head. Package schema v2 embeds the approved WP-2 index as a mandatory parent.

Phase 6H does not call evidence sealing functions. Every supplied record must already carry its current semantic and evidence hashes.

## Derived and retained records

For the five governed external evidence roles, Phase 6H derives only:

- the fixed governed output path;
- `application/json` media type;
- canonical content hash;
- record semantic hash;
- record evidence hash.

The governed evidence paths are:

- `external/real-model-reconciliation.json`;
- `external/commercial-corroboration.json`;
- `external/performance-evidence.json`;
- `external/rollback-evidence.json`;
- `external/signed-disposition.json`.

The approved WP-2 record is retained as:

```text
external/project-authority-index.json
```

The WP-3 custody chain is retained byte-for-byte as:

```text
external/source-handoff.json
external/source-materialization-request.json
external/source-handoff-acceptance.json
```

## Atomic materialization and WP-2 binding

The handoff validator runs before the materializer. A failed handoff creates no Phase 6H output.

Materialization occurs in a new sibling staging directory. Phase 6H writes the approved Project Authority Index, the five governed supplied records and the compiled v2 external package, then runs the Phase 6C persisted external-evidence intake in release mode.

Publication of the materialized package requires:

- package status `ELIGIBLE_FOR_RELEASE_REVIEW`;
- package exact head equal to the immutable candidate;
- all five persisted records canonically equal to their package records;
- all content and record hashes current;
- G8, G9 and G10 intake accepted by the existing validator.

After materialization, the workflow retains the accepted handoff, exact request and acceptance record. It then invokes the WP-2 binder, which:

- compares the retained Project Authority Index byte-semantically with the package-embedded index;
- requires the WP-2 candidate SHA to equal the package exact head;
- binds the retained index content, semantic and evidence hashes;
- rejects path collisions with the package and its five evidence artifacts;
- writes `external/project-authority-bound-package.json`;
- writes `external/project-authority-binding-summary.json`.

On success, the output contains:

- the five governed evidence records;
- `external/project-authority-index.json`;
- `external/source-handoff.json`;
- `external/source-materialization-request.json`;
- `external/source-handoff-acceptance.json`;
- `external/external-qualification-package.json`;
- `external/project-authority-bound-package.json`;
- `external/materialization-summary.json`;
- `external/project-authority-binding-summary.json`.

The materializer staging directory is atomically renamed to the requested output path. Handoff custody and binder files use create-only destination checks. A failed workflow is not eligible for Phase 6G.

## CLI

Validate WP-3 handoff:

```bash
node scripts/lfea-piping-phase6i-external-handoff-validator.mjs \
  --input-root=/path/to/caller-supplied-source \
  --handoff=request/external-evidence-handoff.json \
  --request=request/external-materialization-request.json \
  --output=/path/to/new/handoff-acceptance.json \
  --expected-head=617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54 \
  --source-run-id=<exact run ID> \
  --source-artifact-name=<exact artifact name>
```

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

The validator acceptance path and materializer output path must not exist. Neither may overlap the caller-controlled input root.

## Manual workflow

`.github/workflows/lfea-piping-external-evidence-materialization.yml` accepts:

- the immutable candidate SHA;
- the workflow run ID containing the caller-controlled source artifact;
- the exact source artifact name;
- the handoff path inside that artifact;
- the request path inside that artifact.

The workflow checks out the qualification-tooling head, verifies that the immutable candidate ref resolves to the supplied candidate SHA, downloads the source artifact, validates the WP-3 handoff, materializes the v2 package, retains the custody records, binds WP-2, and uploads:

```text
lfea-piping-external-evidence-${{ inputs.candidate_sha }}
```

That artifact is the external input to the Phase 6G runtime-bundle assembly workflow. The current Phase 6G wrapper does not yet promote the WP-3 custody records into the final runtime bundle; that is the next governed integration step.

## Qualification boundary

The committed checks are marked:

```text
[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]
```

They use synthetic records and injected authority/compiler/intake seams. They prove handoff hashing, dispatch identity binding, request-byte binding, seven-record presence, WP-2 identity binding, request/path handling, package derivation, canonical record persistence, retained-record equality, deterministic hashes, collision rejection, exact-head rejection and atomic cleanup. They do not prove any project, commercial, performance, rollback, approval or signature claim.

## Remaining conditions

- Populate and approve the real candidate-bound WP-2 index.
- Produce the seven non-fictional sealed source records for the immutable candidate.
- Create and retain the current-hash WP-3 handoff in the same source artifact.
- Run Phase 6H and retain the governed WP-2-bound external artifact and custody chain.
- Bind the retained WP-3 custody records through Phase 6G into the runtime bundle.
- Run Phase 6F for the same candidate.
- Run Phase 6G assembly and Phase 6E runtime certification.
- Retain successful workflow logs and complete independent Section 9 review.
