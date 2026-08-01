# LAFEA Bucket B0 — Current-Main Requalification

## 1. Authority

B0 is a read-only certification package for the exact pull-request head built from the then-current `main` base. It does not add template execution, source issuance, lifecycle registration, result binding, product promotion or release qualification.

The retained historical Bucket exact-head PASS is:

```text
24e2b1c7b7279dedc287432cb5165befbc95dcb6
```

B0 requires that historical commit to be available for comparison. It records the exact merge base, ancestry relationship and left/right divergence. The historical PASS is useful regression evidence but is never represented as current-head certification. It is not required to be a direct ancestor because retained certification branches may have been squash-merged or rebased.

## 2. Scope

B0 verifies:

- the exact candidate checkout identity;
- the frozen PR base is in candidate ancestry;
- tracked clean-tree and patch hygiene;
- 27 unique catalogued application templates;
- two analytical and five continuum compiler-bound capabilities;
- zero engine-executable templates;
- zero lifecycle-ready templates;
- zero result-ready templates;
- zero release-qualified templates;
- current registry-v2 stage identities;
- current stage composition roots;
- current lifecycle-profile bindings;
- current source-authority schema and role;
- product-adapter applicability for LAFEA.1 and LAFEA.2 only;
- current compatibility of every compiler-bound capability;
- retained T7C import-for-editing authority;
- absence of T7D authority.

Catalogued templates without a current compiler binding may remain blocked by pending stage, formulation, mesh, recovery or assessment authority. Those truthful blockers are retained in the compatibility ledger and do not become execution authority.

The complete retained Bucket stack and the current non-Bucket authority stack are executed in the same exact-head workflow. Repository-wide integration is retained as a separate attribution job.

## 3. Files

```text
scripts/lafea-template-b0-current-main-requalification-check.mjs
.github/workflows/lafea-template-b0-current-main.yml
docs/LAFEA_Bucket_B0_Current_Main_Requalification.md
e2e/fixtures/sequential-authoring-bridge-fixture.js
scripts/sequential-sketcher-authoring-bridge-check.mjs
```

The latter two files are a bounded B0-discovered correction: migration of a browser fixture and its paired unit fixture from an incomplete hand-built workspace dataset to the existing canonical workspace dataset normalizer.

The duplicate `check:lafea-workbench` package-script defect discovered by the initial B0 run was independently corrected on current `main` before this candidate was rebuilt. B0 retains that correction through its current base and makes no additional package change.

No production source, numerical implementation, stage registry, composition binding, lifecycle producer, template compiler, UI behavior, package dependency, tolerance or benchmark expected value is changed.

## 4. Commands

The bounded workflow runs:

```bash
npm ci
node scripts/lafea-template-b0-current-main-requalification-check.mjs
npm run check:lafea-template-stack
npm run check:lafea-nonbucket-stack
npm run build
git diff --check "$PR_BASE_SHA...HEAD"
```

The separate repository-attribution job runs:

```bash
npm ci
npm run gate
```

The existing non-Bucket and hybrid-browser workflows additionally execute the six governed Chromium cases, including `HC-UI-07` sequential authoring.

The workflow retains generated logs and reports as Actions artifacts. These generated untracked evidence files are excluded from the tracked clean-tree check; tracked source modifications remain forbidden.

## 5. Compatibility record

For every catalogued template, the B0 report records:

```text
templateId
bucketId
templateReleaseStatus
entryStageId
stageEngineState
compositionRootId
lifecycleProfileId
sourceSchema
sourceContractRole
productAdapterId
compilerBindingStatus
authorityState
compatibilityStatus
reasons
```

Every compiler-bound capability must be current against its target engine package, stage authority, input/result contract roles, lifecycle profile, release-state binding and product-adapter applicability.

Blocked non-compiler templates retain their exact current reasons. B0 does not manufacture missing authority to make the compatibility ledger green.

## 6. B0-discovered sequential-authoring fixture correction

`HC-UI-07` previously supplied a partial object labelled as `analysis-workspace-dataset/v1`. Later workspace rebuild requirements correctly require canonical source snapshot, source model and shared-model ancestry. The accepted gesture therefore failed at the existing gateway with `SEQUENTIAL_AUTHORING_COMMAND_REJECTED`.

The correction changes test fixtures only. They now construct the same simulated pipe/support source through `normalizeWorkspaceDataset`, retain deterministic dataset identity and revision, and project only primary start/end/center geometry into the existing browser assertion. The production bridge and command gateway remain unchanged and fail closed for incomplete datasets.

## 7. Retained authority

A passing B0 report has this disposition:

```text
B0_CURRENT_MAIN_FOUNDATION_REQUALIFIED_NO_EXECUTION_AUTHORITY
```

It retains:

```text
CATALOGUED          27
ENGINE_EXECUTABLE    0
LIFECYCLE_READY      0
RESULT_READY         0
RELEASE_QUALIFIED    0
T7C                   IMPORT_FOR_EDITING_ONLY
T7D                   UNAUTHORIZED
```

B0 does not authorize B1 implementation until this PR is merged and the resulting current `main` head is revalidated.

## 8. Stop conditions

B0 fails when:

- the checkout differs from the expected candidate SHA;
- the frozen PR base is not in candidate ancestry;
- the retained historical PASS object cannot be resolved for comparison;
- tracked files are dirty before or after certification;
- template count or identity drifts;
- any compiler binding is promoted from `DRAFT`;
- any template is marked `CONDITIONAL` or `QUALIFIED`;
- any compiler-bound target stage, composition, lifecycle, source or product-adapter compatibility drifts;
- LAFEA.6 becomes executable;
- any of the six governed Chromium cases fails;
- the bounded Bucket stack, current non-Bucket stack, build or hygiene check fails.

A repository-only failure is reported separately and must be attributed before any broader disposition is made.
