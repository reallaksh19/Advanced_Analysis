# LFEA P0 UI Containment Evidence

## Work package

- Package: `LFEA-P0-UI-CONTAINMENT`
- Repository: `reallaksh19/Advanced_Analysis`
- Target: `main`
- Confirmed base SHA: `ffc18ed1f4bfaa57a33ef70c7b5cb847121dd979`
- Branch: `fix/lfea-p0-ui-containment`
- Package ownership respected: `package.json` and numerical/core kernel directories are unchanged.

## Containment implemented

- Bootstrap requires exactly one LAFEA consumer root and exactly one LFEA consumer root, verifies they are different elements, and mounts each controller into its named root.
- Worker request, progress, completion, failure, and cancellation evidence carry `runId`, `inputSemanticHash`, and `inputModelVersion`.
- Store acceptance requires active run identity and the current package semantic hash to match the run input. Rejected messages produce machine-readable diagnostics and cannot populate current execution or enable evidence export.
- Every committed model mutation invokes the controller cancellation hook before commit. The resulting state is `READY`, with no active run or current execution and diagnostic `LFEA_RUN_CANCELLED_MODEL_CHANGED`.
- Node movement remains preview-only until the explicit Apply action.
- Display state is explicit and orthogonal to the engineering package: `resultMode`, positive finite `deformationScale`, and source `LFEA_REVIEW_PROFILE`.
- DEFORMED mode is unavailable without a current qualified displacement result. The viewport always receives explicit deformation options and labels `UNDEFORMED` or `DEFORMED ×<scale>`.
- Store invariants are checked on every published transition.

## Targeted validation performed in the available environment

The requested repository checkout was not mounted at `/home/user/Advanced_Analysis`, `gh` was unavailable, and outbound cloning was blocked. The patch was therefore assembled from the confirmed GitHub `main` sources and exercised with controlled local module stubs.

| Check | Result |
|---|---|
| JavaScript syntax for every changed/new `.js` and `.mjs` file | PASS |
| `LFEA_P0_SOURCE_ONLY=1 LFEA_P0_CHECK_ROOT=/tmp/lfea-p0 node scripts/lfea-p0-ui-containment-check.mjs` | PASS |
| Controlled store identity/mutation/display/invariant harness | PASS |
| Controlled worker request/progress/completion/cancellation harness | PASS |

The source-level check ignores comments before evaluating implementation evidence.

## Browser regression coverage added

- P0-E01 LFEA and LAFEA mount in distinct views, and destroying an isolated LFEA controller does not clear an isolated LAFEA root.
- P0-E02 tab switching exposes only the selected workbench.
- P0-E03 late completion from an old run is rejected.
- P0-E04 old progress is ignored.
- P0-E05 committed node edit during a run cancels the run.
- P0-E06 undo during a run cancels the run.
- P0-E07 preview-only node movement does not commit or cancel.
- P0-E08 DEFORMED is disabled before solve.
- P0-E09 DEFORMED renders after a controlled qualified solve.
- P0-E10 invalid scale is rejected without render failure.
- P0-E11 display scale does not change package hash, model version, history, or current execution.
- P0-E12 stale results cannot enable evidence export or DEFORMED mode.

Controlled browser tests inject worker messages deterministically and contain no arbitrary sleeps.

## Deliberate regressions

Each deliberate regression was introduced into a temporary copy and removed after proving the corresponding containment check or harness failed:

| Regression | Expected proof |
|---|---|
| Both controllers use `lfea-consumer-root` | Source containment check failed |
| Completion ignores `inputSemanticHash` | Source containment check failed |
| Committed edit omits active-run cancellation | Source containment check failed |
| DEFORMED availability guard is disabled | Store harness failed |
| Renderer receives no explicit deformation scale | Source containment check failed |
| Display-scale mutation changes package hash | Store harness failed |

## Required repository commands

These commands remain required on a complete checkout:

```text
npm install
node scripts/lfea-p0-ui-containment-check.mjs
npm run check:lfea-workbench
npm run check:lafea-workbench
npx playwright test e2e/lfea-workbench.spec.js e2e/lafea-workbench.spec.js
npm run syntax:strict
npm run check:imports
npm run build
npm run gate
git diff --check
git status --short
```

They were not represented as passing in this evidence because the execution environment did not expose the repository checkout or permit cloning it. Qualification therefore remains pending the full repository gate.

## Requested package integration

`package.json` is intentionally unchanged. The reviewer should add the dedicated command to final gate wiring after the B-2.0 reconciliation:

```text
node scripts/lfea-p0-ui-containment-check.mjs
```

## Status

`P0 UI CONTAINMENT STATUS: IMPLEMENTED — FULL-GATE QUALIFICATION PENDING`
