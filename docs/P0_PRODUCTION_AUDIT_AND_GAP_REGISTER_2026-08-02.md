# P0 — Production-Path Audit and Mechanics Gap Register

Audit date: 2026-08-02
Repository: `reallaksh19/Advanced_Analysis`
Audited head: `7c49c20` (branch `main`, identical to `claude/lfea-linear-static-fea-unfwjd` at takeover)
Scope: LFEA Linear Static FEA closure mandate, Section 19 P0

This document is a gap register, not a release attestation. It records what was
directly verified by execution or by reading source, cites file:line evidence
for every claim, and explicitly separates "real and working" from "real but
unreachable" from "does not exist." Nothing here is inferred from governance
status, commit messages, or prior closure documents.

## 1. A benchmark discrepancy found and resolved before any implementation

The task brief that opened this work stated the governing input
(`reallaksh19/3D_Converters@05ed229`, path `Benchmarks/1885Sjson/EnrichedSjson`)
was 148,627 bytes, SHA-256
`77e64a27d185afc8dbedde41f43383c63650c62a2ae75face5eac1356f5d07d3`, and
represented 12 nodes / 10 pipes / 9 components / 0 loads / 0 supports.

That does not match any file in the source repository. A fresh clone of
`reallaksh19/3D_Converters` at the exact stated commit and path was pulled and
inspected directly:

```
$ git -C /workspace/3d_converters log --oneline -1
05ed229 fix(xml-cii): default zero-information ATTA restraints to +Y (#406)
$ wc -c "Benchmarks/1885Sjson/EnrichedSjson"
1785455 Benchmarks/1885Sjson/EnrichedSjson
$ sha256sum "Benchmarks/1885Sjson/EnrichedSjson"
e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da
```

The source repository's own generator manifest
(`Benchmarks/1885Sjson/fixture-manifest.json`, produced 2026-07-15 by
`tools/generate-1885-stagedjson-fixtures.mjs`) independently records the same
1,785,455-byte / `e9a51723...` identity. No file anywhere in that repository
matches 148,627 bytes, the disputed SHA, or `projectId: 1885` as a literal
field (checked by exhaustive byte-size and content grep across the full tree).
The real file represents 279 source objects across 13 branch groups, including
139 real `SUPPORT` records — not 12 nodes and 0 supports.

An independent read-only audit agent, working in parallel and without
knowledge of this finding, computed a different hash for a different, related
file (`benchmarks/Sjson.json` in this repository, the pre-enrichment 733,806
byte source) and separately confirmed the disputed SHA appears nowhere in this
repository either. Two independent computations agree the brief's numbers are
wrong.

The repository owner confirmed directly: the larger, real file is correct
("has all the support (Rest/guide/line stop), process parameters, etc") and
the disputed figures should be disregarded. **This report and all work in this
increment use the verified real file. The mandate's Section 4/18 numeric
acceptance criteria, which were built on the disputed figures, do not apply as
written and need to be re-issued against the real data — see §7.**

This is recorded prominently because the source mandate's own Section 20
forbids exactly the failure mode of proceeding on numbers that don't
correspond to real data. Silently "making it work" against the stated 12/10/9
figures would have meant fabricating conformance to a fixture that does not
exist.

## 2. The repository contains four non-interoperating FEA code bases

| Stack | Directories | Status |
|---|---|---|
| A — dead legacy | `src/calc-extended`, `src/piperack`, `src/sketcher` | **Does not exist.** Referenced only by orphaned root-level files (`run_benchmarks.test.js`, `run_3d_benchmarks.test.js`, `run_bm3_benchmarks.test.js`, `run_bm3_si_benchmarks.test.js`, `test-elbow*.js`, `test-clip.js`, `test-inline.js`). None of these are wired into any npm script; `find src -iname "*.test.*"` under `src/core` returns essentially nothing matching them. `ARCHITECTURE_TRUTH.md:20-32` explicitly forbids recreating these paths. |
| B — "FEA estate" (local continuum/shell) | `src/core/element-fea`, `local-continuum`, `local-shell`, `local-stress`, `local-attachment-screening`, `local-trunnion-footprint`, `vertical-beam-solver` | Real kernel math, UI-wired. The project's own internal review (`FEA_UI_UPGRADE_PLAN.md`) documents specific presentation-layer defects — see §4. |
| C — "LFEA piping B-stack" (3D frame-element system solver) | `src/core/linear-fea-solver`, `linear-fea-frame-element`, `linear-fea-model-compiler`, `linear-fea-result-recovery`, `linear-piping-analysis-consumer`, `centerline-beam-fea` | Real, closed-form-verified (see §3). **Not reachable from the browser UI** — only from Node check scripts. |
| D — "LAFEA next-gen" (sparse solver + T6/Q8/MITC mesher) | `src/core/lafea-linear-solve`, `src/core/lafea-meshing` | Real sparse Cholesky/LDLᵀ and a real mesher. The solver has **zero production callers** anywhere in the tree outside its own check scripts. |

