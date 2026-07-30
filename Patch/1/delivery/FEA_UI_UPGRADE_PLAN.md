# Advanced_Analysis — FEA Module Review and UI Upgrade Implementation Plan

**Reviewer role:** Piping / mechanical engineer (stress), reading the code as an analyst who would have to sign a calculation produced by it.

**Baseline pinned for this review**

```text
repo   : reallaksh19/Advanced_Analysis
branch : main
commit : ac9f689b86d58362626d69f8905131e6d809b2df   (2026-07-25)
runtime: vanilla ES modules + Vite 7, three@0.170 (NO React, NO Zustand — see D-15)
source : 535 files under src/, ~47.3 kLOC
```

Every numeric claim in Part B was produced by executing repository code at this commit. Reproduction scripts are in Appendix A. Do not accept any of these numbers second-hand — re-run them.

---

# PART A — Walkthrough of the FEA estate

## A.1 Map of what actually exists

There are **seven** distinct numerical kernels. They are independent — they do not share an element library, a solver, or a result contract.

| Module | LOC | Physics | Element / method | Solver |
|---|---:|---|---|---|
| `src/core/element-fea` | 4054 | 2D linear elastic continuum (plane stress / plane strain) | T3 CST, Q4 bilinear @ 2×2 Gauss | Dense LDLᵀ **or** sparse CSR + Jacobi-PCG |
| `src/core/local-continuum` | 1377 | 2D continuum (LAFEA.3) | separate T3 kernel | dense |
| `src/core/local-shell` | 2270 | 2.5D thin shell (LAFEA.4) | CST membrane + DKT bending, 5 DOF/node | dense |
| `src/core/local-stress` | 1125 | Pressure + load transfer baseline (LAFEA.1) | Lamé thick-cylinder, resultant transfer | closed form |
| `src/core/local-attachment-screening` | 533 | Section-level screening (LAFEA.2) | beam theory σ = F/A + M·c/I, τ = Mx·r/J | closed form |
| `src/core/local-trunnion-footprint` | 1131 | Trunnion footprint distribution (LAFEA.5) | footprint pressure distribution + shell adoption | closed form + shell |
| `src/core/vertical-beam-solver` | 1318 | Support beams | 1D flexural beam elements | dense |

Two DOM workbenches drive them:

* **LFEA Workbench** (`src/workspace/lfea-workbench-*.js`) → `element-fea` only.
* **LAFEA Workbench** (`src/workspace/lafea-workbench-*.js`) → `local-stress`, `local-attachment-screening`, `local-continuum`, `local-shell`, `local-trunnion-footprint` as staged documents.

## A.2 `element-fea` — the real FEA kernel

### A.2.1 Formulation — what is correct

I checked the mathematics line by line. It is textbook-correct, and unusually disciplined:

**Constitutive** (`constitutive.js`) — plane stress `E/(1-ν²)`, plane strain `E/((1+ν)(1-2ν))`, both with `G = E/2(1+ν)` in the third row. σ_z recovered as `ν(σx+σy)` for plane strain and folded into von Mises as a genuine 3D invariant. Correct.

**T3** (`t3-element.js`, `t3-geometry.js`) — constant-strain triangle, `K = Bᵀ D B · A · t`. Signed area enforced positive (CCW), zero/negative rejected. Correct.

**Q4** (`q4-element.js`, `q4-geometry.js`) — bilinear shape functions, Jacobian, `B` built from global derivatives, 2×2 Gauss with unit weights. Jacobian determinant is checked at all 4 Gauss points *and* all 4 corners, and strict convexity is enforced via the cross-product turn test. Correct, and the corner check is stricter than most commercial pre-processors.

**Edge loads** — T3 lumps 50/50 over the edge (exact for constant traction on a linear edge); Q4 integrates with 2-point Gauss and the shape functions (the consistent load vector). Pressure sign convention is explicit and consistent: `t = −p·n̂`, positive pressure compressive, acting against the outward normal of the CCW edge.

**Constraints** (`assembly.js`, `solver.js`) — partition/elimination, `K_ff u_f = F_f − K_fc u_c`. Reactions are recovered from the **unmodified** assembled system:

```text
imbalance = K_original · u − F_original
reaction  = constrained components of imbalance
```

No penalty springs, no row zeroing, no diagonal clamping. This is the correct way and it is rarer than it should be.

**Verification gates** (`solver.js::qualificationFailure`) — before a result is allowed to be `QUALIFIED` it must pass:

* free-DOF residual ‖·‖∞ ≤ `residualForceAbsolute + residualForceRelative·‖F‖∞`
* whole-system residual ‖·‖∞ ≤ same
* ΣFx, ΣFy, ΣMz within absolute tolerances (moment about global origin)
* strain energy finite, non-negative, and `|½uᵀKu − Σ elementEnergy| ≤ energyAbsolute`

Anything else → `QUARANTINED_NUMERICAL` or `REJECTED_SINGULAR`. **This is genuinely better than what most commercial front-ends expose to a user.** Keep it. Do not weaken it.

### A.2.2 Formulation — the engineering limits a piping engineer must respect

These are properties of the chosen elements, not bugs. But the UI never states them, so the user does not learn them.

1. **T3 is a constant-strain triangle.** One stress value for the whole element, no bending capability, over-stiff. Energy converges O(h); local stress converges far slower. **A peak stress at a nozzle junction taken from a T3 mesh is meaningless without a convergence study.** The UI presents that single value as `AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS`, which is true as a provenance label and dangerously reassuring as an engineering label.

2. **Q4 at full 2×2 integration shear-locks in bending.** Parasitic shear strain makes a coarse Q4 mesh in bending far too stiff — displacements can be low by an order of magnitude for a 1–2 element-through-thickness mesh. There is **no** incompatible-modes (Q6/QM6), **no** B-bar, **no** selective reduced integration, **no** hourglass control. The code emits a locking warning **only** for plane-strain volumetric locking near ν→0.5 (`solver.js::lockingDiagnostics`). *In-plane shear locking is not warned about at all.* For piping local models — a trunnion pad in bending, a saddle horn — this is the more likely trap.

3. **No axisymmetric element.** For pressure + axial in a pipe wall, the physically correct 2D idealization is axisymmetric, not plane stress / plane strain. The estate handles pressure separately in `local-stress` via Lamé, which is correct, but there is no path to combine pressure and a local attachment load in one continuum model.

4. **No thermal / initial-strain load.** `analysisDefinition.loadCase` accepts exactly `pointForces`, `boundaryTractions`, `boundaryPressures`. There is no body force and no ΔT. **Thermal expansion is the dominant load case in piping flexibility work, and this FEA kernel cannot apply it.** This is the single largest scope limit and it is not stated in the UI.

5. **No WRC 107 / 297 / 537, no EN 13445 Annex G, no ASME VIII-2 Part 5 comparison path.** `local-stress` explicitly declares `BASE_LIMITATIONS = [NO_LOCAL_ATTACHMENT_STRESS, NO_FEA, NO_SHELL_BENDING, NO_WELD_STRESS, NO_CONTACT, NO_CODE_COMPLIANCE]`. Honest. But it means a user has no benchmark to sanity-check the FEA against.

6. **Jacobi-PCG only.** Iteration count for 2D elasticity scales ≈ √κ with κ ~ O(h⁻²), i.e. iterations ~ O(√N). Diagonal preconditioning does not change that asymptotic. Large or badly-scaled meshes will hit `MAXIMUM_ITERATIONS_EXHAUSTED`. Fail-closed handling is correct, but there is no ILU/AMG and no iteration-history plot in the UI.

7. **Mesh-topology validation is O(E²).** `assertNoImproperEdgeIntersections` is a nested loop over all element edges; `assertNoHangingNodes` is edges × nodes. And it is run **twice per solve** — once in `mesh-package-topology.js` (adapter) and again in `model.js::qualifyContinuumModel` (called by the solver). At 900 elements that is ~6.5M segment-intersection tests plus ~3.5M point-on-segment tests, twice. See D-04. The repo already contains `src/core/piping-topology/spatial-hash.js` — reuse it, do not write a new one.

### A.2.3 What is built but never reachable from the UI

These core APIs are exported from `element-fea/index.js` and **never called** by either workbench:

| API | What it gives an engineer | UI status |
|---|---|---|
| `createConvergenceStudy`, `interpretConvergenceStudy` | h-refinement levels, observed order, Richardson estimate, `SINGULARITY_SUSPECTED` classification | **unreachable** — pipeline hardcodes `convergenceStudy: null`, `includeConvergenceEvidence: false` |
| `deriveRegionMeshMetrics`, `refinementRatios` | characteristic size, min/max/mean element size, refinement ratio | unreachable |
| `recoverPointProbe`, `verifyProbeMapping` | stress at a named physical point, tracked across refinement levels | unreachable |
| `classifyScalarSequence`, `stressTrendEvidence` | monotone / oscillatory / diverging trend classification | unreachable |
| `qualifyQ4Geometry` evidence | Jacobian determinant ratio, edge-length ratio, max corner cosine, per-element | computed and stored, **never displayed** |

**Engineering consequence:** the workbench can show a peak von Mises to eight decimal places and has no way to tell the user whether that peak is converged, diverging, or sitting on a re-entrant-corner singularity. The machinery to answer that question is already written. It is simply not wired to a button.

## A.3 The LAFEA family

**LAFEA.1 `local-stress`** — load-transfer resultants and Lamé pressure stress. Level declared `LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY`. Force/moment conservation residuals retained. Sound and honestly scoped.

**LAFEA.2 `local-attachment-screening`** — beam-theory wall stresses at parametric (r, θ) locations: `σx = Fx/A + My·z/Iy − Mz·y/Iz`, `τxθ = Mx·r/J`. Sign convention is written into the result string. This is a **screening** calculation on the run pipe as a beam. It does **not** give local shell stress at the attachment — which is the number a piping engineer actually needs. Correctly labelled; easily misread by a user who only sees the number.

**LAFEA.3 `local-continuum`** — a second 2D continuum kernel, separate from `element-fea`. Duplication risk: two independent implementations of plane elasticity that could drift apart. There is no cross-kernel benchmark comparing them on a shared problem. **Add one** (see UI-0 anti-drift).

**LAFEA.4 `local-shell`** — CST membrane + DKT plate bending, 5 DOF/node (`UX UY UZ R1 R2`), rotations about declared nodal tangent bases. Explicitly: no drilling DOF, no drilling penalty, no transverse shear stiffness, no shear-correction factor, no thick-shell claim. Nodal bases are qualified (`|d|=|b1|=|b2|=1`, mutually orthogonal, `b1×b2=d`) without silent re-normalization. This is a careful, thin-shell-only, small-model kernel. **DKT is a discrete-Kirchhoff element: it is thin-shell only.** For a pad-reinforced trunnion where t/R is not small, or where transverse shear matters, it is out of range — and nothing in the UI computes or displays t/R to tell the user.

**LAFEA.5 `local-trunnion-footprint`** — footprint distribution, shell adoption, assessment. Depends on LAFEA.4, inherits its thin-shell range limit.

## A.4 Engineer's verdict on the estate

**Strong:** conventions are declared and enforced rather than assumed; fail-closed everywhere; reactions from the original system; equilibrium and energy gates before qualification; semantic hashing of every artifact so evidence cannot be silently swapped; deterministic canonical ordering.

**Weak:** element library is the 1970s minimum (CST + fully-integrated Q4) with no locking remedy; no thermal load; no axisymmetric option; no code-comparison path; convergence machinery unreachable; two duplicate continuum kernels with no cross-check.

**Dangerous — and this is where the UI work belongs:** the presentation layer is where the discipline of the kernels breaks down. The kernel is meticulous about labelling a number `AUTHORITATIVE_RAW_...`, and then the view layer **recomputes that number with a different formula**, plots it on a **silently deformed** geometry, with a **colour ramp that has no numbers and no units**. Every guarantee the kernel earns is spent by the view.

---

# PART B — Verified defect register

Severity: **S1** = wrong engineering number reaches the user. **S2** = correct number, misleading presentation. **S3** = usability / performance / maintainability.

---

### D-01 · S1 · The UI displays a von Mises stress that disagrees with the solver

`src/workspace/lfea-workbench-model.js` re-derives von Mises from `[σx, σy, τxy]` with the plane-**stress** formula, ignoring the recovered σz that the solver already computed and already published in `result.vonMisesStress`:

```js
// lfea-workbench-model.js — CURRENT
function vonMises(values) {
  const [sx, sy, txy] = values ?? [];
  return Math.sqrt(sx ** 2 - sx * sy + sy ** 2 + 3 * txy ** 2);   // σz ≡ 0 assumed
}
function rawStressValues(result) {
  const values = {};
  for (const row of result?.elementStresses ?? []) values[row.elementId] = vonMises(row.values);
  ...
}
```

