# LFEA Piping Phase 6F — Exact-Head Internal Evidence Collection

Program disposition remains `BLOCKED`.

## Purpose

Phase 6D defines how retained G0–G7 evidence is validated. Phase 6F executes the governed internal command plan on one checked-out SHA and creates the Phase 6D artifact set from actual command results.

Phase 6F does not create project reconciliation, commercial corroboration, performance, rollback or signed-disposition evidence. It does not edit the release manifest or promote any gate.

## Invocation

The collector is intended to run from the dedicated manual workflow:

```bash
node scripts/lfea-piping-internal-evidence-collector.mjs \
  --output=<empty directory outside the repository> \
  --exact-head=<40-character checked-out SHA>
```

The collector independently resolves `git rev-parse HEAD` and refuses a mismatch before executing the command plan.

The output directory:

- must be outside the repository;
- must not be a symbolic link;
- must be empty when supplied;
- is never deleted or overwritten by the collector.

## Governed command plan

Commands execute sequentially and fail closed:

1. `EXACT_HEAD_BASELINE` — exact-head A0 baseline capture.
2. `UPSTREAM_NUMERICAL_CHAIN` — `npm run check:lfea-core`.
3. `T0_APPLICATION_SEQUENCING` — bounded T0 consumer check.
4. `SOURCE_ORCHESTRATION` — source-orchestration analytical check.
5. `INTERFACES` — complete interface package check.
6. `INTERFACE_RECOVERY` — direct interface/reaction recovery check.
7. `CODE_AND_ALLOWABLES` — configured nozzle and B31.3 application check.
8. `PRESENTATION_EXPORT` — current-only presentation and deterministic export check.
9. `FULL_REPOSITORY_GATE` — `npm run gate` against the committed blocked policy template.
10. `CLEAN_TREE` — `git diff --check` and empty `git status --porcelain`.

A failed command stops collection. The collector writes `internal/collection-failure.json` with actual stdout, stderr and exit status and does not write an exact-head manifest.

## Successful output

A successful run writes:

- `internal/exact-head-manifest.json`;
- `internal/upstream-gate.log`;
- `internal/t0-gate.log`;
- `internal/source-orchestration.json`;
- `internal/interface-evidence.json`;
- `internal/interface-recovery.json`;
- `internal/code-and-allowable.json`;
- `internal/presentation-export.json`;
- `internal/audit-baseline.runtime.json`;
- `internal/collection-summary.json`.

Text logs contain the exact head, normalized command text, exit code and actual stdout/stderr. JSON phase evidence retains exact role, head, PASS status, command identity, stdout, stderr, output hash and byte length.

The collector seals `lfea-piping-exact-head-manifest/v1` through the existing Phase 6D authority. Manifest command text is normalized to stable `node`, `npm` and `$EVIDENCE_ROOT` forms so semantic identity does not depend on runner-temporary paths.

## Workflow

`.github/workflows/lfea-piping-internal-evidence-collection.yml` is manual. It:

1. Checks out the selected head.
2. Installs locked dependencies.
3. Runs the real collector with `--exact-head=${{ github.sha }}`.
4. Uploads `lfea-piping-internal-evidence-${{ github.sha }}` only after successful collection.
5. Uploads a separate failure artifact when command collection fails.

The successful artifact is an internal-evidence input for a later complete Phase 6E runtime release bundle. It is not, by itself, a qualified release bundle.

## Qualification boundary

The committed Phase 6F checks use an injected fake runner and are marked:

```text
[SIMULATED][NO_ENGINEERING_COMMAND_EXECUTION]
```

They qualify:

- command-plan coverage and ordering;
- option and exact-head validation;
- Phase 6D-valid artifact generation;
- command failure behavior;
- non-destructive output policy;
- repository-output prohibition;
- path-independent manifest identity;
- retention of command output and hashes.

Only the manual collection workflow executes the real command plan.

## Remaining conditions

- Run the collection workflow successfully on the selected release head.
- Retain its successful artifact and workflow logs.
- Supply the independent Phase 6B external evidence package.
- Assemble both internal and external evidence into a governed Phase 6E runtime bundle.
- Run runtime release certification and retain the result.
