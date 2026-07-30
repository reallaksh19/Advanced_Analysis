# FEA Benchmark Suite + UI Upgrade — delivery package

Repository `reallaksh19/Advanced_Analysis`, baseline commit `ac9f689b86d58362626d69f8905131e6d809b2df`.

Everything in this package was executed against the real repository code. No number below
is estimated, and none was fitted after the fact.

---

## 1. Result

```
BEFORE   14 / 21 cases passed     67 checks, 17 failed
AFTER    21 / 21 cases passed     71 checks,  0 failed
         7 repairs · 0 regressions
```

| Case | Before | After |
|---|---|---|
| `BM-P1-DISPLAYED-VON-MISES` | FAIL | PASS |
| `BM-P2-GEOMETRY-STATE` | FAIL | PASS |
| `BM-P3-FIELD-METADATA` | FAIL | PASS |
| `BM-P4-QUANTITY-DISAMBIGUATION` | FAIL | PASS |
| `BM-T3-TOLERANCE-COUPLING` | FAIL | PASS |
| `BM-T5-CAPACITY-ENVELOPE` | FAIL | PASS |
| `BM-T5-HASH` | FAIL | PASS |
| all 14 others | PASS | PASS (unchanged) |

Measured deltas:

| Quantity | Before | After |
|---|---|---|
| Displayed von Mises error, plane-strain T3 | **+26.2 %** (250.354 shown vs 198.385 exported) | **0** (bit-identical) |
| Semantic hash throughput | 15.8 MB/s | **266 MB/s** (17.1x, bit-identical output) |
| Pipeline wall clock, 196 Q4 / 450 DOF | 5 362 ms | **2 454 ms** |
| Effective element capacity vs advertised | ~700 vs 10 000 declared | 2 000 declared, 2 133 effective |
| Preflight export-size prediction error | no preflight | **< 1 %** |

---

## 2. How to benchmark an FEA module

Five tiers, because different claims need different evidence. **Every tolerance is declared
in the case before it runs** — never fitted to an observed result.

| Tier | Proves | Reference | Cases |
|---|---|---|---|
| **T1 CLOSED_FORM** | element correctness | exact analytical answer | 8 |
| **T2 CONVERGENCE** | behaviour where no single-mesh answer exists | refinement sequence vs theory | 1 |
| **T3 INVARIANT** | physical / architectural laws | none needed | 5 |
| **T4 PRESENTATION** | screen equals evidence bundle | the kernel's own published values | 4 |
| **T5 PERFORMANCE** | usability and honest declarations | budgets declared in advance | 3 |

**T1** — five constant-strain patch tests (regular and distorted Q4 and T3, plane stress and
plane strain), uniaxial tension, plane-strain sigma_z recovery, and a Lame thick-cylinder
refinement study. The patch test is the one that matters most: an element that fails it
cannot converge at all.

**T2** — end-loaded cantilever at four mesh densities against Timoshenko beam theory.

**T3** — rigid-body translation, dense-vs-sparse backend equivalence, determinism of semantic
hashes, Jacobi-PCG iteration scaling, and solver-profile tolerance coupling.

**T4** — the displayed field must be `Object.is`-identical to a value in the result object.
A tolerance-based assertion would let a re-implementation through; bit-identity cannot be
satisfied by anything except selection.

**T5** — hash correctness against a permanently retained BigInt reference (fixed vectors plus
500 seeded pseudo-random inputs), pipeline latency budget, and capacity-envelope consistency
with preflight accuracy.

### Running it

```bash
npm run bench:fea                # full suite -> reports/fea-benchmark-current.{json,md}
npm run bench:fea:gate           # non-zero exit on any failure (CI)
node scripts/run-fea-benchmarks.mjs --label after --compare before
node scripts/run-fea-benchmarks.mjs --tier T1_CLOSED_FORM
node scripts/run-fea-benchmarks.mjs --case BM-T1-LAME-REFINEMENT
```

Reports carry a semantic hash. Two identical runs produce the same hash; timings are excluded
from it because they are environment-dependent.

### In the UI

A **Run Benchmark** button is wired into both FEA workbenches:

- LFEA workbench toolbar — `[data-role="lfea-benchmark"]` (all 21 cases)
- LAFEA workbench toolbar — `[data-role="lafea-benchmark"]` (17 kernel cases; the four
  LFEA-workbench presentation cases are excluded as they do not apply to that surface)

The panel runs the suite live against the same code paths the workbench uses, yielding to the
event loop between cases so the tab stays responsive. It renders a pass/fail matrix with
computed-vs-reference numbers, units, tolerances and each case's declared reference source,
and offers a deterministic JSON download.

---

## 3. What the BEFORE run proved

**The kernels are sound.** All five patch tests pass at machine precision (max relative error
4.52e-13). Lame converges at observed order 1.0026 — exactly first order, confirming the
dominant error is the faceted approximation of the circular boundary by straight Q4 edges,
not the displacement interpolation. Rigid-body motion produces zero stress. Dense LDLt and
sparse Jacobi-PCG agree to 1e-8 relative.

**Two findings that were not in the original review:**

1. **Q4 shear locking is severe.** The 4x1 cantilever gives **28.8 %** of the correct tip
   deflection — a 3.5x over-stiffness. It recovers to 61.6 % / 86.7 % / 96.7 % at 8x2, 16x4
   and 32x8. The kernel warns only about plane-strain volumetric locking; in-plane shear
   locking, the more likely trap in piping local models, is not warned about at all.

2. **The sparse solver profile admits an unsatisfiable configuration.** The PCG residual
   target (`absoluteResidualTolerance`, `relativeResidualTolerance`) and the solver's own
   acceptance gate (`tolerances.residualForce*`) are independent fields of `lfea-profile/v2`
   with no coupling check. A profile can be written in which no solve can ever qualify, and
   the resulting `FREE_RESIDUAL_FAILURE` gave the user no indication their profile was the
   cause.

