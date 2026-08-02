# LFEA Piping Phase 6G — Governed Runtime-Bundle Assembly

Program disposition remains `BLOCKED` in the committed repository template.

## Purpose

Phase 6F can produce the retained G0–G7 internal artifact set. Phase 6B defines the independently supplied G8–G10 external qualification package. Phase 6E validates a complete runtime release bundle.

Phase 6G provides the governed assembly step between those authorities.

It copies and path-binds already sealed evidence. It does not execute engineering programs, create comparison values, sign a disposition, change the committed release template or certify a release.

## Inputs

The assembler requires:

- a successful Phase 6F internal evidence root;
- the exact Phase 6F internal manifest path, defaulting to `internal/exact-head-manifest.json`;
- a governed Phase 6H external evidence root;
- the explicit relative path to `linear-piping-external-qualification-package/v2`;
- one exact 40-character repository head;
- a new output path whose parent already exists.

The v2 external package contains the complete approved WP-2 Project Authority Index and binds its semantic and evidence hashes into the package identities. Phase 6G therefore carries the authority record downstream by copying the sealed package; it does not re-approve, reinterpret or separately infer project authority.

The internal and external roots must be real, distinct, non-symbolic-link directories. The output must not exist and must not overlap the repository or either input root.

## Source validation

Before copying, Phase 6G requires:

1. The internal manifest to pass `requireInternalExactHeadManifest`.
2. The external package to pass `requireLinearPipingExternalQualificationPackage`, including its embedded approved WP-2 authority index.
3. Both sealed inputs to identify the requested exact head.
4. The Phase 6F collection summary to identify ten commands, seven artifact roles and the same manifest hashes.
5. The Phase 6F A0 runtime baseline to identify the same exact head, a clean checkout and `EXACT_HEAD_BASELINE_CAPTURED`.
6. The baseline canonical content hash to match the Phase 6F collection summary.

## Copy boundary

Only referenced files are copied:

- the internal exact-head manifest;
- seven internal Phase 6D artifact roles;
- the Phase 6F collection summary and A0 runtime baseline;
- the v2 external qualification package, including the embedded WP-2 authority index;
- five external Phase 6C artifact roles.

The separate `external/project-authority-index.json` materialized by Phase 6H remains a source-artifact custody copy. The complete validated authority record is also embedded in the external package, and that package is the authoritative downstream binding.

Relative paths are preserved so existing manifest/package references remain authoritative. Absolute paths, drive-qualified paths, traversal, empty segments, symbolic links, non-files and script/test/fixture/mock roots are rejected.

All destination paths must be unique under case-insensitive comparison. The runtime manifest and assembly-summary paths are reserved.

## Atomic publication

Assembly occurs in a new sibling staging directory.

After copying, Phase 6G constructs a runtime-only `lfea-piping-release-evidence/v1` candidate containing:

- the exact requested head;
- all G0–G10 gates set to `VERIFIED`;
- all fourteen required artifact paths;
- `programDisposition: QUALIFIED`.

That candidate is not published immediately. It is first passed through the existing Phase 6E evaluator with the real Phase 6D internal and Phase 6C external validators in release mode.

Publication occurs only when the evaluator returns:

- `mode: RELEASE`;
- `releaseEligible: true`;
- the same exact head;
- eleven verified gates;
- `programDisposition: QUALIFIED`.

On success, the staging directory receives:

- `release-evidence.json`;
- `bundle/assembly-summary.json`;

and is renamed atomically to the requested output path.

On any failure, the assembler removes only its own staging directory and leaves the requested output path absent.

## CLI

```bash
node scripts/lfea-piping-runtime-bundle-assembler.mjs \
  --internal-root=/path/to/internal-artifact \
  --external-root=/path/to/external-artifact \
  --external-package=external/external-qualification-package.json \
  --output=/path/to/new/runtime-bundle \
  --exact-head=<selected checkout SHA>
```

An alternate internal manifest path may be supplied with `--internal-manifest=`.

## Manual workflow

`.github/workflows/lfea-piping-runtime-bundle-assembly.yml` accepts the run ID and artifact name for both inputs plus the external package path.

The workflow:

1. Checks out the selected exact head.
2. Downloads the successful internal artifact.
3. Downloads the governed external artifact.
4. Runs the Phase 6G assembler with `${{ github.sha }}`.
5. Revalidates the assembled bundle through `npm run check:lfea-piping-release`.
6. Uploads `lfea-piping-runtime-release-bundle-${{ github.sha }}`.

The resulting artifact is an input to the Phase 6E runtime release-certification workflow. It is not a substitute for retaining successful certification logs.

## Qualification boundary

The committed check is marked:

```text
[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]
```

It uses synthetic files and injected intake validators. It proves assembly mechanics, exact-head binding, deterministic output, collision and traversal rejection, atomic cleanup, v2 package carriage and release-evaluator routing. It does not represent real WP-2 or G0–G10 evidence.

## Remaining conditions

- Produce and approve the candidate-bound WP-2 Project Authority Index.
- Run Phase 6F successfully on the selected exact head.
- Supply a complete non-fictional Phase 6H external package for that same head.
- Run Phase 6G and retain the assembled bundle artifact.
- Run the Phase 6E runtime release-certification workflow against that bundle.
- Retain successful full-gate, assembly, runtime-validation and signed-disposition evidence.
- Close `AUD-A7-001` only through independent evidence review.