This fragmentation, not any single missing feature, is the dominant reason the
mandate's completion criteria are unmet: the pieces the mandate asks for
mostly exist somewhere in this repository, but not in the same pipeline.

## 3. What is real and closed-form-verified (executed directly, not asserted)

`src/core/linear-fea-frame-element/frame-element-stiffness.js` implements a
full 12×12 3D Timoshenko frame element: axial `EA/L`, Saint-Venant torsion
`GJ/L` on a declared polar moment (lines 87-90), two independent bending
planes with shear-flexibility parameter `phi = 12EI/(GκAL²)` (`shearFlexibility()`,
lines 43-61) that degenerates exactly to Euler-Bernoulli at `phi = 0`, rigid
end-offset kinematics (`frameOffsetMatrix`, lines 222-239), and static
condensation of end releases via Gauss-Jordan with partial pivoting
(`condenseEndConditions` / `invertWithPivotBoundary`, lines 271-387) that fails
closed on a singular release set rather than silently regularizing.

These were run directly, not read and trusted:

```
$ node scripts/lfea-b3.1-frame-element-check.mjs
FRAME-AXIAL-01, FRAME-TORSION-01, FRAME-BEND-YZ-01, FRAME-SHEAR-01,
end-release condensation, rigid-offset moment-arm consistency ... PASS (16/16)

$ node scripts/lfea-b3.3-solver-check.mjs
FRAME-3D-01: assertClose(uy, (1500 * L**3) / (3*E*IZ), 1e-8, ...) ... PASS (17/17)

$ node scripts/lfea-b3.4-recovery-check.mjs
Closed-form UDL shear/moment stations vs hand calculation ... PASS (18/18)
```

`scripts/lfea-b3.1-frame-element-check.mjs:166-181` and
`scripts/lfea-b3.3-solver-check.mjs:140-141` literally compute
`(force * LENGTH ** 3) / (3 * E * IZ)` — cantilever `PL³/3EI` — and compare to
1e-8 relative tolerance. This is real, correct engineering verification, and
it is invisible from `npm test` (see §5).

The mesher for this stack, `src/core/centerline-beam-fea/node-seeding.js`, is
also real: `seedRequiredAttachmentPoints()` (lines 44-87) splits segments at
support/restraint/load-extraction points; `seedIntermediateNodes()`
(lines 143-166) subdivides spans and discretizes bends by arc length with a
declared chord-error tolerance.

## 4. What is real but disconnected, dense where it must be sparse, or blocked

### 4.1 The production piping solver is dense, and says so itself

`src/core/linear-fea-solver/linear-algebra.js:1-8`:

```js
/**
 * Dense direct linear algebra for the DENSE_DIRECT_CHOLESKY_LDLT_V1 backend
 * (see `solver-contract.js` module doc for why this is named honestly rather
 * than as a production sparse solver). ...
 */
```

`assembly.js:108-112` (`denseFromTriplets`) explicitly materializes a full
`n×n` array from the sparse COO triplets it just built, discarding sparsity.
`solve.js:309-311` (`requireSolverExecution`) rejects any execution record
whose backend is not `DENSE_DIRECT_BACKEND_ID`. This is the solver backing
`linear-piping-analysis-consumer` — the one real, tested, orchestrated piping
solve chain in the repository (Stack C) is architecturally dense by design.

Mandate Section 12.2: "A dense solver is unacceptable as the general
production implementation." This is a direct, currently-unmet requirement.