**The presentation layer was where the discipline broke down.** The kernel labels a number
`AUTHORITATIVE_RAW_...`; the view then recomputed it with a different formula, plotted it on
silently magnified geometry, with a colour ramp carrying no numbers and no units.

---

## 4. Changes made

### New modules

| Path | Purpose |
|---|---|
| `src/core/fea-benchmarks/builders.js` | deterministic model and mesh-package builders |
| `src/core/fea-benchmarks/cases-kernel.js` | T1/T2/T3 verification cases |
| `src/core/fea-benchmarks/cases-presentation.js` | T4 presentation-fidelity cases |
| `src/core/fea-benchmarks/cases-performance.js` | T5 budget cases + retained BigInt hash reference |
| `src/core/fea-benchmarks/runner.js` | deterministic runner and report comparison |
| `src/core/fea-benchmarks/index.js` | public API |
| `src/workspace/lfea-field-adapter.js` | **UI-1** single authority for field selection |
| `src/workspace/lfea-plot-descriptor.js` | **UI-2** geometry state, legend ticks, locked perceptual ramp |
| `src/workspace/lfea-preflight.js` | **UI-4** O(N+E) cost and capacity prediction |
| `src/workspace/fea-benchmark-panel.js` | Run Benchmark surface for both workbenches |
| `scripts/run-fea-benchmarks.mjs` | CLI with `--label`, `--compare`, `--tier`, `--case`, `--gate` |

### Modified (full unified diff in `MODIFIED_FILES.patch`)

| Path | Change |
|---|---|
| `src/core/shared-piping-model/canonical-json.js` | FNV-1a-64 as two uint32 halves; **bit-identical**, 17.1x faster |
| `src/core/element-fea/solver.js` | reject unsatisfiable tolerance configurations with `UNSATISFIABLE_SOLVER_PROFILE_TOLERANCES` before any iteration |
| `src/workspace/lfea-workbench-model.js` | `vonMises()` / `rawStressValues()` / `stressValues()` **deleted**; delegates to the adapter. Deformation is now an explicit orthogonal option with no default scale |
| `src/workspace/lfea-workbench-svg.js` | numeric colour bar with 5 ticks and unit, geometry-state badge, per-element tooltips, locked perceptual ramp |
| `src/workspace/lfea-workbench-pipeline.js` | preflight attached to every execution; capacity aligned with what the chain delivers (2 000 elements, 64 MB export cap) |
| `src/workspace/lfea-workbench-{view,controller,styles}.js` | Run Benchmark button, benchmark card, preflight banner |
| `src/workspace/lafea-workbench-{view,controller,styles}.js` | Run Benchmark button and benchmark card |
| `package.json` | four `bench:fea*` scripts |

### Not changed

No element formulation, no constitutive matrix, no assembly, no integration scheme, no
qualification gate was weakened. The only core edits are the hash (proven bit-identical) and
one added fail-closed rejection path.

---

## 5. Regression evidence

| Check | Result |
|---|---|
| `lfea-003` … `lfea-006` kernel checks | PASS |
| `lafea.1` … `lafea.5` contract checks | PASS |
| `check:workspace-contracts` | PASS |
| `check:lfea-workbench`, `check:lafea-workbench` | PASS |
| `check:imports` | PASS |
| `npm test` | PASS |
| jsdom smoke test, both workbenches | button present, suite runs, matrix renders |

`lfea-001` and `lfea-002` fail on the **untouched baseline** as well — they `git fetch` a
commit SHA that is not present in a squashed clone. Not a regression.

---

## 6. Package contents

```
README.md                                  this file
MODIFIED_FILES.patch                       unified diff of all modified files
src/core/fea-benchmarks/                   benchmark suite (6 files)
src/workspace/                             4 new modules + 8 modified
scripts/run-fea-benchmarks.mjs             CLI
package.json                               with bench:fea* scripts
reports/fea-benchmark-before.{json,md}     baseline
reports/fea-benchmark-after.{json,md}      after the fixes
reports/fea-benchmark-comparison-*.{json,md}
FEA_UI_UPGRADE_PLAN.md                     the original nine-wave plan
```

### Installing into the repository

The `src/`, `scripts/` and `package.json` paths mirror the repository layout, so the package
can be overlaid directly onto a checkout of `ac9f689`. Alternatively apply
`MODIFIED_FILES.patch` for the edits and copy the new files.

New runtime dependencies: **none**. The repository still has exactly one (`three`).
`jsdom` was used only for the smoke test and is not saved to `package.json`.

---

## 7. Nine-wave completion

The repository completion pass now implements **UI-0 through UI-8**. The original seed
delivery described above is retained for benchmark provenance; it has been superseded by
the repository implementation and its executable `npm run gate`.

| Wave | Completion |
|---|---|
| UI-0 | architecture truth, doc drift, UI invariant and cross-kernel gates |
| UI-1–UI-3 | authoritative fields, explicit plots/units and bit-identical hash acceleration |
| UI-4 | staged module Worker with progress, terminating cancel and fail-closed preflight |
| UI-5 | persistent shells, bounded pagination and non-destructive node previews |
| UI-6 | retained mesh-quality visualization and capacity-safe execution exits |
| UI-7 | kernel-owned convergence interpretation and review/export propagation |
| UI-8 | five stage presenters, shell visualization and keyboard/live-region accessibility |

See `reports/fea-ui-upgrade-completion.md` in the repository for the measured completion
matrix. `[SIMULATED]/ANALYTICAL` fixtures are explicitly labelled; no fixture result is
presented as field data.
