# P0 Current-Main Non-FEA Audit

## Status

**IMPLEMENTATION READY — EXACT-HEAD OWNER EXECUTION REQUIRED**

This audit is the P0 read-only execution record for the programme defined by [`docs/Nonfeaplan.md`](./Nonfeaplan.md). It does not authorize P1–P7 production edits and does not claim an executed baseline from the connector environment.

- Original plan-preparation snapshot: `0bad5b4200a8e24a358e76b1ea8372da33485c87`
- Latest synchronized P0 current-main base: `e7eebe4a911050d1cb64d3a57fac33e53752795e`
- Programme branch: `orchestrator/non-fea-workspace-hardening`
- P1 delegated qualification Work Pack: [issue #541](https://github.com/reallaksh19/Advanced_Analysis/issues/541)
- Production files authored by P0: **none**

The P0 branch was synchronized with current `main` after M003 bounds stabilization, M019, and M004–M006 merged. Those incoming production files are merge ancestry, not P0-authored scope. The runner derives the current-main merge base from Git at execution time rather than trusting this narrative SHA.

## Implemented P0 evidence path

```text
repository or explicitly bound content-addressed fixture bytes
  -> governed fixture authority manifest
  -> scripts/run-non-fea-current-main-baseline.mjs
  -> production normalizeWorkspaceDataset
  -> WorkspaceState publication
  -> production support-site model
  -> production route-partition model
  -> model-zone projection
  -> resolved engineering geometry
  -> viewport render model
  -> exact SHA/identity disposition
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
9. M005 pooling/instancing and M006 orientation presentation are current production ancestry and must be measured by P1/P4; merge narratives do not substitute for exact-head browser and identity qualification.
10. Authorized enrichment and empirical execution exist, but the production bypass inventory remains open.
11. `SupportLoadPresenter` enforces qualified LFEA, current empirical OPE, then sealed first-cut priority. Ordinary WebGL support-load callouts remain an open P7 gap.

## Observability gaps retained by P0

The current public normalization boundary does not expose separate timings for source snapshot, source index, entity normalization, hierarchy construction, and shared-model projection. P0 records this as an observability gap; it does not reimplement the production normalizer.

The Node runner cannot produce browser-only timings for Three materialization, GPU scene installation, fit, first meaningful frame, first selection, orbit/pan, or long tasks. These require the exact-head Playwright ledger.

Canonical topology/checker/edit transition proof remains in the registered topology-edit test ladder and must be retained as command evidence. P0 does not reconstruct a second topology path.

## Governed fixture authority

Fixture custody is defined in `scripts/non-fea-baseline/fixture-authority-manifest.mjs`. Repository defaults are executed automatically; a CLI binding overrides a default only for that role. Every bound source is hashed and its production identity is compared field-by-field.

### Repository-owned 20-object topology-edit fixture

- Path: `public/fixtures/topology-edit-20-element-demo.staged.json`
- Expected identity: 20 normalized entities, 15 piping objects, 5 supports
- Authority: production Playwright walkthrough and the fixture's own declared demo identity
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
- Current gate: source bytes are not repository-owned; bind an exact repository-relative cache path with `--fixture-role LARGE_MODEL_4884_ENTITY=<path>`

The runner raises named failures for unbound authority, missing files, unexecuted bindings, absent accepted SHA, SHA mismatch, and production identity mismatch. It never substitutes a generated fixture for these roles.

## Required exact-head execution

```bash
npm ci
node --test tests/non-fea-p0-*.test.mjs
node scripts/run-non-fea-current-main-baseline.mjs \
  --warm-samples 5 \
  --fixture-role LARGE_MODEL_4884_ENTITY=<content-addressed-repository-relative-cache-path> \
  --run-commands \
  --fail-on-gate
```

The 20-object and 1885 repository paths are executed automatically. A CLI override remains available for controlled custody testing but must satisfy the same SHA and identity rules.

Run the browser navigation proof with a working system browser and retain the raw Playwright output, browser/channel, worker count, fixture identity, performance marks, long-task entries, one-canvas count, and page errors.

## Acceptance gate

P0 is accepted only when:

- exact head and clean/dirty status are recorded;
- the 20-object captured SHA is explicitly accepted and frozen;
- the external 4,884 source is bound and verifies its accepted SHA/identity;
- the 1885 source verifies its accepted SHA/identity;
- stage, command, and browser evidence is present;
- all failures are classified exactly once;
- the ownership matrix is accepted;
- no P0-authored production file changed;
- the Owner explicitly accepts the baseline and authorizes subsequent production Work Packs.