`result.elementStresses[i]` carries `sigmaZ`. It is discarded. `result.vonMisesStress[i].value` — the authoritative figure that goes into the CSV export — is never read.

**Measured**, T3 plate, `PLANE_STRAIN`, ν = 0.25:

```text
elementStresses[0].values = [2, 1.11e-16, 0]   sigmaZ = 0.5
solver  vonMisesStress    = 1.8027756377319946      ← exported to CSV / evidence bundle
UI      colour + table    = 2.0                     ← what the engineer sees
error                     = +10.94 %
```

The screen and the signed evidence bundle disagree by 11 % on the same element, on the same run. The Q4 path happens to read `vonMisesStress` and is correct — so the discrepancy **appears and disappears depending on element type**, which is the worst possible failure mode.

---

### D-02 · S1 · Stress modes silently plot the deformed shape at ×10

```js
// lfea-workbench-model.js
const scale = execution?.review?.geometryReview?.deformationScale ?? 10;
const deformed = mode === 'MODEL' ? { x: node.x, y: node.y }
                                  : { x: node.x + scale * row.UX, y: node.y + scale * row.UY };
```

`mode !== 'MODEL'` includes `RAW_STRESS` and `PROJECTED_STRESS`. So in stress mode the mesh is drawn on ×10-magnified deformed coordinates, while the legend reads `RAW STRESS — AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS` with no mention of deformation.

**Measured**, same T3 case, `RAW_STRESS` mode:

```text
N2  source (2.000, 0.000)   plotted (2.375, 0.000)
N3  source (0.000, 1.000)   plotted (0.000, 0.9375)
```

Anyone scaling a dimension off that plot is 18.75 % out. The scale factor is a hardcoded literal, not user-visible, not user-adjustable.

---

### D-03 · S2 · Mode switch changes the physical quantity; the legend does not

`RAW_STRESS` colours by **element von Mises**. `PROJECTED_STRESS` colours by **the arithmetic mean over element nodes of the projected σx component**:

```js
const byNode = new Map(rows.filter((r) => r.stressComponent === 'SX').map((r) => [r.nodeId, r.weightedValue]));
```

Different tensor quantity, different sign domain (von Mises ≥ 0; σx signed), same blue→red ramp, no numeric ticks, no units, no min/max labels. `colorScale()` re-normalizes min→max on every render, so **the same colour means a different stress after any edit**.

Also: `rawStressValues` reduces a Q4's four Gauss-point values to `Math.max(...)` and paints a flat polygon. That element-level max is not a labelled quantity in the review contract and is not stated anywhere in the UI.

---

### D-04 · S3 · 22-second synchronous main-thread freeze at 900 elements — and only 10 % of it is the solve

`store.run()` → `executeLfeaWorkbench()` runs the entire chain synchronously on the UI thread. No worker, no progress, no cancel.

**Measured**, uniform Q4 grids, plane stress, sparse PCG backend:

| mesh | nodes | elements | DOF | wall clock | outcome |
|---|---:|---:|---:|---:|---|
| 10×10 | 121 | 100 | 242 | **2.96 s** | QUALIFIED |
| 20×20 | 441 | 400 | 882 | **9.78 s** | QUALIFIED |
| 30×30 | 961 | 900 | 1 922 | **22.42 s** | FAILED @ EXPORT |
| 40×40 | 1 681 | 1 600 | 3 362 | **50.57 s** | FAILED @ EXPORT |

Stage breakdown for the 30×30 case:

```text
normalize + validate        30 ms
adaptMeshPackage         2 554 ms     ← O(E²) topology check, run #1
solveContinuumModel      2 292 ms     ← the actual FEA        (10.2 %)
createStressProjection     778 ms
createReviewInput        3 218 ms     ← semantic hashing
createEngineeringReview  6 616 ms     ← semantic hashing
createEvidenceExport     4 797 ms     ← semantic hashing + CSV
                        ─────────
                        22 424 ms
```

**Roughly 90 % of the freeze is evidence bookkeeping the engineer did not ask for yet.** 1 922 DOF is a trivially small FEA problem; a competent kernel solves it in single-digit milliseconds.

---

### D-05 · S3 · The hash function is BigInt-per-byte; an 18.7× bit-identical speedup is available

```js
// canonical-json.js — CURRENT
export function hashBytes(bytes) {
  let hash = FNV_OFFSET;                                    // BigInt
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & UINT64_MASK;
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}
```

One `BigInt()` allocation, one BigInt xor, one BigInt 64-bit multiply and one BigInt mask **per byte**, plus iterator-protocol overhead on a `Uint8Array`. This function is the hot path in `createReviewInput`, `createEngineeringReview` and `createEvidenceExport`.

**Measured**, 20 MB payload:

```text
BigInt implementation   1 265 ms
uint32-pair equivalent      68 ms
speedup                   18.7×
bit-identical on all probe vectors (empty, ASCII, 1 kB, UTF-8 multibyte)
```

---

### D-06 · S3 · Every drag and every table click rebuilds the entire DOM and re-seals the whole package

`LfeaWorkbenchView.render()` ends with `this.rootElement.replaceChildren(section)` — full teardown. It is subscribed to every store publish. And `moveNode` → `updateRecord` → `replaceCollection` → `replaceDocument` → `resealLfeaMeshPackage` (structuredClone + canonical re-order + full-package `semanticHash`) → publish → full re-render.

**Measured reseal cost per single node drag:** 12 ms @ 100 elements, 31 ms @ 400, **94 ms @ 900**, **120 ms @ 1600** — before the DOM rebuild.

Consequences: caret position and scroll position in the JSON textarea are destroyed on every keystroke-adjacent state change; focus is lost; the 50-deep undo history stores 50 full package clones; and `committedState` sets `execution: null`, so **one accidental 1 px drag silently discards a 22-second solve.**

Row selection is worse — `recordTable`'s click handler calls `this.render(state)` directly, so clicking a table row also nukes and rebuilds the whole workbench.

---

### D-07 · S2 · Result tables truncate at 200 rows with no indication

```js
const values = rows.slice(0, 200);      // lfea-workbench-view.js::resultTable
const keys = [...new Set(values.flatMap(Object.keys))].slice(0, 8);
```

No "showing 200 of N", no pagination, no sort, no filter. A 961-node model has 1 922 displacement rows; the engineer sees 200 of them and is told nothing. The columns are also truncated to the first 8 keys **discovered from the first 200 rows**, so a field present only later in the array disappears entirely.

---

### D-08 · S2 · The declared capacity envelope is internally inconsistent by an order of magnitude

`createLfeaWorkbenchAdapterProfile()` advertises `maximumNodes: 10000`, `maximumElements: 10000`. `LFEA-007_APPLICATION_CONSUMER.md` advertises 20 000 nodes / 10 000 elements. But `createLfeaWorkbenchReviewProfile()` sets `maximumExportBytes: 20000000`, and:

```text
30×30 grid (900 elements)  → export byte length 28 645 557 > 20 000 000  → REJECTED
40×40 grid (1 600 elements)→ export byte length 50 802 205 > 20 000 000  → REJECTED
```

The **effective** ceiling is ~600–700 elements, roughly 6 % of the advertised one — and the user discovers it after burning 22–50 seconds, at the last stage of the chain, having already paid for the solve.

---

### D-09 · S1-adjacent · The LAFEA workbench dumps raw JSON as its result presentation

```js
// lafea-workbench-view.js::evidence
wrapper.append(warning, jsonBlock(this.rootElement, execution.result, 'lafea-result'));
```

That is the entire result presentation for `local-stress`, `local-attachment-screening`, `local-continuum`, `local-shell` and `local-trunnion-footprint`. No tables, no units, no governing-value callout, **no visualization of any kind** — the LAFEA SVG panel is geometry-preview only, with no stress, no deformed shape, no result field.

This directly violates the repository's own mandate in `rules.md` §1: *"No Raw JSON in UI: All mathematical outputs shown to the user must be formatted cleanly."* A shell FEA whose only output is a `<pre>` block cannot be reviewed, and cannot be used to sign anything.

---

### D-10 · S1-adjacent · No convergence UI ⇒ every peak stress shown is unqualified

Covered in A.2.3. `createConvergenceStudy`, `interpretConvergenceStudy`, `recoverPointProbe`, `refinementRatios`, `stressTrendEvidence` all exist, are tested by `scripts/lfea-00*-check.mjs`, and are unreachable from the application. The pipeline hardcodes `convergenceStudy: null`.

Peak stress from a CST or a fully-integrated Q4 mesh **without** a convergence study is not an engineering result. Presenting it in a `AUTHORITATIVE_` -labelled panel is the most consequential presentation defect in the repository.

---

### D-11 · S2 · Mesh quality is computed and thrown away

`qualifyQ4Geometry()` returns `minimumJacobianDeterminant`, `maximumJacobianDeterminant`, `jacobianDeterminantRatio`, `edgeLengths`, `edgeLengthRatio`, `maximumCornerCosine` per element. It flows into `result.elementQualityEvidence`. Nothing renders it. The engineer cannot see which element is a 40:1 sliver driving the peak stress.

---

### D-12 · S2 · No units anywhere in the UI

`solverProfile.units = { length, force, stress }` and `mesh-package.unitsIdentity = 'MM_N_MPA_V1'`. Neither is rendered. Tables show bare numbers. Colour ramps show no scale at all. Mixed-unit misreading in piping work is a classic error source.

---

### D-13 · S3 · Accessibility and interaction hygiene

* Interactive, drag-editable SVG carries `role="img"` — announced as a static image; node handles are not keyboard reachable in the LFEA view (LAFEA sets `tabIndex` on markers, LFEA does not).
* `<tr tabIndex=0>` with a `click` handler only — no `keydown` for Enter/Space, no `role="row"`/`aria-selected`.
* Diagnostics `<pre>` has no `aria-live`; a rejection is announced to nobody.
* `<input type="file">` has no `<label>` and no accessible name.
* No numeric coordinate entry — node position can *only* be set by dragging, so exact geometry is not achievable.
* `downloadJson()` revokes the object URL in a `queueMicrotask`, which can race the download start in some browsers.

---

### D-14 · S3 · Error attribution is wrong

`addRecordText` / `updateRecordText` catch a JSON parse error and route it to `this.store.importDocument(invalidImport(error))`. A malformed record edit is therefore reported to the user as an **import** rejection. Diagnostics point at the wrong action.

---

### D-15 · S1 (for agents) · The governing documents describe an architecture that does not exist

| Document says | Repository at `ac9f689` |
|---|---|
| `rules.md` §1: state in `src/calc-extended/store/useExtendedStore.js`, solver in `src/calc-extended/solver/ExtendedSolver.js` | `src/calc-extended/` **does not exist** |
| `rules.md` §1: "Screen 2: full-screen R3F Canvas" | no React, no react-three-fiber; `find src -name '*.jsx'` → **0** |
| `CORE_SPECIFICATION.md`: "React/Vite-based" | `package.json` dependencies: `{ "three": "^0.170.0" }` only; `grep -c react package.json` → **0** |
| `AUDIT_CURRENT_BASELINE.md`: `src/settings/SettingsTab.jsx`, `src/store/appStore.js`, `useExtendedStore`, `SketcherStore` | none exist |
| `AUDIT_CURRENT_BASELINE.md`: repository is `reallaksh19/Simplified_Analysis` | repository is `Advanced_Analysis` |
| `AUDIT_CURRENT_BASELINE.md` gate: `npm run check:full`, `npm run check:qa`, `npm run ci:u0` | **none of these scripts exist** in `package.json` |
| `Tasks.md`: `GC3DCanvas.jsx`, `TopNav.jsx`, `src/config/version.js` | none exist |

**This is the number-one drift hazard in the project.** A junior agent told to "follow rules.md" will create `src/calc-extended/store/useExtendedStore.js`, install React, and fork the architecture. Fixing this is UI-0 and it gates everything else.

---

# PART C — Implementation plan

## C.0 How to use this plan

**Rules for every agent working any wave below.**

1. **One wave per branch, one wave per PR.** Branch name `ui-<N>-<slug>`. Never combine waves.
2. **Read-before-write.** Before editing a file, run `git log --oneline -5 -- <file>` and read the whole file. No partial-context edits.
3. **No new dependencies.** The repo has exactly one runtime dependency (`three`). Adding React, D3, a charting library, or a virtual-list library is an automatic PR rejection. Everything below is achievable with the DOM.
4. **No physics changes.** These are **UI/presentation and performance** waves. If your diff touches `src/core/element-fea/{constitutive,t3-element,q4-element,q4-geometry,t3-geometry,assembly,solver,linear-backend,sparse-pcg}.js` in a way that changes a numeric output, stop and escalate. The only permitted core edit in this plan is D-05 (hash implementation), which must be **bit-identical**.
5. **Evidence, not assertion.** "It looks right" is not a completion criterion. Every wave has a numeric or property-based test.
6. **Every wave ends by running the full gate** (C.1) plus its own tests.

