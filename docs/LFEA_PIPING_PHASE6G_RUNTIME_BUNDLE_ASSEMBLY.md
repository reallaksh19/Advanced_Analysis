# LFEA Piping Phase 6G — Governed Runtime-Bundle Assembly

Program disposition remains `BLOCKED` in the committed repository template.

## Purpose

Phase 6F produces the retained G0–G7 internal artifact set. Phase 6H produces the independently supplied G8–G10 external package, binds it to the approved WP-2 Project Authority Index, and retains the accepted WP-3 source custody chain. Phase 6E validates a complete runtime release bundle.

Phase 6G provides the governed assembly step between those authorities.

It copies and path-binds already sealed evidence. It does not execute engineering programs, create comparison values, approve WP-2 or WP-3, sign a disposition, change the committed release template or certify a release.

## Candidate and tooling identities

The only eligible evidence candidate is:

```text
CANDIDATE_SHA: 617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
CANDIDATE_REF: release/lfea-piping-phase6i-617f7c2
```

The workflow may execute reviewed assembly tooling from a later tooling head. It verifies the tooling checkout and immutable candidate ref separately. `github.sha` identifies the tooling checkout only and is never substituted for the evidence candidate.

## Inputs

The WP-3 custody assembler requires:

- a successful Phase 6F internal evidence root;
- the exact Phase 6F internal manifest path, defaulting to `internal/exact-head-manifest.json`;
- a governed Phase 6H external evidence root;
- the explicit relative path to `linear-piping-project-authority-bound-external-package/v1`;
- `external/source-handoff.json`;
- `external/source-materialization-request.json`;
- `external/source-handoff-acceptance.json`;
- the immutable candidate SHA;
- a new output path whose parent already exists.

The bound package contains the validated v2 external qualification package and the artifact reference for the retained approved Project Authority Index. The three custody records identify and bind the caller-controlled WP-3 source run, source artifact, request bytes, seven-record declaration and accepted WP-2 identity.

The internal and external roots must be real, distinct, non-symbolic-link directories. The output must not exist and must not overlap the repository or either input root.

## Source validation

Before copying, Phase 6G requires:

1. The bound external package to pass `requireProjectAuthorityBoundExternalPackage`.
2. The retained handoff to pass `requirePhase6iExternalEvidenceHandoff`.
3. The retained acceptance to pass `requirePhase6iExternalEvidenceHandoffAcceptance`.
4. The retained source request to use `lfea-piping-external-materialization-request/v2`, identify the immutable candidate and contain the exact seven governed record roles.
5. The source request authority path and all seven source-record paths to be safe and unique under case-insensitive comparison.
6. The bound package, embedded external package, WP-2 index, WP-3 handoff and handoff acceptance to identify the same immutable candidate.
7. The retained handoff path, retained request path and retained Project Authority Index path to equal the paths recorded by the acceptance.
8. The handoff and acceptance to agree on source workflow run ID, source artifact name and record count.
9. The canonical retained request hash to equal both the handoff and acceptance request hashes.
10. The canonical retained handoff content and its semantic/evidence hashes to equal the acceptance identities.
11. The WP-2 semantic/evidence hashes in the handoff and acceptance to equal the package-embedded Project Authority Index.
12. The bound-package path, WP-2 path, three WP-3 custody paths and five external evidence paths to be unique.
13. The internal manifest to pass `requireInternalExactHeadManifest` through the existing assembler.
14. The Phase 6F collection summary to identify ten commands, seven artifact roles and the same manifest hashes.
15. The Phase 6F A0 runtime baseline to identify the same candidate, a clean checkout and `EXACT_HEAD_BASELINE_CAPTURED`.
16. The baseline canonical content hash to match the Phase 6F collection summary.

## Delegated assembly chain

After the WP-3 custody checks pass, the wrapper delegates to `assembleWp2RuntimeReleaseBundle`.

The WP-2 wrapper validates the bound package and retained authority, creates a private external root containing the v2 external qualification package and five package-referenced records, and delegates to the existing `assembleRuntimeReleaseBundle` authority.

The existing internal/external validators and release-readiness evaluator remain unchanged. This preserves the public `lfea-piping-release-evidence/v1` schema and its exact artifact-key set. WP-2 and WP-3 retention do not add keys to `release-evidence.json`.

## Copy boundary

The existing assembler copies:

- the internal exact-head manifest;
- seven internal Phase 6D artifact roles;
- the Phase 6F collection summary and A0 runtime baseline;
- the v2 external qualification package;
- five external Phase 6C artifact roles.

The WP-2 wrapper additionally copies:

- `external/project-authority-index.json`;
- `external/project-authority-bound-package.json`.

The WP-3 wrapper additionally copies:

- `external/source-handoff.json`;
- `external/source-materialization-request.json`;
- `external/source-handoff-acceptance.json`.

Relative paths are preserved. Absolute paths, drive-qualified paths, traversal, empty segments, symbolic links, non-files and script/test/fixture/mock roots are rejected.

All source and destination paths must be unique under case-insensitive comparison. The runtime manifest and assembly-summary paths remain reserved.

## Atomic publication

The existing assembler first builds and validates a private legacy-compatible runtime bundle. It constructs a runtime-only `lfea-piping-release-evidence/v1` candidate containing:

- the immutable candidate SHA;
- all G0–G10 gates set to `VERIFIED`;
- the existing required artifact paths;
- `programDisposition: QUALIFIED`.

That candidate is passed through the existing Phase 6E evaluator with the real Phase 6D internal and Phase 6C external validators in release mode.

The WP-2 wrapper accepts that output only when it contains a valid WP-2 assembly summary and qualified release manifest for the same candidate. The WP-3 wrapper then accepts the WP-2 output only when its summary is `lfea-piping-wp2-runtime-bundle-assembly/v1` and remains candidate-consistent.

The WP-3 wrapper copies the delegated output and three custody records into a new staging directory. It replaces `bundle/assembly-summary.json` with `lfea-piping-wp3-runtime-bundle-assembly/v1`, which binds:

- the existing internal manifest identities;
- the v2 external package identities;
- the Project Authority Index path and identities;
- the project-authority-bound package path and identities;
- the WP-3 source workflow run ID and artifact name;
- the retained source handoff, source request and acceptance paths;
- the canonical source-request hash;
- the handoff content, semantic and evidence hashes;
- the handoff-acceptance semantic and evidence hashes.

The exact public release-manifest schema remains unchanged. On success, the WP-3 staging directory is renamed atomically to the requested output path. On failure, only agent-created temporary and staging directories are removed.

## CLI

```bash
node scripts/lfea-piping-wp3-runtime-bundle-assembler.mjs \
  --internal-root=/path/to/internal-artifact \
  --external-root=/path/to/phase6h-external-artifact \
  --bound-package=external/project-authority-bound-package.json \
  --handoff=external/source-handoff.json \
  --source-request=external/source-materialization-request.json \
  --handoff-acceptance=external/source-handoff-acceptance.json \
  --output=/path/to/new/runtime-bundle \
  --exact-head=617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
```

An alternate internal manifest path may be supplied with `--internal-manifest=`.

## Manual workflow

`.github/workflows/lfea-piping-runtime-bundle-assembly.yml` accepts:

- the immutable candidate SHA;
- the run ID and artifact name for the successful Phase 6F internal input;
- the run ID and artifact name for the governed Phase 6H external input;
- the bound-package path.

The three WP-3 custody paths are fixed governed paths, not user-selectable workflow inputs.

The workflow:

1. Checks out the selected qualification-tooling head.
2. Verifies the tooling checkout and immutable candidate ref separately.
3. Downloads the successful internal artifact.
4. Downloads the WP-2-bound and WP-3-custodied external artifact.
5. Runs the WP-3 Phase 6G assembler with `${{ inputs.candidate_sha }}`.
6. Revalidates the unchanged release manifest through `npm run check:lfea-piping-release` using the candidate SHA.
7. Uploads `lfea-piping-runtime-release-bundle-${{ inputs.candidate_sha }}`.

The resulting artifact is an input to Phase 6E runtime release certification. It is not a substitute for successful certification logs or independent review.

## Qualification boundary

The committed checks are marked:

```text
[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]
```

They use synthetic files and injected validators/assembler seams. They prove retained request schema validation, custody equality, candidate/head binding, WP-2/WP-3 identity agreement, deterministic summary identity, path-collision rejection, exact release-manifest compatibility, atomic cleanup and delegation through the existing release-evaluator route. They do not represent real G0–G10 evidence.

## Remaining conditions

- Approve and retain the real candidate-bound WP-2 index.
- Produce and accept the real seven-record WP-3 source artifact for the immutable candidate.
- Run Phase 6F successfully for the immutable candidate.
- Run Phase 6H successfully and retain the WP-2-bound, WP-3-custodied external artifact.
- Run Phase 6G and retain the assembled runtime bundle.
- Run the Phase 6E runtime release-certification workflow against that bundle.
- Retain successful full-gate, materialization, binding, custody, assembly, runtime-validation and signed-disposition evidence.
- Close `AUD-A7-001` only through independent evidence review.
