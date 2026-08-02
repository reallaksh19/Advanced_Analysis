# LFEA Piping Phase 6E — Runtime Release-Bundle Orchestration

Program disposition remains `BLOCKED` in the committed repository manifest.

## Purpose

A release manifest committed inside the repository cannot truthfully contain the SHA of the commit that contains that manifest: changing the manifest changes the commit SHA. Phase 6E therefore separates repository policy qualification from runtime release validation.

The current Phase 6I route also separates:

- **tooling head** — the reviewed repository checkout that supplies validation code;
- **evidence candidate** — the immutable candidate represented by the retained bundle;
- **WP-3 custody intake** — post-download validation that the bundle still contains the accepted source handoff, exact request, WP-2 authority and bound-package identities produced by Phase 6G;
- **public release validation** — the existing Phase 6C/6D persisted-evidence and release-manifest evaluation.

The only eligible evidence candidate is:

```text
CANDIDATE_SHA: 617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
CANDIDATE_REF: release/lfea-piping-phase6i-617f7c2
```

## Policy mode

The existing command remains:

```bash
npm run check:lfea-piping-release-policy
```

Policy mode:

- reads `release-evidence/lfea-piping-release-evidence.json` from the repository;
- requires `programDisposition: BLOCKED`;
- runs simulated source and anti-drift checks;
- permits `npm run gate` to qualify the tooling head without introducing a self-referential manifest.

Runtime release options are rejected unless `--release` is present.

## WP-3 runtime-bundle intake

Before public release validation, the downloaded bundle is validated with:

```bash
node scripts/lfea-piping-wp3-runtime-bundle-intake.mjs \
  --evidence-root=/absolute/path/to/release-bundle \
  --manifest=release-evidence.json \
  --summary=bundle/assembly-summary.json \
  --output=/absolute/path/to/new/wp3-bundle-intake.json \
  --expected-head=617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
```

The intake requires:

1. `bundle/assembly-summary.json` to use `lfea-piping-wp3-runtime-bundle-assembly/v1`.
2. The summary status to remain `ELIGIBLE_FOR_RELEASE_CERTIFICATION`.
3. The summary, release manifest, external package, bound package, WP-2 index, WP-3 handoff and handoff acceptance to identify the immutable candidate.
4. The release manifest path to equal the path retained by the assembly summary.
5. The release manifest to remain `lfea-piping-release-evidence/v1`, `QUALIFIED`, and point to the same persisted external package as the summary.
6. The persisted external package to be canonically identical to the package embedded in the WP-2-bound package.
7. The retained WP-2 index to be canonically identical to the package-embedded authority and to reconstruct its artifact content, semantic and evidence hashes.
8. The summary’s external-package, WP-2 and bound-package identities to match the retained records.
9. The retained materialization request to use v2, bind the immutable candidate and declare exactly seven unique governed source paths.
10. The request package ID to equal the bound package ID.
11. The canonical request hash to equal the summary, handoff and acceptance identities.
12. The retained handoff and acceptance paths, source workflow run ID and source artifact name to match the summary.
13. The retained handoff content, semantic and evidence hashes to match the summary and acceptance.
14. The retained acceptance content, semantic and evidence hashes to match the summary.
15. The handoff and acceptance WP-2 semantic/evidence identities to match the retained authority.
16. All bundle paths to be safe, relative, regular, non-symbolic-link JSON files inside the evidence root.

Successful intake produces:

```text
schema: lfea-piping-wp3-runtime-bundle-intake/v1
status: ELIGIBLE_FOR_RUNTIME_RELEASE_VALIDATION
releaseQualified: false
```

This is permission to execute the public release validator only. It is not release approval.

## Runtime release mode

The existing release command remains:

```bash
npm run check:lfea-piping-release -- \
  --evidence-root=/absolute/path/to/release-bundle \
  --manifest=release-evidence.json \
  --expected-head=617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54
```

The package script supplies `--release`; callers supply:

- `--evidence-root` — directory containing the runtime release bundle;
- `--manifest` — safe relative JSON path inside that root;
- `--expected-head` — immutable evidence-candidate SHA, not the tooling checkout SHA.

Release mode requires:

1. A valid runtime release manifest with the exact key contract.
2. `programDisposition: QUALIFIED` in that runtime manifest.
3. Every G0–G10 gate set to `VERIFIED`.
4. Every required artifact path populated.
5. Runtime manifest `exactHead` equal to `--expected-head`.
6. Phase 6D internal intake returning `ELIGIBLE_FOR_RELEASE_REVIEW` at that candidate.
7. Phase 6C external intake returning `ELIGIBLE_FOR_RELEASE_REVIEW` at that candidate.
8. Both intake records marked `releaseEligible: true`.

Release mode does not execute simulated project fixtures or blocked-template assertions.

## Runtime path policy

The evidence root must exist, be a real directory, not be a symbolic link, and not overlap the tooling repository. The runtime manifest, assembly summary and all retained custody records must:

- use safe relative `.json` paths inside the evidence root;
- contain no absolute path, drive prefix, empty segment, `.` or `..` segment;
- exist as regular non-symbolic-link files;
- resolve inside the evidence root.

The WP-3 intake, Phase 6C and Phase 6D validators independently apply path, identity and hash controls to their governed records.

## CI workflow

`.github/workflows/lfea-piping-runtime-release-certification.yml` is manual and requires:

- the immutable candidate SHA;
- the workflow run ID that retained the runtime bundle;
- the exact artifact name;
- the manifest path inside that bundle.

The workflow:

1. Checks out the selected qualification-tooling head.
2. Verifies the tooling checkout separately from the immutable candidate ref.
3. Runs the full repository gate against the committed blocked template.
4. Downloads the retained runtime bundle from the supplied run and artifact.
5. Runs WP-3 custody intake against `bundle/assembly-summary.json` and the immutable candidate.
6. Runs the existing public release command only after custody intake succeeds.
7. Uploads both validation records as `lfea-runtime-release-validation-${{ inputs.candidate_sha }}`.

The workflow does not create, edit or sign project or release evidence.

## Qualification coverage

The Phase 6E suites are marked simulated and ineligible for project/release evidence. They prove:

- blocked policy mode invokes only policy checks;
- release mode invokes both persisted intakes and skips policy checks;
- runtime options require explicit release mode;
- tooling-head and candidate-head identities remain separate;
- WP-3 custody intake precedes public release validation;
- downloaded request, handoff, acceptance, WP-2 authority, package and summary tampering fail closed;
- runtime manifest path containment and candidate equality;
- complete gate and artifact requirements;
- qualified disposition requirement;
- internal and external intake status/head enforcement;
- the committed manifest remains blocked, null-headed and self-reference free.

## Remaining conditions

- Approve and retain the real candidate-bound WP-2 index.
- Produce and accept the real seven-record WP-3 source artifact.
- Complete Phase 6F, Phase 6H and Phase 6G for the immutable candidate.
- Dispatch Phase 6E with the exact runtime-bundle run ID, artifact name and candidate SHA.
- Retain successful repository-gate, WP-3 intake and public release-validation logs.
- Obtain the governed independent closure disposition.
- Close `AUD-A7-001` only through independent evidence review.