## C.1 The gate

Establish this command in `package.json` in UI-0 and run it at the end of **every** wave:

```json
"scripts": {
  "check:core-fea": "node scripts/lfea-001-check.mjs && node scripts/lfea-002-check.mjs && node scripts/lfea-003-check.mjs && node scripts/lfea-004-check.mjs && node scripts/lfea-005-check.mjs && node scripts/lfea-006-check.mjs",
  "check:lafea-core": "node scripts/lafea.1-contract-check.mjs && node scripts/lafea.2-contract-check.mjs && node scripts/lafea.3-contract-check.mjs && node scripts/lafea.4-contract-check.mjs && node scripts/lafea.5-contract-check.mjs",
  "check:ui-invariants": "node scripts/ui-invariant-check.mjs",
  "gate": "npm run syntax:strict && npm run check:imports && npm run check:core-fea && npm run check:lafea-core && npm run check:workspace-contracts && npm run check:lafea-workbench && npm run check:lfea-workbench && npm run check:ui-invariants && npm run build"
}
```

`scripts/ui-invariant-check.mjs` is created in UI-0 and grows one section per wave. It is the anti-drift spine of this plan.

## C.2 Wave sequence and dependency

```text
UI-0  Baseline truth + anti-drift harness          ── gates everything
  ├─ UI-1  Authoritative field-value adapter       (S1, D-01/D-03)
  ├─ UI-2  Geometry-state + legend + units         (S1/S2, D-02/D-03/D-12)
  └─ UI-3  Hash performance (bit-identical)        (S3, D-05)
        └─ UI-4  Staged pipeline + worker          (S3, D-04/D-08)   ← needs UI-3
              └─ UI-5  Incremental render + tables (S3, D-06/D-07)   ← needs UI-4
                    ├─ UI-6  Preflight + quality   (S2, D-08/D-11)
                    ├─ UI-7  Convergence workbench (S1-adj, D-10)    ← needs UI-4,UI-5
                    └─ UI-8  LAFEA results + a11y  (S1-adj, D-09/D-13/D-14)
```

---

## UI-0 — Baseline truth and the anti-drift harness

**Fixes:** D-15. **Gates:** everything.
**Estimated:** 1 agent-day. **Risk if skipped:** the entire plan is built on a false architecture description.

### Reasoning

An agent's most reliable source of "what should I build" is the repository's own documentation. Right now that documentation describes a React/Zustand application with a `src/calc-extended` module, none of which exists. Every subsequent wave inherits that lie unless it is corrected first. This wave produces one authoritative document, deletes/marks the stale ones, and installs a machine check that fails the build if the docs drift again.

### Files

| Action | Path |
|---|---|
| CREATE | `ARCHITECTURE_TRUTH.md` |
| CREATE | `scripts/ui-invariant-check.mjs` |
| CREATE | `scripts/doc-drift-check.mjs` |
| EDIT | `rules.md`, `CORE_SPECIFICATION.md`, `AUDIT_CURRENT_BASELINE.md`, `Tasks.md` — prepend a `> **SUPERSEDED**` banner, do **not** delete (they are historical record) |
| EDIT | `package.json` — add `gate`, `check:ui-invariants`, `check:doc-drift` |

### Code

`ARCHITECTURE_TRUTH.md` must state, minimally:

```markdown
# Architecture Truth — supersedes rules.md, CORE_SPECIFICATION.md, AUDIT_CURRENT_BASELINE.md, Tasks.md
Verified at commit ac9f689b86d58362626d69f8905131e6d809b2df.

## Runtime
Vanilla ES modules. Vite 7. Exactly one runtime dependency: three@^0.170.0.
There is NO React, NO react-three-fiber, NO Zustand, NO JSX. `find src -name '*.jsx'` returns 0.

## Composition
main.js -> workspace/bootstrap.js -> renderWorkspaceLayout + ApplicationShellController
Pattern per feature: <feature>-store.js (immutable state + listeners)
                     <feature>-controller.js (wiring, IO, styles)
                     <feature>-view.js (DOM)
                     <feature>-model.js (pure derivations)
Cross-feature messaging: workspace/event-bus.js only.

## Modules that DO NOT EXIST (do not create them)
src/calc-extended/**, src/store/**, src/settings/**, src/gc3d/**, src/3d-analysis/**,
src/simp-analysis/**, src/components/**, src/config/**, any *.jsx

## FEA kernels (see FEA_UI_UPGRADE_PLAN.md Part A)
src/core/element-fea, local-continuum, local-shell, local-stress,
local-attachment-screening, local-trunnion-footprint, vertical-beam-solver
```

`scripts/doc-drift-check.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// 1. Forbidden paths must not exist.
const FORBIDDEN = ['src/calc-extended', 'src/store', 'src/settings', 'src/gc3d',
                   'src/3d-analysis', 'src/simp-analysis', 'src/components', 'src/config'];
for (const rel of FORBIDDEN) {
  assert.equal(fs.existsSync(path.join(ROOT, rel)), false,
    `Forbidden legacy path was recreated: ${rel}. See ARCHITECTURE_TRUTH.md.`);
}

// 2. No JSX, no React.
const jsx = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.jsx') || f.endsWith('.tsx'));
assert.deepEqual(jsx, [], `JSX is not permitted in this repository: ${jsx.join(', ')}`);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  assert.equal(/^react(-|$)|^zustand$|^@react-three\//.test(dep), false,
    `Forbidden dependency added: ${dep}`);
}

// 3. Superseded docs must carry the banner (so nobody follows them by accident).
for (const doc of ['rules.md', 'CORE_SPECIFICATION.md', 'AUDIT_CURRENT_BASELINE.md', 'Tasks.md']) {
  const text = fs.readFileSync(path.join(ROOT, doc), 'utf8');
  assert.ok(text.startsWith('> **SUPERSEDED'),
    `${doc} must begin with the SUPERSEDED banner pointing at ARCHITECTURE_TRUTH.md.`);
}

// 4. Every script named in package.json must exist.
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  for (const m of cmd.matchAll(/node (scripts\/[\w.\-]+\.mjs)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `Script "${name}" references missing ${m[1]}`);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
console.log('doc-drift-check: OK');
```

`scripts/ui-invariant-check.mjs` — start it as a skeleton with one real section:

```js
import assert from 'node:assert/strict';
// Section 0 — kernel/UI duplication guard.
// The view layer must never re-derive a physical quantity the kernel already published.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const VIEW_LAYER = ['src/workspace/lfea-workbench-model.js','src/workspace/lfea-workbench-view.js',
                    'src/workspace/lfea-workbench-svg.js','src/workspace/lafea-workbench-model.js',
                    'src/workspace/lafea-workbench-view.js','src/workspace/lafea-workbench-svg.js'];
const BANNED = [
  [/Math\.sqrt\s*\([^)]*\*\*\s*2[^)]*-[^)]*\*/, 'inline von Mises / invariant re-derivation'],
  [/\b3\s*\*\s*txy\s*\*\*\s*2/,                 'inline von Mises re-derivation'],
  [/\bE\s*\/\s*\(1\s*-\s*nu/,                   'inline constitutive matrix'],
];
for (const rel of VIEW_LAYER) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const [re, why] of BANNED) {
    assert.equal(re.test(src), false, `${rel}: ${why}. Consume kernel evidence instead.`);
  }
}
console.log('ui-invariant-check section 0: OK');
```

### Cross-kernel benchmark (add here, referenced by A.3)

Add `scripts/cross-kernel-continuum-check.mjs`: solve one identical plane-stress cantilever through **both** `element-fea` and `local-continuum`, assert displacement and stress agree within a declared tolerance. Two independent implementations of the same physics with no cross-check will drift.

### Test requirements

* `npm run check:doc-drift` passes.
* Deliberately create `src/calc-extended/x.js` → check must fail. Delete it → passes.
* Add `"react": "18"` to devDependencies → check must fail. Remove it → passes.
* Remove the banner from `rules.md` → check must fail.
* `npm run gate` green.

### Anti-drift checkpoints

* **AD-0.1** `ARCHITECTURE_TRUTH.md` is referenced from the top of `README`/`docs/DEVELOPER_GUIDE.md`; every wave PR body must quote its own wave ID from this plan.
* **AD-0.2** `doc-drift-check` runs inside `gate`, so drift breaks the build rather than a review.
* **AD-0.3** Superseded docs are banner-marked, never deleted — the historical record survives, but no agent can follow it accidentally.
* **AD-0.4** PR template must include: *"Files I read in full before editing: …"*. An agent that edited a file it did not list is rejected.
* **AD-0.5** Baseline commit `ac9f689` is recorded in `ARCHITECTURE_TRUTH.md`. Any wave whose PR does not state the merge-base is rejected.

### Agent qualification test — UI-0

1. `rules.md` mandates state in `src/calc-extended/store/useExtendedStore.js`. That path does not exist. Explain precisely why **creating** it is the wrong response, what the correct response is, and what mechanism you would add so the next agent cannot make the same mistake without the build failing.
2. `doc-drift-check.mjs` asserts no `.jsx` exists. An agent could satisfy that by writing React in `.js` files with `React.createElement`. Write the additional assertion that closes that hole, and explain why a dependency-name check alone is insufficient.
3. `AUDIT_CURRENT_BASELINE.md` claims `npm run ci:u0` is a passing gate; that script does not exist. Distinguish between (a) a stale doc, (b) a deleted script, and (c) a doc that was aspirational and never true — and describe how you would determine which of the three applies using only this repository.
4. The repo has two independent 2D continuum kernels (`element-fea`, `local-continuum`). Design the cross-kernel benchmark: what single problem, what boundary conditions, what quantities compared, what tolerance, and — critically — what you do when they disagree by 3 %.
5. `git log` shows a single squashed "Initial commit". You are asked to pin a baseline for anti-drift purposes. Explain what guarantees a commit SHA gives you here, what it does *not* give you, and what additional artifact you would generate at UI-0 so that a later agent can prove nothing regressed.

---

## UI-1 — Authoritative field-value adapter

**Fixes:** D-01 (S1), D-03 (partial). **Depends on:** UI-0.
**Estimated:** 1 agent-day. **This is the highest-priority wave. Do it first.**

### Reasoning

The kernel publishes von Mises. The view recomputes it with a different formula and gets a different answer (10.94 % on a plane-strain T3). The fix is not "correct the formula in the view" — that just creates a second place where the formula lives, which will drift again. The fix is **structural**: the view must never compute a physical quantity. It must select one from kernel evidence, and it must carry the provenance of that selection with it.

Introduce a single adapter, `lfea-field-adapter.js`, whose only job is: given a qualified result and a requested field, return `{ byElement, quantityId, unit, sourcePath, reduction, min, max }`. Nothing else in the view layer is allowed to touch stress numbers.

### Files

| Action | Path |
|---|---|
| CREATE | `src/workspace/lfea-field-adapter.js` |
| EDIT | `src/workspace/lfea-workbench-model.js` — delete `vonMises()`, `rawStressValues()`, `stressValues()`; delegate |
| EDIT | `src/workspace/lfea-workbench-svg.js` — consume the descriptor |
| CREATE | `scripts/ui-1-field-adapter-check.mjs` |
| EDIT | `scripts/ui-invariant-check.mjs` — add section 1 |

### Code

