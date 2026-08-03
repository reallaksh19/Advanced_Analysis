# P0 Current-Main Non-FEA Audit

## Status

**IMPLEMENTATION READY — EXACT-HEAD OWNER EXECUTION REQUIRED**

This audit is the P0 read-only execution record for the programme defined by [`docs/Nonfeaplan.md`](./Nonfeaplan.md). It does not authorize P1–P7 production edits and does not claim an executed baseline from the connector environment.

- Original plan-preparation snapshot: `0bad5b4200a8e24a358e76b1ea8372da33485c87`
- Latest synchronized P0 current-main base: `7a6cfadb2c898ddac8cb2dba09b7d400ff800696`
- Programme branch: `orchestrator/non-fea-workspace-hardening`
- P1 delegated qualification Work Pack: [issue #541](https://github.com/reallaksh19/Advanced_Analysis/issues/541)
- Production files authored by P0: **none**

The P0 branch was synchronized with current `main` after M003 bounds stabilization, M019, M004, and M005 merged. Those incoming production files are merge ancestry, not P0-authored scope. The runner derives the current-main merge base from Git at execution time rather than trusting this narrative SHA.

## Implemented P0 evidence path

```text
repository fixture bytes
  -> scripts/run-non-fea-current-main-baseline.mjs
  -> production normalizeWorkspaceDataset
  -> WorkspaceState publication
  -> production support-site model
  -> production route-partition model
  -> model-zone projection
  -> resolved engineering geometry
  -> viewport render model
  -> reports/non-fea-current-main-baseline.json
```

The runner also records the registered command ladder and retains failures instead of repairing or suppressing them.

## Current production route findings

1. `DatasetController.load()` synchronously invokes `normalizeWorkspaceDataset()` before publishing the workspace snapshot.
2. `normalizeWorkspaceDataset()` builds the source snapshot, source index, normalized entities, hierarchy, summary, and shared model as one composite public stage.
3. `EngineeringModelController.handleSnapshot()` rebuilds the engineering model for a new dataset reference. Project Data changes rebuild it again.
4. `EngineeringModelStore.rebuild()` synchronously constructs support sites and route partitions.
5. `ViewportPanel.renderDataset()` synchronously performs model-zone projection, support-site projection, resolved geometry, filtering, render-model construction, and renderer installation.
6. Ordinary `renderThreeModel()` clears all engineering scene objects, recreates primitives, rebuilds the exact object map, and fits the first model.
7. Selection flattens all object arrays for raycasting on each qualified pick.
8. The topology-edit route is separate and uses canonical topology plus a certified immutable journal/replay boundary.
9. M005 pooling/instancing is now current production ancestry and must be measured by P1; its merge does not substitute for exact-head browser and identity qualification.
10. Authorized enrichment and empirical execution exist, but the production bypass inventory remains open.
11. `SupportLoadPresenter` enforces qualified LFEA, current empirical OPE, then sealed first-cut priority. Ordinary WebGL support-load callouts remain an open P7 gap.

## Observability gaps retained by P0

The current public normalization boundary does not expose separate timings for source snapshot, source index, entity normalization, hierarchy construction, and shared-model projection. P0 records this as an observability gap; it does not reimplement the production normalizer.

The Node runner cannot produce browser-only timings for Three materialization, GPU scene installation, fit, first meaningful frame, first selection, orbit/pan, or long tasks. These require the exact-head Playwright ledger.

Canonical topology/checker/edit transition proof remains in the registered topology-edit test ladder and must be retained as command evidence. P0 does not reconstruct a second topology path.

## Fixture gate

P0 expects these repository fixtures:

- `benchmarks/ATTRIBUTE-AML_ASIM-1835_managed_stage_enriched_stage.json`
- `benchmarks/Sjson.json`
- `benchmarks/1885Sjson/EnrichedSjson`

The exact repository paths for these roles must be accepted before P0 completion:

- 20-object topology-edit fixture;
- portable 4,884-entity/current equivalent large model;
- real 1885 support/branch fixture.

Bind each role with repeated `--fixture-role ROLE=repository/path` arguments. The runner validates the role vocabulary, rejects duplicate bindings, rejects absolute/upward-traversing paths, automatically includes bound paths in the executed fixture set, and records the exact SHA-256 and normalized identity. A missing path or unclear authority is `MISSING_AUTHORITY`, not an invitation to generate a synthetic replacement.

## Required exact-head execution

```bash
npm ci
node --test tests/non-fea-p0-route-map.test.mjs
node scripts/run-non-fea-current-main-baseline.mjs \
  --warm-samples 5 \
  --fixture-role TOPOLOGY_EDIT_20_OBJECT=<accepted-repository-path> \
  --fixture-role LARGE_MODEL_4884_ENTITY=<accepted-repository-path> \
  --fixture-role REAL_1885_SUPPORT_BRANCH=<accepted-repository-path> \
  --run-commands \
  --fail-on-gate
```

Run the browser navigation proof with a working system browser and retain the raw Playwright output, browser/channel, worker count, fixture identity, performance marks, long-task entries, one-canvas count, and page errors.

## Acceptance gate

P0 is accepted only when:

- exact head and clean/dirty status are recorded;
- every required fixture role is bound to an exact path and SHA-256;
- stage/command/browser evidence is present;
- all failures are classified exactly once;
- the ownership matrix is accepted;
- no P0-authored production file changed;
- the Owner explicitly accepts the baseline and authorizes subsequent production Work Packs.
