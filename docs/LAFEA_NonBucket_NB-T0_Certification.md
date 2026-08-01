# LAFEA Non-Bucket NB-T0 Certification

## Work package

`NB-T0 — EXACT-HEAD AND SCOPE CERTIFICATION`

## Baseline

- Current main at branch creation: `8d49d6fb6f81df89874c837a6786a4302148fd54`
- Branch: `ci/lafea-nonbucket-t0-certification`
- Governing scope: original six-stage non-bucket LAFEA only
- Numerical authority changed: **No**
- Lifecycle semantics changed: **No**
- Shell authority changed: **No**
- LAFEA.6 enabled: **No**

## Material state change

This package creates a dedicated non-bucket certification boundary instead of treating the existing `lafea-agent1-stack-check.mjs` aggregate as a clean Agent 1 product gate.

The new boundary:

- retains U0, U1, U2, U3 and U4 checks;
- retains current LAFEA.1–.5 workbench dispatch and presenter checks;
- retains LAFEA.6 fail-closed checks;
- excludes Agent 2 application-template/bucket checks;
- excludes LFEA piping checks;
- excludes sequential-sketcher, first-cut and accessory-panel checks;
- runs the scoped LAFEA hybrid browser specification separately;
- records bounded and repository-integration outcomes in separate machine-readable matrices.

## Current failure matrix before exact-head execution

| Scope | Current evidence | Disposition before this PR's workflow |
|---|---|---|
| Non-bucket U0–U4 | Component checks exist, but no dedicated retained exact-head aggregate | `IMPLEMENTED_EXECUTION_REQUIRED` |
| Legacy Agent 1 aggregate | Includes template/bucket and adjacent first-cut, sequential and accessory checks | `CROSS_SCOPE_ATTRIBUTION_ONLY` |
| Current-main combined status | Connected commit status endpoint returned no retained statuses | `UNRESOLVED_GATE` |
| Current-main workflow runs | Connected commit-run endpoint returned no retained runs | `UNRESOLVED_GATE` |
| Full repository gate | Latest retained executable route reaches `npm ci` and fails at Issue #116 Phase 6C evidence guard | `REPOSITORY_INTEGRATION_BLOCKED` |
| PR #107 | Open CI-only workflow on an older/diverged branch state | `SUPERSEDE_ON_CURRENT_MAIN` |
| Issue #54 | Original pre-step/no-log symptom resolved on a later head; complete closure criteria not yet met | `EXECUTABLE_CERTIFICATION_REMAINS_OPEN` |
| Issue #116 | Bounded LFEA piping evidence-source binding defect | `OUT_OF_SCOPE_DO_NOT_MODIFY` |

No row above is a product-release qualification.

## Certification commands

The bounded job executes on one exact checkout SHA:

```bash
npm ci
npm run check:lafea-nonbucket-stack
npm run check:lafea-core
npm run check:lafea-foundation
npm run check:lafea-meshing
npm run check:lafea-solver
npm run check:lafea-workbench
npm run check:lafea-canvas
node scripts/run-playwright.mjs e2e/lafea-hybrid-workbench.spec.js
npm run syntax:strict
npm run check:imports
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --short)"
```

The repository-integration attribution job separately executes:

```bash
npm ci
npm run check:lafea-agent1-stack
npm run gate
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --short)"
```

A failure in the legacy aggregate or full gate is not hidden inside the bounded non-bucket result.

## Retained evidence

The workflow uploads:

- `lafea-nonbucket-failure-matrix.json`;
- bounded command logs;
- scoped browser report and test results;
- `lafea-repository-integration-matrix.json`;
- legacy aggregate and full-gate logs.

The repository matrix classifies the known Issue #116 signature as `REPOSITORY_INTEGRATION_BLOCKED_ISSUE_116` without weakening or modifying the LFEA piping guard.

## Allowed write set used

- `scripts/lafea-nonbucket-stack-check.mjs`
- `scripts/lafea-nonbucket-scope-guard.mjs`
- `.github/workflows/lafea-nonbucket-stack.yml`
- `package.json` script registration only
- this certification document

## Prohibited write sets not touched

- `src/core/**`
- lifecycle contracts or lifecycle semantics
- Agent 2 template/bucket files
- LFEA piping Phase 6 files
- Issue #116 correction files
- first-cut, sequential-sketcher or accessory-panel product logic
- shell formulation labels or dispatch
- LAFEA.6 engine, editing or result authority

## Acceptance interpretation

- Bounded commands all pass: non-bucket exact-head evidence is eligible for NB-T0 review.
- Bounded commands pass and full gate fails only at verified Issue #116: `CONDITIONAL ACCEPTANCE — REPOSITORY_INTEGRATION_BLOCKED`.
- Any bounded command fails: `REJECTED` or `UNRESOLVED_GATE`, according to reproducibility and evidence availability.
- No workflow result promotes calculation, lifecycle, code or release authority.