```js
// src/workspace/lfea-field-adapter.js
/**
 * Single authority for turning qualified solver evidence into a displayable
 * scalar field. This module NEVER computes a physical quantity — it selects one
 * that the kernel already published, and records where it came from.
 */
export const FIELD_IDS = Object.freeze({
  VON_MISES: 'VON_MISES',
  SX: 'SX', SY: 'SY', TXY: 'TXY', SIGMA_Z: 'SIGMA_Z',
  PRINCIPAL_MAX: 'PRINCIPAL_MAX', PRINCIPAL_MIN: 'PRINCIPAL_MIN',
});

export const REDUCTIONS = Object.freeze({
  T3_CONSTANT: 'T3_CONSTANT_ELEMENT_DOMAIN',
  Q4_MAX_OVER_IP: 'Q4_MAXIMUM_OF_4_GAUSS_POINTS',
  Q4_MIN_OVER_IP: 'Q4_MINIMUM_OF_4_GAUSS_POINTS',
  NONE: 'NONE',
});

/**
 * @param {object} result   qualified fea-continuum-result (v1/v2/v3)
 * @param {string} fieldId  one of FIELD_IDS
 * @param {string} unit     from solverProfile.units.stress — NOT inferred here
 * @param {string} ipReduction  REDUCTIONS.Q4_MAX_OVER_IP | Q4_MIN_OVER_IP
 * @returns {Readonly<{byElement:Record<string,number>,quantityId:string,unit:string,
 *                     sourcePath:string,reduction:string,min:number,max:number,
 *                     elementReductions:Record<string,string>}>}
 */
export function selectElementField(result, fieldId, unit, ipReduction = REDUCTIONS.Q4_MAX_OVER_IP) {
  if (!result) throw new TypeError('lfea-field-adapter requires a qualified result.');
  if (!Object.values(FIELD_IDS).includes(fieldId)) throw new TypeError(`Unsupported field: ${fieldId}.`);
  const byElement = {}; const elementReductions = {};
  const sources = new Set();

  // --- T3 path: consume result.vonMisesStress / result.elementStresses. NEVER recompute. ---
  if (fieldId === FIELD_IDS.VON_MISES) {
    for (const row of result.vonMisesStress ?? []) {
      byElement[row.elementId] = row.value;                       // <- kernel value, includes sigmaZ
      elementReductions[row.elementId] = REDUCTIONS.T3_CONSTANT;
      sources.add('result.vonMisesStress[].value');
    }
  } else {
    for (const row of result.elementStresses ?? []) {
      byElement[row.elementId] = componentFromStressRow(row, fieldId);
      elementReductions[row.elementId] = REDUCTIONS.T3_CONSTANT;
      sources.add('result.elementStresses[]');
    }
    for (const row of result.principalStresses ?? []) {
      if (fieldId === FIELD_IDS.PRINCIPAL_MAX) byElement[row.elementId] = row.values[0];
      if (fieldId === FIELD_IDS.PRINCIPAL_MIN) byElement[row.elementId] = row.values.at(-1);
      if (fieldId === FIELD_IDS.PRINCIPAL_MAX || fieldId === FIELD_IDS.PRINCIPAL_MIN) {
        elementReductions[row.elementId] = REDUCTIONS.T3_CONSTANT;
        sources.add('result.principalStresses[]');
      }
    }
  }

  // --- Q4 path: reduce integration-point evidence with an EXPLICIT, NAMED reduction. ---
  const pick = ipReduction === REDUCTIONS.Q4_MIN_OVER_IP ? Math.min : Math.max;
  const seen = new Set();
  for (const row of result.integrationPointResults ?? []) {
    const value = componentFromIpRow(row, fieldId);
    if (!Number.isFinite(value)) continue;
    byElement[row.elementId] = seen.has(row.elementId) ? pick(byElement[row.elementId], value) : value;
    seen.add(row.elementId);
    elementReductions[row.elementId] = ipReduction;
    sources.add('result.integrationPointResults[]');
  }

  const values = Object.values(byElement).filter(Number.isFinite);
  if (!values.length) throw new TypeError(`No qualified evidence for field ${fieldId}.`);
  return Object.freeze({
    byElement: Object.freeze(byElement),
    elementReductions: Object.freeze(elementReductions),
    quantityId: fieldId,
    unit,
    sourcePath: [...sources].sort().join(' + '),
    reduction: ipReduction,
    min: Math.min(...values),
    max: Math.max(...values),
  });
}

function componentFromStressRow(row, fieldId) {
  const [sx, sy, txy] = row.values ?? [];
  if (fieldId === FIELD_IDS.SX) return sx;
  if (fieldId === FIELD_IDS.SY) return sy;
  if (fieldId === FIELD_IDS.TXY) return txy;
  if (fieldId === FIELD_IDS.SIGMA_Z) return row.sigmaZ;          // published by the kernel
  throw new TypeError(`Field ${fieldId} is not available from elementStresses.`);
}

function componentFromIpRow(row, fieldId) {
  if (fieldId === FIELD_IDS.VON_MISES)     return row.vonMisesStress;   // kernel value
  if (fieldId === FIELD_IDS.SX)            return row.stress?.[0];
  if (fieldId === FIELD_IDS.SY)            return row.stress?.[1];
  if (fieldId === FIELD_IDS.TXY)           return row.stress?.[2];
  if (fieldId === FIELD_IDS.SIGMA_Z)       return row.sigmaZ;
  if (fieldId === FIELD_IDS.PRINCIPAL_MAX) return row.principalStresses?.[0];
  if (fieldId === FIELD_IDS.PRINCIPAL_MIN) return row.principalStresses?.at(-1);
  return undefined;
}
```

Then in `lfea-workbench-model.js`, **delete** `vonMises`, `rawStressValues`, and the SX-averaging branch of `stressValues`, and replace with a call into the adapter. The projected-stress mode must expose a **separate** descriptor with `quantityId: 'PROJECTED_SX'`, `authority: 'NON_AUTHORITATIVE_REVIEW_PROJECTION'`, and its own min/max — it must not share a colour scale with the raw field.

### Test requirements

`scripts/ui-1-field-adapter-check.mjs` must assert, at minimum:

1. **The regression that started this wave.** T3 plate, `PLANE_STRAIN`, ν=0.25: `selectElementField(result, 'VON_MISES', 'MPa').byElement.T1` **exactly equals** `result.vonMisesStress[0].value` (`1.8027756377319946`), and is **not** `2`. Assert exact equality, not a tolerance — the adapter must be a selection, not a computation.
2. **No-recompute property, all fixtures.** For every fixture in `scripts/lfea-00*-fixtures.mjs`, for every element, the adapter's von Mises value appears verbatim in either `result.vonMisesStress[].value` or `result.integrationPointResults[].vonMisesStress`. Use `Object.is` to catch −0 and float drift.
3. **Q4 reduction is explicit.** With `Q4_MAX_OVER_IP` and `Q4_MIN_OVER_IP` the results differ on a non-uniform stress field, and `descriptor.reduction` reports which was used.
4. **Plane-stress/plane-strain divergence.** Run the *same* geometry under both formulations. Assert the adapter's values differ, and that the plane-strain value equals the kernel's 3D-invariant value (proving σz is in play).
5. **Provenance is populated.** `sourcePath` is non-empty and names a real path in the result object.
6. **Fail-closed.** `selectElementField(null, ...)` and `selectElementField(result, 'BOGUS', ...)` both throw. A result with no stress evidence throws rather than returning an empty field.

Add to `scripts/ui-invariant-check.mjs` section 1: no file in `src/workspace/` other than `lfea-field-adapter.js` may contain the identifiers `vonMises`, `sigmaZ`, or `principalStress` in a computational context.

### Anti-drift checkpoints

* **AD-1.1** *Single-authority grep.* `ui-invariant-check` fails if any view-layer file re-derives an invariant. The regex bank from UI-0 section 0 grows here.
* **AD-1.2** *Selection-not-computation proof.* Test #2 asserts the displayed float is bit-identical to a float in the result object. This is stronger than a tolerance and cannot be satisfied by a re-implementation.
* **AD-1.3** *Named reductions.* Every element-level scalar carries a `REDUCTIONS.*` string. An agent adding a new reduction must add a constant, which shows in review.
* **AD-1.4** *Frozen descriptor.* The returned object is `Object.freeze`d; downstream code cannot patch a value in and hide the origin.
* **AD-1.5** *Golden file.* Commit `reports/ui-1-field-golden.json` holding the adapter output for all fixtures. Any change to it must be justified in the PR body. This catches silent numeric drift from unrelated waves.

### Agent qualification test — UI-1

1. For a plane-strain T3 with σ = [2, 0, 0] and ν = 0.25, derive σz, then compute von Mises by hand. Show why the plane-stress expression `√(σx² − σxσy + σy² + 3τ²)` gives 2.0 and the correct 3D invariant gives 1.8028. Which is conservative, and does "conservative" make the plane-stress value acceptable to display? Justify.
2. The adapter reduces a Q4's four Gauss-point von Mises values to a single element value with `Math.max`. Name three distinct ways this can mislead an engineer reading the colour map, and state what the UI must display alongside the colour to neutralise each.
3. Test #2 asserts bit-identity via `Object.is` rather than `Math.abs(a-b) < 1e-12`. Explain what class of defect a tolerance-based assertion would let through here, and give a concrete code change that would pass a tolerance test but fail `Object.is`.
4. `result.vonMisesStress` exists on the T3 (v1) evidence shape but not on the Q4 (v2) shape, which uses `integrationPointResults[].vonMisesStress`; the sparse backend produces v3. Explain how the adapter must behave for a **mixed T3+Q4** model, and what invariant guarantees you have not double-counted or missed an element.
5. Argue the case **against** this wave: someone proposes instead just fixing `vonMises()` in `lfea-workbench-model.js` to include σz — a three-line change versus a new module. Give the strongest version of that argument, then rebut it with a specific failure scenario that the three-line fix permits and the adapter prevents.

---

## UI-2 — Geometry state, legend, and units

**Fixes:** D-02 (S1), D-03 (S2), D-12 (S2). **Depends on:** UI-1.
**Estimated:** 1.5 agent-days.

### Reasoning

Three defects share one root cause: the plot does not say what it is showing. Fix them together as one contract — a **plot descriptor** that is rendered as visible chrome and asserted by tests. If a value is on screen, its quantity, its units, its geometry state and its scale factor are on screen next to it.

Geometry state is the S1 part: `RAW_STRESS` mode currently plots ×10 deformed coordinates while labelling itself as raw stress. Deformation must become an **orthogonal, explicit toggle** with a user-set scale, never implied by the result mode.

### Files

| Action | Path |
|---|---|
| CREATE | `src/workspace/lfea-plot-descriptor.js` |
| EDIT | `lfea-workbench-model.js` — `lfeaDisplayGeometry` takes `{ fieldId, deformation: {enabled, scale}, ipReduction }` |
| EDIT | `lfea-workbench-svg.js` — render colour bar with ticks; render geometry-state badge |
| EDIT | `lfea-workbench-view.js` — deformation toggle + numeric scale input + field selector |
| EDIT | `lfea-workbench-styles.js` |
| CREATE | `scripts/ui-2-plot-descriptor-check.mjs` |
| EDIT | `e2e/lfea-workbench.spec.js` |

### Code

```js
// src/workspace/lfea-plot-descriptor.js
export const GEOMETRY_STATES = Object.freeze({
  UNDEFORMED: 'UNDEFORMED_SOURCE_GEOMETRY',
  DEFORMED:   'SCALED_DEFORMATION_REVIEW_GEOMETRY',
});

/**
 * Everything the renderer needs, and everything the user must be told.
 * Constructing this object is the only legal way to reach the SVG renderer.
 */
export function createPlotDescriptor({ field, geometryState, deformationScale, authority, unitsIdentity }) {
  if (!field) throw new TypeError('Plot descriptor requires a field descriptor.');
  if (!Object.values(GEOMETRY_STATES).includes(geometryState)) throw new TypeError('Unknown geometry state.');
  const deformed = geometryState === GEOMETRY_STATES.DEFORMED;
  if (deformed && !(Number.isFinite(deformationScale) && deformationScale > 0)) {
    throw new TypeError('Deformed geometry requires an explicit positive deformation scale.');
  }
  if (!deformed && deformationScale !== 0) {
    throw new TypeError('Undeformed geometry must declare deformationScale 0.');
  }
  return Object.freeze({
    quantityId: field.quantityId,
    unit: field.unit,
    reduction: field.reduction,
    sourcePath: field.sourcePath,
    min: field.min,
    max: field.max,
    ticks: legendTicks(field.min, field.max, 5),
    geometryState,
    deformationScale,
    authority,
    unitsIdentity,
    // The exact string that MUST appear in the UI beside the plot.
    caption: `${field.quantityId} [${field.unit}] · ${field.reduction} · ` +
             `${deformed ? `deformed ×${deformationScale}` : 'undeformed'} · ${authority}`,
  });
}

function legendTicks(min, max, count) {
  if (!(max > min)) return Object.freeze([min]);
  return Object.freeze(Array.from({ length: count }, (_, i) => min + (i * (max - min)) / (count - 1)));
}
```

Renderer changes, minimum:

* Draw a colour bar with the five numeric ticks and the unit string. **A colour ramp with no numbers is not permitted.**
* Draw the geometry-state badge in the plot corner: `UNDEFORMED` or `DEFORMED ×N`.
* Use a **fixed, perceptually monotone** ramp (a simple viridis-like lookup table of 9 stops, linearly interpolated — no dependency needed). The current `rgb(40+210r, 85, 245−200r)` ramp is not monotone in luminance and is red/blue confusable.
* Rescale-on-edit must be opt-out: add a "lock scale" control so an engineer comparing two runs is not fooled by re-normalization.

Units come from `packageValue.analysisDefinition.solverProfile.units.stress` and `packageValue.unitsIdentity`. **Never hardcode `MPa`.** If the profile does not carry a unit, that is a rejection, not a default.

### Test requirements

