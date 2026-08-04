# P0 Current-Main Non-FEA Audit

## Status

**IMPLEMENTATION ACCEPTED FOR MERGE — EXECUTABLE BASELINE STILL UNRESOLVED**

This audit is the P0 read-only evidence implementation for the programme defined by [`docs/Nonfeaplan.md`](./Nonfeaplan.md). Owner review authorizes merging the P0 evidence machinery, but does **not** represent the exact-head baseline as executed or accepted.

- Original plan-preparation snapshot: `0bad5b4200a8e24a358e76b1ea8372da33485c87`
- Latest synchronized P0 current-main base: `e531f51871597b9ec48d4f0064213c4326264128`
- Programme branch: `orchestrator/non-fea-workspace-hardening`
- P1 delegated qualification Work Pack: [issue #541](https://github.com/reallaksh19/Advanced_Analysis/issues/541)
- Production files authored by P0: **none**

The historical plan text that describes M004–M006 as unmerged is superseded for programme intake by current `main`: M001–M006 and the R0/M003 bounds stabilization are merged production inputs. Their merge status remains implementation evidence, not P1/P2/P3/P4 qualification.

The P0 branch was synchronized with current `main` after M003 bounds stabilization, M019, M004–M006, and the later M018 LFEA benchmark merge. Incoming production and LFEA files are merge ancestry, not P0-authored scope. The runner derives the current-main merge base from Git at execution time rather than trusting this narrative SHA.

## Merge boundary

Merging P0 publishes the evidence runner, contracts, fixture authority, browser-ledger contract, ownership map, and seed report. It does not change production behaviour.

After merge:

- `P0_IMPLEMENTATION_PRESENT` may be true;
- `P0_ACCEPTED` remains false until the exact-head execution gate passes;
- P1 may continue measurement and proposal preparation;
- P1–P7 production edits remain blocked until the Owner accepts the completed P0 execution report.

## Implemented P0 evidence path

```text
repository or explicitly bound content-addressed fixture bytes
  -> governed fixture authority manifest
  -> complete prerequisite/current-main command ladder
  -> scripts/run-non-fea-current-main-baseline.mjs
  -> production normalizeWorkspaceDataset
  -> WorkspaceState publication
  -> production support-site model
  -> production route-partition model
  -> model-zone projection
  -> resolved engineering geometry
  -> viewport render model
  -> exact SHA/identity disposition
  -> separately generated exact-head browser ledger
  -> fail-closed report validation
  -> reports/non-fea-current-main-baseline.json
```

The runner retains failures instead of repairing, suppressing, or reclassifying production behaviour. It refuses a passing report when the worktree is dirty, fixture authority is incomplete, the command ladder is incomplete, source mutation is observed, or browser evidence is missing/stale.

## Current production route findings

1. `DatasetController.load()` synchronously invokes `normalizeWorkspaceDataset()` before publishing the workspace snapshot.
2. `normalizeWorkspaceDataset()` builds the source snapshot, source index, normalized entities, hierarchy, summary, and shared model as one composite public stage.
3. `EngineeringModelController.handleSnapshot()` rebuilds the engineering model for a new dataset reference. Project Data changes rebuild it again.
4. `EngineeringModelStore.rebuild()` synchronously constructs support sites and route partitions.
5. `ViewportPanel.renderDataset()` synchronously performs model-zone projection, support-site projection, resolved geometry, filtering, render-model construction, and renderer installation.
6. Ordinary `renderThreeModel()` clears all engineering scene objects, recreates primitives, rebuilds the exact object map, and fits the first model.
7. Selection flattens all object arrays for raycasting on each qualified pick.
8. The topology-edit route is separate and uses canonical topology plus a certified immutable journal/replay boundary.
9. M005 pooling/instancing and M006 orientation presentation are current production ancestry and must be measured by P1/P4; merge narratives do not substitute for exact-head browser and identity qualification.
10. Authorized enrichment and empirical execution exist, but the production bypass inventory remains open.
11. `SupportLoadPresenter` enforces qualified LFEA, current empirical OPE, then sealed first-cut priority. Ordinary WebGL support-load callouts remain an open P7 gap.

## Observability gaps retained by P0

The current public normalization boundary does not expose separate timings for source snapshot, source index, entity normalization, hierarchy construction, and shared-model projection. P0 records these as zero-sample/null timing rows rather than inventing measurements.

Canonical topology/checker/edit transition proof remains in the registered topology-edit test ladder. P0 does not reconstruct a second topology path.

Browser-only Three materialization, GPU scene installation, fit, first meaningful frame, first selection, orbit/pan, and long tasks must be supplied through the exact-head `non-fea-browser-baseline/v1` ledger. A passing navigation command by itself is not browser-stage evidence.

## Governed fixture authority

Fixture custody is defined in `scripts/non-fea-baseline/fixture-authority-manifest.mjs`. Repository defaults are executed automatically; a CLI binding overrides a default only for that role. Every bound source is hashed and its governed identity fields are compared exactly.

### Repository-owned 20-object topology-edit fixture

- Path: `public/fixtures/topology-edit-20-element-demo.staged.json`
- Expected identity: 20 normalized entities, 15 piping objects, 5 supports
- Authority: production Playwright walkthrough and the fixture's declared demo identity
- Current gate: exact source SHA-256 is captured by the runner but remains `CAPTURED_PENDING_OWNER_ACCEPTANCE` until frozen in the authority manifest

### Repository-owned 1885 support/branch fixture

- Path: `benchmarks/Sjson.json`
- Accepted SHA-256: `6b2c8b01ab0ba6ec8e9e7c42eb4a719668ffd2dc4dbe4790d27cf426a1f60288`
- Expected identity: 279 entities, 139 support source records, 38 support assemblies, 37 physical locations, 13 routes, 150 renderables
- Authority: `tests/fixtures/topology-edit/1885s/fixture-manifest.json` and accepted M005 production-adapter certification

### External content-addressed 4,884-entity fixture

- Expected SHA-256: `88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6`
- Expected identity: 4,884 entities, 3,277 pipes, 1,331 supports
- Authority: accepted real-project benchmark evidence
- Current gate: bind an exact repository-relative cache path with `--fixture-role LARGE_MODEL_4884_ENTITY=<path>`

The runner raises named failures for unbound authority, missing files, unexecuted bindings, absent accepted SHA, SHA mismatch, identity mismatch, and browser-fixture mismatch. It never substitutes the portable 25,600-component synthetic fixture for the 4,884-entity authority.

## Complete command ladder

The recorded ladder includes:

- `npm ci`;
- both required normalization benchmarks;
- P0 tests;
- workspace, first-cut, enrichment, empirical, sketcher, topology, and navigation checks;
- Playwright navigation;
- strict syntax and production build;
- `git diff --check` and `git status --short`.

Globs are expanded deterministically before process execution, including on Windows. Every command records exit status, duration, output SHA-256, output tail, and blocked-error evidence.

## Required exact-head execution

```bash
node scripts/run-non-fea-current-main-baseline.mjs \
  --warm-samples 5 \
  --fixture-role LARGE_MODEL_4884_ENTITY=<content-addressed-repository-relative-cache-path> \
  --browser-evidence <repository-relative-browser-evidence.json> \
  --run-commands \
  --fail-on-gate
```

The supplied browser evidence must bind the same execution ID, exact head SHA, verified 4,884 fixture path and SHA. It must contain all six browser-stage measurements, browser/OS/viewport evidence, long-task support, zero page errors, exactly one canvas, exactly one WebGL canvas, and exactly one render owner.

## Acceptance gate

P0 is accepted only when:

- exact head and clean status are recorded;
- the 20-object captured SHA is explicitly accepted and frozen;
- the external 4,884 source verifies its accepted SHA and identity;
- the 1885 source verifies its accepted SHA and identity;
- fixture-separated cold/warm stage evidence is present;
- the complete command ladder passes;
- the exact-head browser ledger passes;
- all failures are classified exactly once;
- source non-mutation passes across the completed production path;
- the ownership matrix is accepted;
- no P0-authored production file changed;
- the Owner explicitly accepts the completed baseline and authorizes subsequent production Work Packs.