The fix is not a from-scratch implementation: `src/core/lafea-linear-solve/`
(Stack D) already contains a real sparse Cholesky (`sparse-cholesky.js:16-46`,
`Map`-based sparse row storage, fails closed on a non-positive pivot) and a
real sparse LDLᵀ with diagonal pivoting (`sparse-ldlt.js:23-61`), both
unit-tested (`npm run check:lafea-solver`) and both self-disclosed as not yet
having fill-reducing reordering. It has no caller outside its own check
scripts. Wiring it into Stack C's production path, alongside the equivalence
proof against the existing closed-form fixtures, is the highest-leverage
single fix available and is scoped as the next Work Pack (§7).

### 4.2 The real 1885 project's own qualification script treats "blocked before the solver" as its passing condition

`scripts/1885s-empirical-qualification.mjs` (`npm run check:1885s-empirical`)
is a real, substantial script against the real (pre-enrichment) 1885 dataset —
it normalizes 279 nodes, builds a support-site model (139 support records → 38
assemblies → 37 physical sites), a route-partition model (13 routes, 127
edges), and exercises a real inline-component-replacement command with
undo/redo. Then, at lines 136-158:

```js
const loadAudit = validateProjectDataProfile(profile, 'loads', activeHashes);
assert.equal(loadAudit.valid, false);
const distribution = calculateSupportLoadDistribution({ ... });
assert.equal(distribution.status, 'BLOCKED');
...
assert.equal(loadCase.equilibrium.status, 'NOT_RUN_PROJECT_DATA_BLOCKED');
```

The script's own rendered evidence (`reports/qualification/1885s-webgl-load-benchmark.md`)
states this outcome as the qualification result: *"Status: BLOCKED — no
numeric reactions published."* There is no call anywhere reachable from this
script into `compileMechanicalModel`, the frame-element solver, or result
recovery. For the one real named project in this repository, the production
route never reaches a solve. Stack C's solver chain is real and does reach a
solve, but only against synthetic 2-6 node fixtures (`scripts/linear-piping-*-check.mjs`),
never this project's data — confirmed by `grep` finding zero callers of
`compileLinearPipingSourceAnalysisContext` outside its own siblings and check
scripts.

### 4.3 No browser UI triggers a solve

`src/workspace/linear-piping-results-workbench.js:6,81` calls
`requireLinearPipingQualifiedApplicationResult` — a pure validator/renderer of
an already-produced result package. It never calls `compileMechanicalModel` or
the solver. There is no "Run Analysis" control wired to Stack C. Stack B (the
continuum/shell workbench) does have a real Three.js viewport
(23 files under `src/workspace` constructing actual `THREE.Scene` objects,
confirmed not mocked), but its own internal review documents specific,
uncorrected S1-severity defects:

- `FEA_UI_UPGRADE_PLAN.md:138-166` (finding D-01): the UI recomputes von Mises
  stress client-side with a plane-stress formula that ignores the solver's own
  recovered σz, an 11% discrepancy against the signed evidence bundle for T3
  elements specifically.
- `FEA_UI_UPGRADE_PLAN.md:170-188` (D-02): stress views plot on ×10-magnified
  deformed geometry with no on-screen indication, while the legend claims
  "authoritative raw stress."
- `FEA_UI_UPGRADE_PLAN.md:297-306` (D-09): the LAFEA workbench presents raw
  JSON as its result view for five kernels — no tables, units, or
  visualization — directly against the project's own `rules.md` §1.
- `FEA_UI_UPGRADE_PLAN.md:310-314` (D-10): convergence-study machinery exists
  and is unit-tested, but the pipeline hardcodes `convergenceStudy: null`; by
  the reviewer's own words every peak stress shown is "not an engineering
  result."

None of these are re-verified line-by-line in this pass; they are cited from
the repository's own dated internal review and flagged as still open because
no PR closing them was found in the git log searched.

## 5. Test topology: real, rigorous, and excluded from `npm test`