1. `createPlotDescriptor` throws when `geometryState = DEFORMED` and scale is 0, negative, NaN, or absent.
2. `createPlotDescriptor` throws when `geometryState = UNDEFORMED` and scale ≠ 0. (Blocks the D-02 regression at the type level.)
3. Node coordinate property test: for `UNDEFORMED`, every plotted node satisfies `Object.is(plotted.x, source.x)` and `Object.is(plotted.y, source.y)` **for all four result modes**. This is the direct D-02 regression test.
4. `descriptor.caption` contains the quantity id, a unit string, the geometry state, and the authority string. Assert by parsing, not by exact match.
5. Legend ticks are monotone increasing, `ticks[0] === min`, `ticks.at(-1) === max`, length 5, all finite.
6. Unit propagation: run a fixture whose `solverProfile.units.stress` is `'psi'`; assert the caption says `psi` and no `MPa` appears anywhere in the rendered DOM.
7. Playwright: switch mode `MODEL → RAW_STRESS`; assert the geometry badge still reads `UNDEFORMED` and node screen positions are unchanged to the pixel. Then enable deformation ×5 and assert the badge changes and positions move.

### Anti-drift checkpoints

* **AD-2.1** *Descriptor is the only door.* `renderLfeaWorkbenchSvg` takes a descriptor and throws if `descriptor.caption` is absent. There is no path to draw a coloured mesh without a caption.
* **AD-2.2** *No unit literals.* `ui-invariant-check` fails on the literals `'MPa'`, `'psi'`, `'ksi'`, `'N/mm2'` anywhere in `src/workspace/`. Units come from the profile only.
* **AD-2.3** *No magic deformation scale.* `ui-invariant-check` fails on `deformationScale ?? ` or `?? 10` in the workspace layer.
* **AD-2.4** *Geometry-state invariant is a property test over all fixtures*, not a single example.
* **AD-2.5** *Screenshot baseline.* Store a Playwright screenshot of the legend for one fixture. A silent ramp/format change becomes a visible diff.

### Agent qualification test — UI-2

1. The current ramp is `rgb(40+210r, 85, 245−200r)`. Explain why this is unsuitable for engineering stress plots on three grounds — luminance monotonicity, colour-vision deficiency, and perceptual uniformity — and state what property a replacement must have so that "which of these two elements is more stressed" is answerable from colour alone.
2. `colorScale()` re-normalizes min→max on every render. Give a specific two-run scenario in a piping local-stress review where this produces a materially wrong engineering conclusion, and specify the exact UI control that prevents it.
3. The descriptor forbids `UNDEFORMED` with a non-zero scale. Show how you would enforce the same invariant at the renderer boundary as well, and explain why enforcing it in **two** places is not redundant here.
4. `unitsIdentity` is `MM_N_MPA_V1` on the package while `solverProfile.units.stress` is a free string. These can disagree. Which is authoritative, how do you detect the disagreement, and — precisely — what does the UI do when they conflict? (Answering "show a warning" is insufficient; state the state transition.)
5. An engineer asks for the deformed plot at "true scale" (×1) to check clearance. On a model whose peak displacement is 1e-4 of the model span, ×1 renders as indistinguishable from undeformed. Describe what you display so the engineer is not misled into thinking the deformation feature is broken, without ever auto-selecting a scale factor on their behalf.

---

## UI-3 — Bit-identical hash acceleration

**Fixes:** D-05. **Depends on:** UI-0. **Blocks:** UI-4.
**Estimated:** 0.5 agent-day. **Highest value-per-line in the plan.**

### Reasoning

`hashBytes` is on the critical path of every evidence artifact and costs ~1 265 ms/20 MB with BigInt. An FNV-1a-64 computed as two 32-bit halves using `Math.imul` is 18.7× faster and produces **the same 64-bit value**, verified. Because the output is identical, every existing semantic hash, every committed golden file, and every stored evidence bundle remains valid. This is the rare optimization with zero contract risk — provided the equality is proven rather than assumed.

Do this **before** UI-4, so the worker refactor is measured against an already-fast baseline and you do not mistake a hashing cost for a threading problem.

### Files

| Action | Path |
|---|---|
| EDIT | `src/core/shared-piping-model/canonical-json.js` — replace `hashBytes` body only |
| CREATE | `scripts/ui-3-hash-equivalence-check.mjs` |

### Code

