# P1-Q0 Current-Main Performance Qualification

## Disposition

`EVIDENCE_IMPLEMENTATION_READY — P1 QUALIFICATION BLOCKED`

This package is evidence-only. Merging it does not accept P0, qualify a P1
threshold violation, authorize a production fix, or prove current browser
performance.

The runner derives the P1 scope base from the current-main merge base. Failure
to resolve `origin/main` or `main` is a named blocker unless an explicit Git SHA
is supplied and verified as an ancestor. The governed write set is the exact
21-file P1-Q0 package; broad `docs/**`, `scripts/**`, `tests/**`, or `e2e/**`
permission is not granted.

## Required authority before a P1 disposition

P1 can leave `BLOCKED` only when all of the following exist on the same exact
head and execution ID:

1. a valid P0 report with `status: PASS`;
2. a separately stored, content-addressed Owner acceptance record;
3. verified custody of the 4,884-entity fixture and its accepted SHA-256;
4. complete P0 stage statistics for every required import/render stage;
5. exact-head native browser timing and action evidence;
6. one canvas, one WebGL canvas, one live render owner, and zero page errors;
7. no unresolved required-stage observability gaps;
8. a protected before-manifest created through the real production render
   installation path;
9. no source mutation or custody mismatch.

## Corrected evidence boundaries

### Production-installed picking identity

The protected manifest uses `renderThreeModel()` with an isolated backend
lifetime, then inspects the actual production object map and inherited
`resolveThreeEntityId()` results. The evidence code does not assign, repair, or
synthesize pick identities. Generated UUIDs, GPU handles, allocation addresses,
and object references remain excluded.

Manifest validation recomputes the diagnostic, canonical-object, pick-target,
and bounds hashes and verifies their counts. A map/root/node identity mismatch
fails closed.

### Browser timing

Initial import, selection, and orbit/pan start from native capture-phase browser
events and end at the first committed `renderOnce()` completion caused by the
action. Playwright wait duration is not accepted as product latency.

Context restoration uses `WEBGL_lose_context`. It must prove a restored scene
installation and a committed restored frame. Synthetic context events are not
accepted.

### Invalidation evidence

The browser run records initial import, selection-only, orbit/pan, model-zone,
calculated-load, master-data, Project Data, clear/reload, and context-restoration
actions. Every non-skipped production publication must complete with `PASS`.
Project Data, model-zone changes, clear/reload, and context restoration must show
the expected rebuild/install/render path.

The current coarse public seams do not independently expose support-site,
route, model-zone, resolved-geometry, render-model, Three-materialization, and
scene-installation boundaries. The browser ledger therefore records named
observability gaps unless exact production measures are present. Any remaining
gap keeps P1 `BLOCKED`; zero is never substituted for “unobserved.”

### Render ownership

The observer seeds its live-owner set from mounted WebGL canvases and follows
`startAnimation()`, `stopAnimation()`, and `destroy()` for the exact P1 browser
run. The evaluator uses this current-head evidence, not historical P0 ownership.

## Required exact-head execution

```bash
node --test \
  tests/p1-q0-browser-run-validator.test.mjs \
  tests/p1-q0-invalidation-recorder.test.mjs \
  tests/p1-q0-protected-manifest.test.mjs \
  tests/p1-q0-report-validator.test.mjs \
  tests/p1-q0-runner-support.test.mjs
```

```bash
P1_EXECUTION_ID=<execution-id> \
P1_EXACT_HEAD_SHA=$(git rev-parse HEAD) \
P1_FIXTURE_ROLE=LARGE_MODEL_4884_ENTITY \
P1_FIXTURE_PATH=<repository-relative-content-addressed-path> \
P1_SOURCE_SHA256=88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6 \
P1_BROWSER_EVIDENCE_OUTPUT=reports/p1-browser-evidence.json \
npx playwright test e2e/p1-current-main-performance.spec.js
```

```bash
node scripts/p1/run-p1-current-main-qualification.mjs \
  --execution-id <execution-id> \
  --p0-report reports/non-fea-current-main-baseline.json \
  --p0-acceptance reports/non-fea-p0-owner-acceptance.json \
  --fixture-role LARGE_MODEL_4884_ENTITY \
  --fixture <repository-relative-content-addressed-path> \
  --browser-evidence reports/p1-browser-evidence.json \
  --manifest-output reports/p1-protected-manifest-before.json \
  --output reports/p1-current-main-qualification.json \
  --fail-on-gate
```

Run the applicable P0 ladder, production build, clean-tree checks, and M005
supplementary Topology Edit evidence on the same exact head.

## Outcomes

- `BLOCKED`: authority, custody, stage observability, execution, identity, or
  threshold evidence is incomplete or invalid.
- `NO_THRESHOLD_VIOLATION`: complete evidence exists and no frozen threshold is
  violated; production coding must stop.
- `QUALIFIED_FOR_FIX`: complete evidence exists and at least one frozen
  threshold is reproducibly violated; only the measured bounded fix may proceed
  to a separate Owner-reviewed PR.