`package.json`'s `"test"` script (`check:advanced-shell && check:lafea-workbench
&& check:lfea-workbench && check:lfea-svg && check:sequential-sketcher`) does
**not** include `check:lfea-b3.1`, `check:lfea-b3.3`, `check:lfea-b3.4`,
`check:lafea-solver`, `check:lafea-meshing`, or `check:core-fea` — the closed-form
verified kernels from §3. Those are only reachable via the much larger `npm run
gate` (30+ chained sub-scripts). No test framework (`jest`/`vitest`/`mocha`) is
installed; every `*-check.mjs` is a free-standing script with its own
`assert`-based harness — unconventional, but the ones executed for this audit
were real, not schema-shape checks.

Filename-keyword sampling across the 565-file `scripts/` directory found
engineering-content-keyword filenames (`solver`, `stiffness`, `beam`, `shell`,
`convergence`, ...) outnumbered roughly 4:1 by governance/process-keyword
filenames (`governance`, `phase6`, `wp[0-9]`, `anti-drift`, `reviewer`,
`source-guard`, `takeover`, ...) — directional, not exact, since many
genuinely numerical scripts (like the b3.1/b3.3/b3.4 checks above) don't carry
an obvious keyword. `FEA/LFEA`, `FEA/LAFEA-B`, `FEA/LAFEA-NON B` contain only
`.zip`/`.docx`/`.md` "takeover package" artifacts — no source code, confirmed
by absence of any `import`/`require` reference to `FEA/` anywhere in `src/` or
`scripts/`.

## 6. Two smaller, concrete correctness gaps found while building Benchmark A (this increment)

Both are documented, neither is fixed in this increment — fixing them touches
shared consumer code with a wide blast radius and was judged out of scope for
a bounded first vertical slice. Real, computed evidence for both is retained
in `reports/qualification/benchmark-a-1885-enriched-sjson.json`
(`scripts/benchmark-a-1885-enriched-sjson-check.mjs`).

**Object classification is coarser than the mandate requires.**
`src/workspace/dataset-adapter.js:118` buckets every entity into exactly three
categories: `support` (source type `SUPPORT`), `component` (source type
`BRANCH` — a topological grouping construct, not a mechanical component), and
`pipe` (everything else: `PIPE`, `ELBO`, `OLET`, `FLAN`, `GASK`, `VALV`,
`INST`, `REDU`, `TEE` — nine mechanically distinct object families collapsed
into one bucket). Against the real 1885 fixture this yields
`{pipes: 127, supports: 139, components: 13}` — "components: 13" is exactly
the BRANCH count, not a count of valves/flanges/instruments/fittings. Mandate
Section 4.1 requires real object classification and Section 8.3 requires each
piping-component family to get its own declared idealization; this coarse
bucket cannot support that today. The check script added in this increment
reports the real per-source-type breakdown (`BRANCH: 13, ELBO: 14, PIPE: 43,
OLET: 10, SUPPORT: 139, FLAN: 22, GASK: 22, VALV: 4, INST: 5, REDU: 4, TEE: 3`)
alongside the coarse bucket, rather than only the coarse bucket, so the gap is
visible instead of silently accepted.

**Duplicate source IDs are silently rerouted, not reported.**
`src/workspace/dataset-adapter.js:123-127`:

```js
function internalEntityId(node, sourceIdIndex) {
  const sourceId = stringValue(node.sourceEntityId);
  const occurrences = sourceId ? sourceIdIndex[sourceId]?.length || 0 : 0;
  return sourceId && occurrences === 1 ? sourceId : `entity:${node.sourceNodeKey}`;
}
```

If a source `sourceEntityId` collides, the adapter transparently substitutes a
synthetic ID rather than surfacing a diagnostic — `assertUniqueEntityIds`
(lines 152-158) then never fires because the substitution already made every
ID unique. Mandate Section 4.1 requires duplicate IDs to be a precisely
reported condition, not silently absorbed. The real 1885 fixture happens to
have zero collisions (verified independently in the new check script by
reading `sourceModel.indexes.bySourceEntityId` directly), so this gap is
latent for this specific fixture, not demonstrated as a live failure — flagged
for a dedicated fix rather than patched blind under time pressure, since
`internalEntityId` is shared by every consumer of `normalizeWorkspaceDataset`.

## 7. What this increment delivered vs. what remains

Delivered, real, and verified by execution (not asserted):

- The real, immutable Benchmark A source (`benchmarks/1885Sjson/EnrichedSjson`,
  1,785,455 bytes, SHA-256 `e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da`,
  matching the source repository exactly) is committed to this repository
  unmodified.
- `scripts/benchmark-a-1885-enriched-sjson-check.mjs` (`npm run
  check:benchmark-a-1885-enriched`) ingests it through the existing production
  `normalizeWorkspaceDataset` path (no new, competing parser), asserts the
  real computed topology (279 objects / 13 branch groups / the per-type
  breakdown above), asserts real duplicate-ID and unresolved-diagnostic
  accounting read verbatim from the source file's own CII2019 enrichment
  diagnostics (208 `BLOCKED`/`MISSING_ATTRIBUTE` entries across 83 of 279
  objects, spanning 8 branch/sub-branch groups — not the disputed brief's "3
  unresolved"), and proves canonical-model identity is repeatable across two
  independent ingestions of the same bytes (FNV-1a semantic hash, via the
  existing `shared-piping-model/canonical-json.js`, not a new hashing
  scheme).
- Retained evidence: `reports/qualification/benchmark-a-1885-enriched-sjson.{json,md}`.

This satisfies a bounded slice of mandate Section 4.1 (byte/SHA identity,
schema interpretation via the existing production parser, per-type object
classification, precise unresolved-condition reporting, repeatable canonical
identity) against the *real* fixture. It does **not** attempt topology
reconstruction beyond what the existing adapter already provides, does not
attempt connectivity/reference resolution across the 66-reference graph the
disputed brief described (that count was never verified against the real file
and is not asserted here), and is not a full implementation of every Section
4.1 bullet.

Not delivered, and not claimed:

- Benchmark B (the governed analysis-authority overlay: materials, sections,
  supports, load cases — Section 4.1) does not exist. The real fixture already
  carries usable raw material for it (real pipe OD/wall-thickness/density per
  element, real support records with type codes such as `REST`/`LS-*`/`PG-*`/`SH-*`
  suggesting rest/line-stop/guide/shoe classifications, though `lineNo`,
  `pipingClass`, `designPressure`, and `designTemperatureC` are null for 83
  objects) but no overlay schema or authority record has been built.
- The dense-solver violation (§4.1) is unfixed; the sparse backend exists but
  is not wired to Stack C.
- No mesh generation, load assembly, solve, or stress recovery was run against
  the real 1885 project in this increment — Benchmark A is source ingestion
  only, per its own mandate-defined scope.
- The professional analysis/results UI (Sections 15-16) was not touched.
- No closed-form-benchmark-suite expansion, mesh-convergence study, or
  independent/commercial solver comparison (Section 17) was performed in this
  increment.
- Sections 9-14 (meshing stations for the real topology, load engine,
  constraint processing, matrix assembly/solver swap, result/stress recovery,
  extrema/envelopes) remain entirely as described in §4 above: real component
  pieces exist in Stack C/D, none are connected to the real project data.

## 8. Mandate Section 22 disposition for this increment

```
ENGINEERING IMPLEMENTATION COMPLETE: false
BENCHMARK QUALIFICATION COMPLETE:    false  (Benchmark A source-ingestion slice only; Benchmark B does not exist)
INDEPENDENT COMPARISON COMPLETE:     false
PROFESSIONAL UI COMPLETE:            false
GOVERNANCE/RELEASE STATUS:           BLOCKED (unchanged from docs/CONSOLIDATED_LFEA_PIPING_AUDIT_2026-07-31.md;
                                      this increment adds verified Benchmark A evidence, does not change the disposition)
COMMERCIAL-GRADE PARITY CLAIMED:     false — no comparison has been attempted
```

## 9. Recommended next Work Pack

Replace the dense backend in `src/core/linear-fea-solver` with the existing,
already-tested sparse Cholesky/LDLᵀ in `src/core/lafea-linear-solve`, proving
numerical equivalence against the existing closed-form fixtures
(`scripts/lfea-b3.3-solver-check.mjs` and siblings) to a tight, pre-declared
tolerance, and exposing the matrix/conditioning diagnostics Section 12.3
requires. This is the highest-value fix available that (a) closes a named,
explicit mandate violation, (b) reuses code that already exists and already
passes its own tests rather than writing a new solver, and (c) does not
require first resolving Benchmark B, the UI, or the multi-stack architectural
fragmentation.