```js
// src/core/shared-piping-model/canonical-json.js
// FNV-1a 64-bit computed as two uint32 halves. Bit-identical to the previous
// BigInt implementation; see scripts/ui-3-hash-equivalence-check.mjs.
// Multiplier 0x100000001b3 = (PH<<32) | PL with PH = 0x100, PL = 0x1b3.
const FNV_PL = 0x000001b3;
const FNV_PH = 0x00000100;

export function hashBytes(bytes) {
  let hi = 0xcbf29ce4 >>> 0;
  let lo = 0x84222325 >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {      // indexed loop: no iterator protocol
    lo = (lo ^ bytes[i]) >>> 0;
    const l0 = lo & 0xffff;
    const l1 = lo >>> 16;
    const p0 = l0 * FNV_PL;                        // < 2^32, exact in float64
    const p1 = l1 * FNV_PL + (p0 >>> 16);
    const nextLo = (((p1 & 0xffff) << 16) | (p0 & 0xffff)) >>> 0;
    const carry = Math.floor(p1 / 0x10000);
    hi = (Math.imul(hi, FNV_PL) + Math.imul(lo, FNV_PH) + carry) >>> 0;
    lo = nextLo;
  }
  return `fnv1a64:${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`;
}
```

**Do not** change `canonicalizeJson`, `canonicalStringify`, key ordering, negative-zero handling, or the `fnv1a64:` prefix. The only permitted change is the arithmetic inside `hashBytes`.

### Test requirements

`scripts/ui-3-hash-equivalence-check.mjs`:

1. Keep a local copy of the BigInt reference implementation **inside the test file**. Assert byte-for-byte string equality against it for:
   * empty input; single bytes 0x00…0xFF (all 256);
   * 10 000 pseudo-random byte arrays of random length 0–4 096, from a **seeded deterministic PRNG** committed in the test (no `Math.random`, per `CORE_SPECIFICATION`);
   * UTF-8 encodings of: ASCII, Latin-1 accents, CJK, emoji (surrogate pairs), and a string containing a lone `\uFFFD`;
   * every fixture package in `scripts/lfea-00*-fixtures.mjs`, canonically stringified.
2. Assert the returned string always matches `/^fnv1a64:[0-9a-f]{16}$/`.
3. **End-to-end hash stability:** run `executeLfeaWorkbench` on every fixture; assert `result.semanticHash`, `review.semanticHash`, `evidenceExport.semanticHash` equal values committed in `reports/ui-3-hash-golden.json` — generated on the **old** implementation before the change. This is the real proof.
4. Performance floor: hashing 20 MB completes in < 250 ms on CI. Fails loudly if someone reintroduces BigInt.
5. `npm run gate` green — all existing `lfea-00*-check.mjs` determinism checks must pass unchanged. They compare hashes across runs; they will catch any deviation.

### Anti-drift checkpoints

* **AD-3.1** *Reference implementation is committed inside the test.* Equivalence is provable forever, not just at merge time.
* **AD-3.2** *Golden hashes generated on the pre-change code.* Generate `reports/ui-3-hash-golden.json` on the merge-base commit, commit it in the same PR, and state in the PR body which commit produced it.
* **AD-3.3** *Comment carries the derivation.* The multiplier decomposition is written in the source so the next reader does not "simplify" it.
* **AD-3.4** *Performance floor test* prevents a future refactor from silently reverting to BigInt.
* **AD-3.5** *Scope lock.* `ui-invariant-check` asserts `canonical-json.js` still exports exactly `{canonicalizeJson, canonicalStringify, canonicalPrettyStringify, semanticHash, hashUtf8, hashBytes, utf8ByteLength}` — no signature drift smuggled in with the optimization.

### Agent qualification test — UI-3

1. Derive the 32-bit-pair multiplication. Show why `l0 * FNV_PL` and `l1 * FNV_PL` are exactly representable in float64 (state the bit budget), and why `Math.imul` is required for `hi` but not for those two products.
2. `Math.imul(hi, FNV_PL)` discards the overflow above bit 31. Prove that discarding it is correct for a 64-bit FNV-1a — i.e. explain exactly which bits of the true 96-bit product are supposed to be dropped and why.
3. A colleague proposes migrating to SHA-256 via WebCrypto "since we're touching hashing anyway." Give three concrete reasons this would be a serious regression **for this repository specifically**, referencing the committed evidence bundles.
4. Test #1 uses a seeded PRNG rather than `Math.random`. Cite the repository rule that requires this, explain the failure mode of a random-seeded equivalence test in CI, and describe how a flaky failure here would be diagnosed six months later.
5. `hashUtf8` does `new TextEncoder().encode(...)` on every call, allocating a fresh encoder. Estimate whether hoisting it to a module constant is worth doing, state what you would measure to decide, and explain why "it's obviously faster" is not an acceptable justification in this codebase.

---

## UI-4 — Staged pipeline, worker execution, preflight

**Fixes:** D-04, D-08. **Depends on:** UI-3. **Blocks:** UI-5, UI-7.
**Estimated:** 3 agent-days. **Largest wave; split into 4a/4b if the agent is junior.**

### Reasoning

Two independent problems are entangled in `executeLfeaWorkbench`:

* **Wrong granularity.** The engineer wants displacements and stress. The current call gives them nothing until the evidence bundle is serialized and hashed — 90 % of the wall clock. Split into stages the user can stop at.
* **Wrong thread.** Even a well-staged solve of a real model takes seconds. On the main thread that is a frozen tab with no cancel.

Also fix D-08 while here: run a **preflight** that predicts DOF count, nonzero count, and export byte size *before* doing any work, and refuse — or warn — up front rather than after 22 seconds.

**Split the wave:**
* **UI-4a** — stage the pipeline, keep it synchronous, add preflight. Fully testable in Node.
* **UI-4b** — move stages into a Web Worker with progress and cancel.

### Files

| Action | Path |
|---|---|
| CREATE | `src/workspace/lfea-pipeline-stages.js` (pure, no DOM, no worker) |
| CREATE | `src/workspace/lfea-preflight.js` |
| CREATE | `src/workspace/lfea-solver.worker.js` |
| CREATE | `src/workspace/lfea-worker-client.js` |
| EDIT | `lfea-workbench-pipeline.js` → thin façade over stages (keep the export name; existing checks import it) |
| EDIT | `lfea-workbench-store.js` — stage-aware state machine |
| EDIT | `lfea-workbench-view.js` — stage buttons, progress, cancel, preflight panel |
| CREATE | `scripts/ui-4-staging-check.mjs`, `scripts/ui-4-preflight-check.mjs` |

### Code

```js
// src/workspace/lfea-pipeline-stages.js
export const STAGES = Object.freeze(['VALIDATE', 'ADAPT', 'SOLVE', 'PROJECT', 'REVIEW', 'EXPORT']);

/** Stage at which the engineer already has usable numbers. */
export const MINIMUM_USEFUL_STAGE = 'SOLVE';

/**
 * Run stages in order, up to and including `untilStage`, reporting progress.
 * Each stage is a pure function of the accumulated context. A failed stage
 * halts the chain and returns the partial context with its own diagnostics —
 * a later stage is NEVER attempted after a rejection.
 *
 * @param {object}   packageInput
 * @param {object}   options   { untilStage, adapterProfile, reviewProfile,
 *                               includeProjectedStress, onProgress, shouldCancel }
 */
export function runStages(packageInput, options = {}) {
  const untilStage = options.untilStage ?? 'EXPORT';
  const stopIndex = STAGES.indexOf(untilStage);
  if (stopIndex < 0) throw new TypeError(`Unknown stage: ${untilStage}.`);
  const onProgress = options.onProgress ?? (() => {});
  const shouldCancel = options.shouldCancel ?? (() => false);

  const context = { packageValue: null, adapterResult: null, model: null, result: null,
                    stressProjection: null, reviewInput: null, review: null, evidenceExport: null };
  const timings = {};

  for (let i = 0; i <= stopIndex; i += 1) {
    const stage = STAGES[i];
    if (shouldCancel()) return terminal(context, timings, 'CANCELLED', stage, []);
    onProgress({ stage, index: i, total: stopIndex + 1, phase: 'START' });
    const t0 = performance.now();
    let outcome;
    try {
      outcome = STAGE_IMPL[stage](context, options);
    } catch (error) {
      timings[stage] = performance.now() - t0;
      return terminal(context, timings, 'FAILED', stage, [errorDiagnostic(error)]);
    }
    timings[stage] = performance.now() - t0;
    onProgress({ stage, index: i, total: stopIndex + 1, phase: 'END',
                 elapsedMs: timings[stage], ok: outcome.ok });
    if (!outcome.ok) return terminal(context, timings, 'FAILED', stage, outcome.diagnostics);
    Object.assign(context, outcome.patch);
  }
  return terminal(context, timings, 'QUALIFIED', null, []);
}
```

`STAGE_IMPL` holds the six stage functions, each lifted verbatim from the current `executeLfeaWorkbench` body — **do not rewrite the logic, move it.** `terminal()` builds the same `lfea-workbench-execution/v1` shape as today plus `stageTimings` and `reachedStage`, so nothing downstream breaks.

```js
// src/workspace/lfea-preflight.js
import { estimateCsrStorageBytes } from '../core/element-fea/index.js';

/**
 * Predict cost and capacity outcome WITHOUT solving. Runs in O(N+E).
 * Every number returned is an estimate and is labelled as such in the UI.
 */
export function preflightMeshPackage(packageValue, adapterProfile, reviewProfile) {
  const nodeCount = packageValue.nodes.length;
  const elementCount = packageValue.elements.length;
  const dofCount = 2 * nodeCount;

  // Structural nonzeros: per element, (2*nodesPerElement)^2 entries, minus overlap.
  // Upper bound is sufficient for a capacity decision; label it as an upper bound.
  const nonzeroUpperBound = packageValue.elements.reduce(
    (sum, e) => sum + (2 * e.nodeIds.length) ** 2, dofCount);
  const storageBytes = estimateCsrStorageBytes(dofCount, nonzeroUpperBound);

  // Export size scales with rows of raw evidence; calibrate the constant from
  // reports/ui-4-export-size-calibration.json, do NOT invent it.
  const rawRows = packageValue.elements.reduce(
    (n, e) => n + (e.elementType === 'Q4' ? 4 : 1), 0);
  const estimatedExportBytes = Math.round(
    EXPORT_BYTES_PER_NODE * nodeCount + EXPORT_BYTES_PER_RAW_ROW * rawRows);

  const blockers = [];
  if (nodeCount > adapterProfile.maximumNodes)       blockers.push(cap('NODE', nodeCount, adapterProfile.maximumNodes));
  if (elementCount > adapterProfile.maximumElements) blockers.push(cap('ELEMENT', elementCount, adapterProfile.maximumElements));
  const exportBlocked = estimatedExportBytes > reviewProfile.maximumExportBytes;

  return Object.freeze({
    nodeCount, elementCount, dofCount, nonzeroUpperBound, storageBytes,
    estimatedExportBytes, estimateBasis: 'LINEAR_CALIBRATION_V1',
    blockers: Object.freeze(blockers),
    exportRisk: exportBlocked ? 'EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY' : 'WITHIN_ESTIMATED_CAPACITY',
    // The point of the whole wave:
    recommendedStage: blockers.length ? null : (exportBlocked ? 'SOLVE' : 'EXPORT'),
  });
}
```

Worker client must expose `run(packageValue, {untilStage, onProgress})` returning a promise plus a `cancel()`. Use `structuredClone`-compatible messages only. Because every kernel artifact is already plain-JSON and deeply frozen, transfer is straightforward — but note that `Object.freeze` does not survive `postMessage`; re-freeze on receipt, and assert the semantic hash after transfer to prove nothing mutated in flight.

### Test requirements

1. **Stage equivalence.** For every fixture, `runStages(pkg, {untilStage:'EXPORT'})` produces `result.semanticHash`, `review.semanticHash`, `evidenceExport.semanticHash` identical to the pre-wave `executeLfeaWorkbench(pkg)`. Compare against `reports/ui-3-hash-golden.json`.
2. **Early stop is cheap and honest.** `untilStage:'SOLVE'` returns a populated `result`, `null` for review/export, and takes < 25 % of the `EXPORT` wall clock on the 20×20 grid. Assert the ratio, not an absolute time.
3. **Fail-closed preserved.** Feed the forged-hash fixture; assert `reachedStage:'VALIDATE'`, `status:'FAILED'`, and that `result`, `review`, `evidenceExport` are all `null`. No stage after a rejection.
4. **Cancellation.** With `shouldCancel` true at stage index 2, assert `status:'CANCELLED'`, `reachedStage:'SOLVE'`, and no evidence artifacts produced.
5. **Preflight accuracy.** On the 10×10, 20×20, 30×30 grids, assert predicted export bytes are within ±25 % of actual, and that the 30×30 case is flagged `EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY` **before** any solve runs. Commit the calibration data.
6. **Preflight is fast.** < 50 ms on the 40×40 grid.
7. **Worker parity (4b).** Same fixture, worker path and main-thread path produce identical semantic hashes. Assert the transferred model's re-computed hash equals the sender's.
8. **Playwright:** load a 30×30 fixture, assert the preflight panel warns before the run button is enabled for `EXPORT`; click "Solve only"; assert results appear and the tab stays responsive (a `requestAnimationFrame` counter keeps ticking during the solve).

### Anti-drift checkpoints

* **AD-4.1** *Move, do not rewrite.* PR must include a side-by-side showing each stage body is the pre-existing code relocated. Any behavioural edit inside a stage is a separate PR.
* **AD-4.2** *Hash equivalence against pre-wave goldens* is the single strongest guard that staging changed nothing numeric.
* **AD-4.3** *Stage order is a frozen constant.* `STAGES` is `Object.freeze`d and `ui-invariant-check` asserts its exact contents and order.
* **AD-4.4** *No stage after failure.* Explicitly asserted (test 3), because this is the property the whole fail-closed architecture rests on.
* **AD-4.5** *Worker is a transport, not a second implementation.* `ui-invariant-check` asserts `lfea-solver.worker.js` imports `runStages` and contains no other import from `src/core/`.
* **AD-4.6** *Calibration is data, not a literal.* `EXPORT_BYTES_PER_*` are read from a committed calibration JSON with the generating commit recorded in it.

### Agent qualification test — UI-4

1. The 30×30 breakdown shows `adaptMeshPackage` 2 554 ms and `solveContinuumModel` 2 292 ms. `assertNoHangingNodes` / `assertNoImproperEdgeIntersections` run inside **both**. Identify where each call site is, explain why running them twice is not merely wasteful but a *correctness* question worth asking, and state what you would need to prove before removing either call.
2. `Object.freeze` does not survive `postMessage`. List three concrete failure modes this opens in the worker design, and specify the guard for each. One of your guards must be a semantic-hash check — say exactly where it goes and what it compares.
3. Preflight predicts export bytes from a linear calibration. Give two mesh topologies where a linear model will be badly wrong, and describe how the UI should present an estimate it knows can be wrong without either (a) crying wolf or (b) letting a user burn 50 seconds.
4. A user cancels mid-`REVIEW`. `context.result` is populated and valid. Should the UI keep displaying those results? Argue both sides, then state your decision and the exact state-machine transition, including what the status badge reads.
5. `runStages` reports progress via a callback. In the worker that becomes `postMessage` per stage. Explain why per-*stage* granularity is acceptable but per-*element* granularity would be a mistake here, and describe how you would give the user a responsive progress signal during a single 6-second `createEngineeringReview` call **without** threading a callback through the kernel.

---

## UI-5 — Incremental rendering, virtualized tables, non-destructive editing

**Fixes:** D-06, D-07. **Depends on:** UI-4.
**Estimated:** 3 agent-days.

### Reasoning

Three coupled problems: full DOM teardown on every publish; whole-package reseal on every node drag; and silent 200-row table truncation. All three make the workbench unusable above toy meshes and destroy user work (a 1 px drag discards a completed solve).

The fix is not a framework. It is (a) split state into `documentVersion` / `executionVersion` / `viewVersion` and re-render only the affected region; (b) make drag emit a **preview** that does not touch the store until pointerup, and coalesce; (c) render tables from a windowed slice with an explicit row count and pagination.

**Critical constraint:** do not silently keep a stale solve alive across a geometry edit. Today's `execution: null` on edit is *correct engineering behaviour*. Preserve it — but make it **visible and undoable**: mark the execution `STALE`, keep it displayed greyed with a `STALE — geometry edited after solve` banner, and let the user undo back to it. Discarding silently is the bug; discarding is not.

### Files

| Action | Path |
|---|---|
| EDIT | `lfea-workbench-store.js` — versioned regions, staleness, drag coalescing |
| EDIT | `lfea-workbench-view.js` — region-scoped render, virtualized tables |
| CREATE | `src/workspace/lfea-table-view.js` — windowed table with count/pagination/sort |
| EDIT | `lfea-workbench-svg.js` — preview-drag; mutate attributes, do not rebuild |
| CREATE | `scripts/ui-5-render-check.mjs` |

### Code sketch

```js
// lfea-workbench-store.js — versioned regions
let state = freeze({
  schema: 'lfea-workbench-state/v2',
  status: 'EMPTY',
  packageValue: null,
  execution: null,
  executionStale: false,          // NEW: solve kept, flagged, not silently dropped
  versions: { document: 0, execution: 0, view: 0 },   // NEW
  ...
});

function committedState(previous, packageValue) {
  return {
    ...previous,
    status: 'READY',
    packageValue,
    execution: previous.execution,        // keep it
    executionStale: Boolean(previous.execution),
    versions: { ...previous.versions, document: previous.versions.document + 1 },
    past: [...previous.past, previous.packageValue].filter(Boolean).slice(-HISTORY_LIMIT),
    future: [],
    diagnostics: [],
  };
}
```

```js
// lfea-workbench-view.js — region-scoped render
render(state) {
  if (!this.mounted) { this.mount(state); return; }
  const v = state.versions;
  if (v.document !== this.rendered.document) { this.renderRecords(state); this.renderSvgGeometry(state); }
  if (v.execution !== this.rendered.execution || state.executionStale !== this.rendered.stale) {
    this.renderResults(state); this.renderSvgField(state);
  }
  this.renderStatus(state);                    // always cheap
  this.rendered = { ...v, stale: state.executionStale };
}
```

Drag: `pointermove` updates only `cx`/`cy` attributes and a live coordinate readout. On `pointerup`, commit **one** `moveNode`. Add a numeric X/Y input beside the readout so exact coordinates are achievable (D-13). Additionally, coalesce rapid commits behind a `requestAnimationFrame` boundary so a shaky pointer cannot queue N reseals.

Table: `lfea-table-view.js` renders `pageSize` rows (default 100, from the review profile's `tablePageSize`), always shows `Showing 101–200 of 1 922`, supports page navigation and column sort. **Union the key set across all rows, not just the visible page** — the current 8-key cap computed from the first 200 rows is how columns vanish.

### Test requirements

1. **Render-scope test** (jsdom or Playwright): with a solved model, change `resultMode`; assert the records-table DOM node is the **same object identity** before and after (i.e. it was not rebuilt).
2. **Drag commit count:** simulate 60 `pointermove` events then one `pointerup`; assert exactly **one** store publish and exactly **one** `resealLfeaMeshPackage` call (spy).
3. **Staleness:** solve, then drag a node. Assert `executionStale === true`, `execution !== null`, the stale banner is in the DOM, and the evidence-export button is disabled.
4. **Undo restores the solve:** undo after the drag; assert `executionStale === false` and the same `execution.result.semanticHash` as before the drag.
5. **Row-count honesty:** 961-node model → displacement table shows a total of 1 922 and page 1 shows 100. Assert the total string, and assert a field present only in row 1 500 still has a column.
6. **Interaction latency:** on the 30×30 fixture, a single `moveNode` commit completes in < 150 ms wall clock including render. Measured, asserted.
7. **Keyboard:** table rows respond to Enter/Space; node handles are focusable and movable with arrow keys by a declared increment.

### Anti-drift checkpoints

* **AD-5.1** *No `replaceChildren` on the workbench root* outside `mount()`/`destroy()`. Asserted by `ui-invariant-check` regex on `lfea-workbench-view.js`.
* **AD-5.2** *No `this.render(state)` inside an event handler.* Handlers dispatch to the store; only the store subscription renders. Asserted by regex.
* **AD-5.3** *Reseal call budget.* Test 2 pins reseals-per-gesture at 1. This is the single number that keeps the drag path from regressing.
* **AD-5.4** *Truncation is illegal.* `ui-invariant-check` fails on `.slice(0, 200)` and on any bare numeric slice in the view layer; row limits must come from a named profile field.
* **AD-5.5** *Staleness never silently discards.* Test 3 + 4 encode the engineering rule.
* **AD-5.6** *Latency budget in CI* (test 6) with generous headroom, so a future O(N²) render regression fails the build rather than a user's afternoon.

### Agent qualification test — UI-5

1. Today, editing geometry sets `execution: null`. Make the engineering case **for** that behaviour, then explain precisely what is wrong with it from a user-safety perspective, and defend the `executionStale` design against the objection "you are now showing results that do not match the model on screen."
2. `resealLfeaMeshPackage` re-hashes the entire package on every commit (94 ms at 900 elements). Propose an incremental alternative, then explain the specific integrity guarantee you would lose — and conclude whether you would ship it. Justify either answer.
3. Region-scoped rendering depends on version counters being bumped correctly. Describe the failure mode when a counter bump is missed, explain why it is *worse* than a full re-render, and give a test that catches a missed bump without enumerating every action.
4. Test 2 spies on `resealLfeaMeshPackage` to count calls. Explain why counting *store publishes* alone would be an insufficient assertion, and identify a code change that keeps publishes at 1 while still doing 60 reseals.
5. The table currently derives columns from the first 200 rows. Unioning keys across all rows is O(N × keys). For 40 000 raw-stress rows, is that acceptable? Show your reasoning, state what you would measure, and give the fallback design if it is not.

---

## UI-6 — Capacity preflight panel and mesh-quality visualization

**Fixes:** D-08 (presentation half), D-11. **Depends on:** UI-4, UI-5.
**Estimated:** 1.5 agent-days.

### Reasoning

UI-4 computes preflight; UI-6 shows it, and adds the other thing the engineer needs before trusting a peak stress: **which elements are bad**. `qualifyQ4Geometry` already produces `jacobianDeterminantRatio`, `edgeLengthRatio`, and `maximumCornerCosine` per element. Surface them as a selectable colour field (reusing UI-1's adapter and UI-2's legend) and as a sorted "worst 20 elements" table with click-to-locate.

Quality thresholds must be **declared, not invented**. Put them in the profile with a stated source, and label them as screening thresholds — not acceptance criteria.

### Files

| Action | Path |
|---|---|
| CREATE | `src/workspace/lfea-quality-field.js` |
| CREATE | `src/workspace/lfea-preflight-panel.js` |
| EDIT | `lfea-field-adapter.js` — add `QUALITY_*` field ids sourced from `result.elementQualityEvidence` |
| EDIT | `lfea-workbench-view.js` |
| CREATE | `scripts/ui-6-quality-check.mjs` |

### Key design points

* Quality fields go through the **same** adapter and the **same** legend contract as stress. No parallel rendering path.
* Thresholds live in the review profile as `qualityScreeningThresholds: { jacobianRatioMinimum, edgeRatioMinimum, cornerCosineMaximum }` with a `thresholdSource` string. If absent → the panel shows raw values with **no** pass/fail colouring. Never invent a default.
* The worst-N table row click selects the element in the SVG and scrolls the results table to it — one canonical selection identity, matching the `LFEA-007` consumer's `<elementId>:<resultLocationId>` scheme. Reuse that scheme; do not invent a second one.
* T3 has no Jacobian ratio (constant). Show `N/A — T3_CONSTANT_JACOBIAN`, never 1.0. A placeholder that looks like a good score is worse than a blank.

### Test requirements

1. Build a fixture with one deliberately distorted Q4 (aspect ratio ≈ 20:1, near-degenerate corner). Assert it ranks first in the worst-N table and that its `jacobianDeterminantRatio` matches `result.elementQualityEvidence` exactly.
2. Assert T3 elements render `N/A`, never a numeric Jacobian ratio.
3. With `qualityScreeningThresholds` absent from the profile, assert **no** pass/fail colouring is applied and a `NO_DECLARED_THRESHOLDS` note is shown.
4. Selection round-trip: click worst-N row → the SVG element with that `elementId` gains `data-selected="true"`, and the results table page containing it is shown.
5. Preflight panel renders before any solve, shows DOF, nonzero upper bound, estimated export bytes, and the recommended stage; on the 30×30 grid it shows the export-risk warning with the run button defaulted to "Solve only".
6. Preflight numbers in the panel equal `preflightMeshPackage()` output exactly — no re-derivation in the view (AD-1.1 extended).

### Anti-drift checkpoints

* **AD-6.1** *One adapter, one legend.* Quality fields must not add a rendering path. Asserted: `lfea-quality-field.js` contains no `createElementNS`.
* **AD-6.2** *No invented thresholds.* `ui-invariant-check` fails on numeric literals adjacent to `jacobian`, `aspect`, `cornerCosine` in the workspace layer.
* **AD-6.3** *One selection identity.* Regex-assert the `<elementId>:<resultLocationId>` form; no substring matching (the `LFEA-007` doc already forbids it — enforce it in code).
* **AD-6.4** *No placeholder scores.* Test 2 pins the `N/A` behaviour.
* **AD-6.5** *Preflight is single-sourced.* Test 6.

### Agent qualification test — UI-6

1. `jacobianDeterminantRatio` is min/max over four Gauss points **and** four corners. Explain what a ratio of 0.2 tells you about the element, what it implies for stress accuracy at that element, and why the corner evaluations matter even though integration only uses the Gauss points.
2. `maximumCornerCosine` is `|cos θ|` at the worst corner. State the corner angles that give 0.0 and 0.95, and explain why the absolute value means this metric cannot distinguish a 20° corner from a 160° corner. Is that a defect? Justify.
3. You are told to add a default aspect-ratio threshold of 5:1 "because that's standard." Explain why this repository's rules forbid it, and describe the acceptable way to introduce a threshold — including what must be recorded alongside the number.
4. A user sees a bright red high-stress element that is also flagged as the worst-quality element. Describe exactly what the UI should say to them, being careful not to assert either "the stress is wrong" or "the stress is right." What is the only thing that resolves the ambiguity?
5. Preflight reports `nonzeroUpperBound`, not the exact count. Explain how you compute the bound, by how much it typically overestimates on a structured quad grid, and why an over-estimate is the correct side to err on for a capacity gate.

---

## UI-7 — Convergence study workbench

**Fixes:** D-10. **Depends on:** UI-4, UI-5. **Highest engineering value in the plan.**
**Estimated:** 4 agent-days.

### Reasoning

Everything above makes the existing number trustworthy *as a number*. This wave is what makes it trustworthy *as an engineering result*. Without an h-refinement study, a peak stress from a CST or fully-integrated Q4 mesh is not a result — and at a re-entrant corner it does not converge at all.

The entire kernel already exists: `createConvergenceStudy`, `interpretConvergenceStudy`, `deriveRegionMeshMetrics`, `refinementRatios`, `recoverPointProbe`, `classifyScalarSequence`, `stressTrendEvidence`, Richardson extrapolation, and a `SINGULARITY_SUSPECTED` classification that the review layer is explicitly forbidden from upgrading. **This wave is wiring, not invention.** That is exactly why it is suitable for a junior agent with a tight spec — and exactly why the temptation to "improve" the kernel must be blocked.

### Scope boundary — read this twice

The agent **must not**:
* implement mesh refinement / remeshing (the user supplies each level as its own mesh package);
* compute an observed order, a Richardson estimate, or a trend classification in the UI layer;
* upgrade, soften, or hide a `SINGULARITY_SUSPECTED` classification;
* use projected stress for any convergence quantity (`authorityPolicy.projectedStressForConvergence === 'PROHIBITED'`).

### Files

| Action | Path |
|---|---|
| CREATE | `src/workspace/lfea-convergence-store.js`, `-controller.js`, `-view.js`, `-model.js`, `-chart.js` |
| EDIT | `lfea-pipeline-stages.js` — accept a supplied `convergenceStudy` / `convergenceResult` and pass through to review (`includeConvergenceEvidence: true`) |
| EDIT | `lfea-workbench-pipeline.js` — stop hardcoding `convergenceStudy: null` |
| CREATE | `scripts/ui-7-convergence-check.mjs` |
| CREATE | `e2e/ui-7-convergence.spec.js` |

### Design

**Level manager.** The user adds 2–5 mesh packages as levels, each labelled. For each, the UI runs `runStages(..., untilStage:'SOLVE')` and calls `deriveRegionMeshMetrics` to get characteristic size `h`. `refinementRatios` then **enforces** that `h` strictly decreases — if it does not, that is a rejection, and the UI must say so rather than reordering silently.

**Probe manager.** The user places named physical probes (x, y). `verifyProbeMapping` reports the element each probe lands in per level and the reconstruction residual. Show the residual — a probe that barely maps is a probe whose history is meaningless.

**Study execution.** Build the study input, call `createConvergenceStudy`, then `interpretConvergenceStudy`. **Render the returned classifications verbatim.** No recomputation.

**Chart.** Plain SVG log–log: characteristic size `h` on x, quantity on y, one series per probe/quantity, points annotated with level id. Draw the Richardson-extrapolated asymptote **only** where the kernel supplies one, and label it as an estimate. Where the kernel says `SINGULARITY_SUSPECTED`, draw no asymptote and print the kernel's own words.

**Mandatory standing caption** — take it verbatim from `LFEA-006_IMPLEMENTATION.md`:

> A stable global response does not prove convergence of a local peak stress.

### Code sketch

```js
// src/workspace/lfea-convergence-model.js
import { createConvergenceStudy, interpretConvergenceStudy,
         deriveRegionMeshMetrics, refinementRatios, verifyProbeMapping }
  from '../core/element-fea/index.js';

/**
 * Assemble a convergence study from already-solved levels.
 * This module performs NO numerical interpretation. Every classification,
 * observed order, and extrapolation is taken verbatim from the kernel.
 */
export function buildConvergenceStudy({ levels, probes, quantities, studyRegionId, studyIdentity }) {
  if (levels.length < 2) throw new TypeError('A convergence study requires at least two levels.');

  const levelMetrics = levels.map((level) => ({
    levelId: level.levelId,
    ...deriveRegionMeshMetrics(level.model, findRegion(level.model, studyRegionId)),
  }));
  // Throws if characteristic size does not strictly decrease. Do not catch-and-reorder.
  const ratios = refinementRatios(levelMetrics);

  const mappings = levels.flatMap((level) =>
    probes.map((probe) => verifyProbeMapping(level, probe, probe.mappings?.[level.levelId], TOL)));

  const study = createConvergenceStudy({
    schema: 'lfea-convergence-study/v1',
    studyIdentity, studyVersion: '1', studyRegionId,
    levels: levels.map((l) => ({ levelId: l.levelId, model: l.model, result: l.result,
                                 modelSemanticHash: l.model.semanticHash,
                                 resultSemanticHash: l.result.semanticHash })),
    probes, quantities,
  });
  const interpretation = interpretConvergenceStudy(study);
  return Object.freeze({ study, interpretation, levelMetrics, ratios, mappings });
}
```

### Test requirements

1. **Manufactured solution.** Three uniform Q4 levels (h, h/2, h/4) of a patch with a known analytic answer. Assert the kernel's observed order is within a stated band of 2, and that the UI displays the kernel's number verbatim (string compare against `interpretation`).
2. **Singularity case.** An L-shaped domain with a re-entrant corner. Assert the kernel returns `SINGULARITY_SUSPECTED`, the UI renders that exact status, **no** asymptote line is drawn, and no "converged" wording appears anywhere in the DOM.
3. **Non-monotone refinement rejected.** Supply levels with `h` increasing. Assert a rejection with the kernel's own message, and that no study artifact is produced.
4. **Projection prohibition.** Attempt to build a study with a projected-stress quantity. Assert rejection citing `projectedStressForConvergence: 'PROHIBITED'`.
5. **No UI recomputation.** Every numeric shown in the convergence panel is `Object.is`-identical to a value in `interpretation` or `levelMetrics`. Walk the rendered DOM, extract numbers, assert set membership.
6. **Standing caption present.** The "stable global response" sentence is in the DOM whenever the panel is visible.
7. **Probe residual visible.** Assert `reconstructionResidual` renders for every probe/level pair.
8. **Playwright:** three levels + one probe → study runs → chart has 3 points, the classification badge matches the kernel status, the export contains the convergence section (`includeConvergenceEvidence: true` now flows through).

### Anti-drift checkpoints

* **AD-7.1** *Zero numerical authority in the UI.* `ui-invariant-check` fails if `lfea-convergence-*.js` contains `Math.log`, `Math.pow`, or `**` — order and Richardson arithmetic belong to the kernel.
* **AD-7.2** *Verbatim classification.* Test 5 asserts every displayed number came from the kernel object.
* **AD-7.3** *Never upgrade a singularity.* Test 2 pins it; `ui-invariant-check` also fails on any conditional that maps `SINGULARITY_SUSPECTED` to another string.
* **AD-7.4** *No remeshing.* Assert the convergence modules import nothing that generates geometry; levels are user-supplied packages only.
* **AD-7.5** *Standing caption is a constant*, imported from one module, asserted present (test 6).
* **AD-7.6** *Prohibited-quantity gate* (test 4) enforced in the model layer, not the view.

### Agent qualification test — UI-7

1. Three uniform refinements give peak von Mises 100, 140, 190 MPa. What do you conclude, what do you tell the engineer, and what do you refuse to tell them? Then state which kernel classification you would expect and why.
2. Richardson extrapolation assumes asymptotic-range monotone convergence at a constant observed order. Give three situations in this repository's problem domain where that assumption fails, and state what the UI does in each.
3. Explain the difference between "the global strain energy has converged" and "the peak stress at the trunnion toe has converged." Why does the repo mandate the standing caption? Construct a numerical example where the first is true to 0.1 % and the second is off by 40 %.
4. A user supplies levels whose characteristic sizes are 1.0, 0.5, 0.55. `refinementRatios` throws. Three responses are proposed: (a) sort the levels; (b) drop the third; (c) reject the study. Argue for one and explain concretely what each of the other two would hide from the engineer.
5. `authorityPolicy.projectedStressForConvergence` is `'PROHIBITED'`. Explain the physical reason — what does nodal averaging do to a peak, and why does that specifically corrupt a convergence sequence rather than merely biasing a single result?

---

## UI-8 — LAFEA result presentation and accessibility

**Fixes:** D-09, D-13, D-14. **Depends on:** UI-1, UI-2, UI-5.
**Estimated:** 3 agent-days.

### Reasoning

The LAFEA workbench drives five kernels — including a full CST+DKT thin-shell FEA — and presents every result as `JSON.stringify(execution.result, null, 2)` in a `<pre>`. That is not a reviewable engineering output, and it violates `rules.md` §1 explicitly. Accessibility and error-attribution defects are folded in because they touch the same files.

### Files

| Action | Path |
|---|---|
| CREATE | `src/workspace/lafea-result-presenters/{index,local-stress,attachment-screening,local-continuum,local-shell,trunnion-footprint}.js` |
| CREATE | `src/workspace/lafea-result-svg.js` |
| EDIT | `lafea-workbench-view.js` — replace `jsonBlock(execution.result)`; a11y |
| EDIT | `lafea-workbench-controller.js` — fix error attribution (D-14) |
| EDIT | `lfea-workbench-view.js`, `lfea-workbench-svg.js` — a11y |
| CREATE | `scripts/ui-8-presenter-check.mjs`, `scripts/ui-8-a11y-check.mjs` |

### Design

**One presenter per kernel, one contract.** Each presenter is a pure function `(result, units) => { sections, governing, limitations }`:

```js
/**
 * @returns {{
 *   sections: Array<{title:string, rows:Array<{label:string,value:number|string,unit:string,
 *                                              formulaId:string|null, sourcePath:string}>}>,
 *   governing: {label:string, value:number, unit:string, locationId:string, sourcePath:string}|null,
 *   limitations: string[]   // verbatim from result.limitations / BASE_LIMITATIONS
 * }}
 */
```

Non-negotiables:

* **Limitations are rendered, always, prominently.** `local-stress` declares `NO_LOCAL_ATTACHMENT_STRESS`, `NO_SHELL_BENDING`, `NO_CODE_COMPLIANCE`. A user seeing a stress number without those five words next to it will misuse it. Render them in the same visual block as the governing value, not in a collapsed accordion.
* **Formula IDs are shown.** Every kernel emits `formulaIds`. Display them per row — that is the traceability the whole architecture was built for, currently invisible.
* **Shell results get a visualization.** `local-shell` produces per-node displacements and per-facet stress resultants. Render the facet mesh with a selectable field through the **same** adapter/legend contract as UI-1/UI-2. Do not build a second rendering stack.
* **Keep the raw JSON**, behind a "Raw evidence" disclosure, for debugging. The defect is JSON *as the presentation*, not JSON's existence.

**Error attribution (D-14):** add `store.reportEditError(path, error)` that produces a `LFEA_RECORD_EDIT_REJECTED` / `LAFEA_RECORD_EDIT_REJECTED` diagnostic naming the collection path and record index. Stop routing edit failures through `importDocument`.

**Accessibility:**

| Defect | Fix |
|---|---|
| `role="img"` on editable SVG | `role="application"` + `aria-label`; `role="img"` only when non-interactive |
| node handles unreachable | `tabIndex=0`, `role="button"`, `aria-label="Node N12 at x, y"`, arrow-key nudge by a declared increment, Escape cancels |
| `<tr tabIndex=0>` click-only | add `keydown` Enter/Space; `role="row"`, `aria-selected` |
| diagnostics silent | `role="status"` + `aria-live="polite"`; errors `role="alert"` + `aria-live="assertive"` |
| unlabelled file input | `<label for>` with visible text |
| no exact coordinate entry | numeric X/Y inputs bound to the selected node (also completes UI-5) |
| object-URL race | revoke on `window` `focus` or after a `setTimeout(…, 30_000)`, not in a microtask |

### Test requirements

1. Every presenter, on every LAFEA fixture: output validates against the presenter contract; every `rows[].value` is `Object.is`-identical to a value in the source result; every `rows[].unit` is non-empty.
2. `governing` identifies the same location the kernel's own assessment identifies (compare against the kernel's governing field, do not re-derive).
3. **Limitation-visibility test:** for each kernel, assert every string in `result.limitations` appears in the rendered DOM. This is the test that keeps a numeric result from being shown stripped of its scope.
4. **Formula-ID visibility:** assert every `formulaIds` entry present in the result appears in the DOM.
5. **No-raw-JSON test:** assert the default view contains no `<pre>` whose text parses as JSON with more than 20 keys. The raw block must be behind a closed `<details>`.
6. Shell field rendering goes through `selectElementField` — assert by spy or by the invariant grep.
7. **Automated a11y:** run `axe-core` (dev-only, via CDN in the Playwright page context — not a package dependency) on both workbenches; assert zero violations at serious/critical.
8. **Keyboard-only journey (Playwright):** Tab to file input → import → Tab to a node → arrow-key move → Tab to run → Enter → results announced via the live region. No mouse.
9. **Error attribution:** submit malformed record JSON; assert the diagnostic code is `*_RECORD_EDIT_REJECTED`, names the collection path and index, and that no import-rejection wording appears.

### Anti-drift checkpoints

* **AD-8.1** *One presenter contract.* All five presenters validated by the same schema check; adding a kernel means adding a presenter, not a special case in the view.
* **AD-8.2** *Limitations are mandatory.* Test 3 makes them a build-breaking requirement, not a style preference.
* **AD-8.3** *No second rendering stack.* `ui-invariant-check` asserts `lafea-result-svg.js` imports the shared legend/descriptor modules and defines no local colour ramp.
* **AD-8.4** *Raw JSON is demoted, not deleted.* Test 5 pins it behind a disclosure — so the next agent does not "restore" it to the top of the panel.
* **AD-8.5** *A11y is in the gate.* Test 7 runs in `npm run check:e2e`; regressions fail CI.
* **AD-8.6** *No axe dependency.* `ui-invariant-check` asserts `axe-core` never appears in `package.json`; it is injected in the page at test time only.

### Agent qualification test — UI-8

1. `local-stress` declares `BASE_LIMITATIONS = [NO_LOCAL_ATTACHMENT_STRESS, NO_FEA, NO_SHELL_BENDING, NO_WELD_STRESS, NO_CONTACT, NO_CODE_COMPLIANCE]`. Translate each into one sentence a piping engineer would act on. Then: given those six limitations, what question can this module legitimately answer?
2. `local-attachment-screening` computes `σx = Fx/A + My·z/Iy − Mz·y/Iz` at a wall location. Explain why this is a *run-pipe beam* stress and not a *local attachment* stress, and describe how a UI can present the number so that a reader cannot mistake one for the other. Be concrete about wording and layout.
3. `local-shell` uses DKT — discrete Kirchhoff, no transverse shear. State the t/R (or span/thickness) regime where that becomes unconservative, explain what physically goes wrong, and specify what the UI must compute and display so the user knows whether they are inside the valid regime.
4. Setting `role="application"` on the SVG changes screen-reader behaviour substantially. Explain the trade-off versus `role="img"` and versus `role="group"`, and justify your choice specifically for a drag-editable FEA mesh with 900 nodes. What do you do about announcing 900 focusable handles?
5. You are told to "just add a table" instead of building five presenters, since the results are all key–value data. Give the strongest version of that argument, then rebut it — your rebuttal must identify at least one *engineering-safety* consequence, not merely a maintainability one.

---

# PART D — Sequencing, gates, and definition of done

## D.1 Order

```text
Week 1   UI-0 ──▶ UI-1 ──▶ UI-2        (all S1 presentation defects closed)
Week 1   UI-3                          (parallel; independent)
Week 2-3 UI-4a ──▶ UI-4b ──▶ UI-5      (performance and interaction)
Week 4   UI-6                          (parallel with UI-7 start)
Week 4-5 UI-7                          (engineering credibility)
Week 5-6 UI-8                          (LAFEA parity + a11y)
```

UI-1 and UI-2 are the only waves that fix S1 defects. If schedule pressure appears, ship UI-0 → UI-1 → UI-2 → UI-3 and stop. Everything after that is improvement; those four are correction.

## D.2 Definition of done — per wave

A wave is done when **all** of the following are true. Any one missing → not done.

1. `npm run gate` is green on the wave branch.
2. The wave's own check script exists, is wired into `gate`, and fails when the defect is reintroduced (**demonstrate this** — the PR must show a deliberate-regression run that fails).
3. Every anti-drift checkpoint for the wave is enforced by code, not by review comment.
4. `reports/ui-3-hash-golden.json` still matches, or the PR explains every changed hash.
5. The PR body contains: wave ID, merge-base SHA, the full list of files read before editing, and the deliberate-regression evidence from (2).
6. `ARCHITECTURE_TRUTH.md` is updated if the wave added a module or a script.

## D.3 Standing rules — the short list to put in the PR template

* No new runtime dependencies. Ever.
* No React, no JSX, no Zustand.
* The view layer never computes a physical quantity.
* Every displayed number carries a unit, a quantity id, and a provenance path.
* Every colour ramp carries numeric ticks.
* Geometry state (deformed/undeformed + scale) is always visible.
* A rejected stage never advances to the next stage.
* A `SINGULARITY_SUSPECTED` classification is never softened.
* `Math.random()` and `Date.now()` never appear in a calculation or evidence path.
* Kernel limitations are rendered with the result, never collapsed away.

---

# Appendix A — Reproduction scripts

Save each to the repository root and run with `node <file>`. They depend only on committed fixtures.

**A.1 — D-01, the von Mises discrepancy**

```js
// vm-probe.mjs
import { t3PlatePackage } from './scripts/lfea-005-fixtures.mjs';
import { profile as denseProfile } from './scripts/lfea-002-fixtures.mjs';
import { executeLfeaWorkbench } from './src/workspace/lfea-workbench-pipeline.js';
import { lfeaDisplayGeometry } from './src/workspace/lfea-workbench-model.js';

const pkg = t3PlatePackage({ formulation: 'PLANE_STRAIN', solverProfile: denseProfile('PLANE_STRAIN') });
const ex = executeLfeaWorkbench(pkg, {});
const [sx, sy, txy] = ex.result.elementStresses[0].values;
const uiVM = Math.sqrt(sx ** 2 - sx * sy + sy ** 2 + 3 * txy ** 2);
const solverVM = ex.result.vonMisesStress[0].value;
console.log('sigmaZ      :', ex.result.elementStresses[0].sigmaZ);
console.log('UI shows    :', uiVM);          // 2
console.log('Solver value:', solverVM);      // 1.8027756377319946
console.log('error %     :', (100 * (uiVM - solverVM) / solverVM).toFixed(3));  // 10.940
console.log('RAW_STRESS node coords:', lfeaDisplayGeometry(pkg, ex, 'RAW_STRESS').nodes);  // D-02
```

**A.2 — D-04, staged timing** — build an N×N Q4 grid with `sealPackage` from `scripts/lfea-005-fixtures.mjs`, then time `normalizeLfeaMeshPackage`, `adaptMeshPackage`, `solveContinuumModel`, `createStressProjection`, `createReviewInput`, `createEngineeringReview`, `createEvidenceExport` individually. Grid generator and full script are reproduced in the wave UI-4 PR.

**A.3 — D-05, hash equivalence and speed** — becomes `scripts/ui-3-hash-equivalence-check.mjs`; the BigInt reference must be kept inside that file permanently (AD-3.1).

---

# Appendix B — Defect → wave map

| Defect | Severity | Wave |
|---|---|---|
| D-01 UI von Mises ≠ solver von Mises | S1 | UI-1 |
| D-02 stress modes plot deformed silently | S1 | UI-2 |
| D-03 mode switch changes quantity, legend does not | S2 | UI-1 + UI-2 |
| D-04 22 s main-thread freeze; 90 % is bookkeeping | S3 | UI-3 + UI-4 |
| D-05 BigInt hash, 18.7× available | S3 | UI-3 |
| D-06 full DOM rebuild + full reseal per drag | S3 | UI-5 |
| D-07 silent 200-row truncation | S2 | UI-5 |
| D-08 capacity envelope inconsistent ~16× | S2 | UI-4 + UI-6 |
| D-09 LAFEA results are raw JSON | S1-adj | UI-8 |
| D-10 no convergence UI | S1-adj | UI-7 |
| D-11 mesh quality computed, never shown | S2 | UI-6 |
| D-12 no units anywhere | S2 | UI-2 |
| D-13 accessibility | S3 | UI-8 |
| D-14 wrong error attribution | S3 | UI-8 |
| D-15 docs describe a non-existent architecture | S1 (agents) | UI-0 |
