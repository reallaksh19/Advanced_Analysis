# FEA Enhancement Sequencing Plan — shared foundation first

**Governing documents:** `LFEA_IMPROVEMENT_PLAN.md` (centerline beam, B-1…B-8) and
`LAFEA_IMPROVEMENT_PLAN.md` (2.5D shell, S-1…S-7). This document does not replace
either. It records what the repository actually contains today, identifies the work
both plans share, and sequences the remainder so the shared parts are built once.

**Read at:** `a47b676` on `claude/fea-enhancement-plan-lnlvrx`.
Both plans pin their baseline at `ac9f689` — the initial commit. Two pull requests
have merged since, and one of them changes what is left to do.

---

## 1. Repository state, verified

### 1.1 The plans' baselines are stale in one respect

`ac9f689..a47b676` merged PR #1 (support capability mapping) and PR #2 (the FEA UI
upgrade, UI-0…UI-8). The UI upgrade **already delivered most of LAFEA S-6**:

| LAFEA S-6 requirement | State at `a47b676` |
|---|---|
| One presenter per kernel, one contract | **DONE** — `src/workspace/lafea-result-presenters/{index,common,local-stress,attachment-screening,local-continuum,local-shell,trunnion-footprint}.js` |
| Raw JSON demoted from primary presentation | **DONE** — `check:ui-invariants`, `check:fea-ui-upgrade` enforce it |
| Limitations rendered with the numbers | **DONE** — asserted in `ARCHITECTURE_TRUTH.md` FEA UI invariants |
| `SINGULARITY_SUSPECTED` never softened | **DONE** — invariant, asserted |
| 3D shell result view with field switching | **NOT DONE** — no `lafea-shell-3d-view.js`; nothing to plot until S-4 |

So S-6 is not the "fastest safety win available" any more; it has largely been taken.
What remains of S-6 is the shell field view, and that genuinely depends on S-4.

### 1.2 Everything else in both plans' gap tables still holds

Confirmed absent: `src/core/local-shell-geometry/`, `src/core/centerline-beam-fea/`.
Confirmed present and correct as described: `src/core/local-shell/` (2 270 LOC, CST +
DKT, 5 DOF/node, basis qualification that does not re-normalise),
`src/core/element-fea/` (2D continuum, convergence machinery incl.
`SINGULARITY_SUSPECTED`), `src/core/piping-topology/`, `src/core/geometry/`,
`src/data/materialProperties.js`, `src/core/component-data/pipeDataComponentDimensions.js`.

### 1.3 Two findings the plans do not mention

**`npm run gate` was red in a clean checkout.** `npm run syntax:strict` reports
`Invalid or unexpected token` for every `.mjs` script when `@babel/parser` is not
installed — the checker falls back to a script-mode parse. It is a missing-install
symptom, not a source defect: after `npm install` the full gate is green. Any agent
picking up a work package should run `npm install` before believing a gate failure.

**The LAFEA plan's worked example contradicts its own formula.** Section 1 defines
`λ = sqrt(R·t)`; section 7 quotes `λ = 21 mm` for NPS 12 Sch 40. That size gives
`sqrt(156.77 × 10.31) = 40.20 mm`. The formula is authoritative and is what
`attenuationLength` implements; the narrative figure is not used anywhere and the
derived extent and element-size figures in that paragraph inherit the same error.

### 1.4 Pre-existing duplication the plans will collide with

`Math.PI / 64` section inertia appears in five places today:
`src/data/pipeProperties.js`, `src/core/engineering-data/pipeDataComponentSource.js`,
`src/core/engineering-data/resolveEngineeringData.js`,
`src/core/vertical-beam-solver/flexural-properties.js`, `src/utils/materialUtils.js`.
LFEA **AD-B2.1** requires `pipeSectionProperties` to be the only such place. That is a
consolidation across five call sites in three unrelated features and it is not free —
it belongs in B-2, scoped and tested, not smuggled into a shared-module commit.

Three independent `semanticHash` implementations exist
(`shared-piping-model/canonical-json.js`, `local-shell/json.js`,
`local-trunnion-footprint/json.js`). New shared code uses the first; a fourth is not
created.

---

## 2. What the two plans actually share

Read side by side, the plans impose the same rule from opposite ends four times.
Each of those is one module, not two.

| Shared concern | LFEA says | LAFEA says |
|---|---|---|
| Attachment load handoff | B-8 exports `attachment-load-set/v1` | S-3 ingests it; §8 is identical in both |
| Orthonormal right-handed basis, never repaired | B-8 test 2 | S-1 AD-S1.3, kernel already refuses |
| Profile values with a source, no defaults | B-1 `SPAN_SEEDING_LIMIT_NOT_DECLARED`, AD-B1.2, AD-B3.2 | AD-S2.1, AD-S5.3, S-5 test 5 |
| Limitations propagate to the result | AD-B2.3, B-7 §7 | §8 rule 3, S-6 test 3 |
| Pipe wall geometry | B-2 `pipeSectionProperties` | S-1/S-2/S-5 need the same mean radius for `λ` |
| Statical equivalence of a resultant | B-8 test 1 | S-3 test 2, both exact to 1e-10 |

---

## 3. Delivered in this change — the shared foundation

Three modules and three check scripts, wired into `npm run gate` as
`check:shared-analysis` (placed before the kernel checks, since they depend on it).

### `src/core/shared-analysis-contract/`

| File | Contents |
|---|---|
| `errors.js` | `SharedAnalysisContractError` with machine codes; `undeclaredCode()` derives `SPAN_SEEDING_LIMIT_NOT_DECLARED` from `spanSeedingLimit`, so a new profile field cannot invent a differently shaped code |
| `numeric.js` | Finite/positive guards, `-0` normalisation |
| `validation.js` | `exactKeys` (missing and unexpected reported separately), `member`, `mergeLimitations` |
| `vector3.js` | `{x,y,z}` algebra, `combine` (components through a supplied basis), `qualifyOrthonormalBasis` (measures) and `requireOrthonormalBasis` (decides, against a **caller-supplied** tolerance — no default, and it never re-normalises) |
| `declared-value.js` | `requireDeclaredValue(profile, field, bounds)` → `{field, value, source}`; `declaredLimitCheck` → value + limit + limit source + verdict |

### `src/core/attachment-load-contract/`

Section 8 of both plans, in code — schema `attachment-load-set/v1`, canonicalisation,
unit refusal, explicit sign-convention reversal, basis-frame transform, moment transfer
`M + r × F`, and `compareResultants` (the single statical-equivalence comparison both
S-3 and B-8 must use). `signConvention` is a member of a declared pair rather than free
text, so a producer and a consumer cannot disagree silently.

### `src/core/pipe-wall-geometry/`

`pipeSectionProperties(OD, t)` — area, inertia, polar inertia, section modulus, mean
radius — and the shell length scales: `attenuationLength` (`sqrt(R·t)`),
`requiredModelExtent`, `decayZoneElementSize`, `diameterToThicknessCheck`,
`attachmentToRunRatioCheck`. The multipliers `2.5` and `0.5` appear in **no** source
file; they are read from the profile with their source recorded.

### Checks

* `scripts/shared-attachment-load-contract-check.mjs` — the script §8 mandates **by
  name**, owned by neither plan, modified only in a PR touching both.
* `scripts/shared-analysis-contract-check.mjs`
* `scripts/shared-pipe-wall-geometry-check.mjs`

Deliberate-regression evidence: defaulting an absent profile entry to
`{value: 1, source: 'DEFAULT'}` inside `requireDeclaredValue` fails both the shared
contract check and the pipe wall geometry check.

---

## 4. Sequencing from here

The shared foundation removes the ordering constraint that would otherwise have forced
LFEA B-8 to land before LAFEA S-3: both sides now code against a contract that already
exists and is already tested.

```
[shared foundation — DONE]
        │
        ├── LFEA ────────────────────────────────────────────────────────────
        │    B-1 conditioning / node seeding   uses requireDeclaredValue
        │      └─ B-2 model assembly           uses pipeSectionProperties
        │           └─ B-4 solver ─┬─ B-5 stress + SIF
        │      B-3 loads ──────────┘   └─ B-8 handoff  uses attachment-load-contract
        │    B-6 geometry UI (after B-1)   B-7 results UI (after B-4)
        │
        └── LAFEA ───────────────────────────────────────────────────────────
             S-4 resultant recovery   ← independent of S-1…S-3, start it first
             S-1 geometry             uses pipeSectionProperties, vector3
               └─ S-2 mesher          uses attenuationLength + profile limits
                    └─ S-3 loads/BCs  uses attachment-load-contract
             S-5 applicability (after S-2 and S-4)   S-7 modelling UI (after S-2)
             S-6 remainder: shell 3D field view (after S-4)
```

**Recommended next package: LAFEA S-4.** It is the highest-value item in either plan
(membrane/bending separation with no stress-classification line), it reads resultants
`src/core/local-shell/recovery.js` already computes, it touches no kernel maths, and it
does not depend on S-1…S-3. It also unblocks the only part of S-6 still outstanding.

**Then LFEA B-1 → B-2 → B-3 → B-4**, because that chain is where the engineering errors
live and everything else in the LFEA plan waits on it. B-2 carries the
`Math.PI / 64` consolidation described in §1.4 — budget for it.

**Then LAFEA S-1 → S-2 → S-3**, in order; S-2's convergence and extent-sensitivity tests
(S-2 tests 4 and 5) are the two that decide whether the mesher is fit for purpose and
are not optional.

---

## 5. Rules carried forward

Unchanged from both plans and enforced here: one work package per branch and per PR;
no new runtime dependencies (`three` remains the only one); read before write; no
hidden values; fail closed; units declared; every package ends with `npm run gate`
green plus its own check script that fails when the defect is reintroduced. No PR under
either plan modifies `src/core/element-fea/`, and none modifies the DKT/CST formulation
or basis qualification in `src/core/local-shell/`.

---

## 6. LFEA ingestion: PCF abolished, InputXML adopted

`pcfToCanonicalGeometry.js` is removed. It was confirmed unused anywhere in this
repository (imported by nothing under `src/`, matching what both plans' baseline audit
already found) before deletion. LFEA's geometry ingestion path is now CAESAR II
InputXML, following a directed request to adopt the InputXML engine and connectivity
logic in `reallaksh19/3D_Converters` — reimplemented against this repository's rules,
not copied, since the source engine does not follow `no hidden values` / `fail closed`
in several specific places (documented in the new modules' own doc comments).

**`src/core/geometry/adapters/inputXmlToCanonicalGeometry.js`** — CAESAR II
`PIPINGELEMENT` records to canonical geometry. Solves absolute node coordinates from
CAESAR's relative deltas (a real graph propagation, not a read); rejects a disconnected
node group instead of silently reseeding it at the origin; every diameter/thickness/
material inheritance from a prior element is a diagnostic, never silent; a restraint's
CAESAR `TYPE` code is never guessed into `ANCHOR`/`GUIDE` without a caller-declared
table. `inputxml-bend-arc.js` resolves a bend's real arc centre from its declared
radius and incoming tangent direction — closing the `BEND_ARC_GEOMETRY_NOT_DECLARED`
gap every PCF-imported elbow left open for LFEA B-1 (verified end to end: an
InputXML-sourced bend now curvature-seeds automatically through `conditionGeometry`).

**Verified against real data, and scoped honestly as a result.** Run against a real
CAESAR II InputXML export (`3D_Converters` benchmark `INLET-SEPARATOR-SKID-C2_INPUT.XML`,
35 elements, 9 bends), the parser and coordinate solver handled the full file cleanly.
The bend arc-centre resolver did not: 8 of 9 bends turned out to be compound multi-cut
miters (two declared angles across one element), which a single-circle model cannot
represent and now refuses cleanly (`BEND_COMPOUND_MITER_NOT_SUPPORTED`); the one
genuinely simple bend still failed its own radius cross-check, meaning CAESAR's
FROM/TO-node convention for an isolated bend needs more reverse-engineering than
attempted here. The resolver's load-bearing property is that refusal — proven against
real data — not the resolution rate. Fully resolving compound and simple CAESAR bends
with confidence is unscoped follow-up work, not attempted blind.

**`src/core/piping-topology/ray-projection.js`** — the "basic topology" logic adopted
from the same source repository's ray-shooter (there itself credited as adapted from an
earlier PCF-side concept): finds a branch tap's connection to a run when the two
endpoints are not coincident — a coordinate-tolerance stage can never find that,
because there is no tolerance small enough; the connection has to be found by casting a
ray along the tap's own declared direction. Delivered as a standalone, declared-limit,
non-mutating module (evaluates and ranks candidates; a caller decides), not wired into
`piping-topology`'s staged connection-resolver pipeline in this change — that pipeline's
profile schema (`connection-profile.js`) is strict and shared by every consumer of
`piping-topology`, and extending it is a separate, dedicated work package. The module is
shaped so that wiring later needs no rewrite.

Checks: `scripts/lfea-inputxml-ingest-check.mjs` (11 tests, including a deliberate
compound-miter case and a round trip through B-1's `conditionGeometry`) and
`scripts/lfea-ray-topology-check.mjs` (8 tests, including a realistic branch-tap
scenario). Both wired into `npm run gate` via `check:lfea-core`.

---

## 7. LFEA supersession: the Phase 1–3 Revamped Improvement Plan

The user supplied a far more rigorous LFEA architecture ("LFEA Phase 1–3 Revamped
Improvement Plan") that supersedes the original B-1…B-8 outline in sections 4–19 of
this document for LFEA specifically. It correctly identifies that B-2 was undersold
as "mostly wiring" when it is the central mechanical-model architecture package, that
`N = EAαΔT` is the wrong general thermal formulation (initial strain is correct;
`EAαΔT` is a fully-restrained *benchmark*, not the load method), that stress/SIF
belongs in Phase 4 not the linear-solve phase, and that UI must ship per-phase, not
deferred to the end. LAFEA's plan and sequencing (sections 1–6 above) are unaffected.

**P0 (containment precondition) — done, with two claims verified false.** Before
implementing anything, each of P0's four claimed defects was checked against this
repository's actual code, not assumed:

| Claim | Verified | Action |
|---|---|---|
| P0.1 mount-root collision | **Not present** — `workspace-layout.js` already declares distinct `lfea-consumer-root`/`lafea-consumer-root`, `bootstrap.js` already queries them distinctly | Locked in with a regression test, not "fixed" |
| P0.2 stale worker result becomes current | **Real** — `lfea-workbench-store.js`'s `completeRun` accepted any resolved execution unconditionally; nothing blocked editing during `RUNNING` or checked the package hadn't changed | Fixed: `beginRun` captures `packageValue.semanticHash`; `completeRun` discards a mismatched result (`LFEA_RUN_INPUT_STALE`) instead of publishing it |
| P0.3 DEFORMED requires an explicit scale | **Not present** — `lfea-workbench-model.js`'s `resolveDeformation` already throws without one | Locked in with a regression test (previously zero coverage) |
| P0.4 e2e not in the release gate | **Real** — `check:e2e` exists (66 Playwright specs) but isn't in `npm run gate` | **Not wired in.** Adding the full suite, or any subset, changes CI runtime/reliability for the whole application, not just LFEA — flagged as an open decision requiring its own scope, not made unilaterally here |

`scripts/lfea-p0-containment-check.mjs` carries the two lock-ins; the stale-run fix
is covered by `scripts/lfea-workbench-check.mjs` (already in `check:lfea-workbench`).
Both run inside `npm run gate` via `check:lfea-core`.

**Reconciliation with work already built.** The revamped plan's Phase 1 (source
intake → topology reconciliation → conditioned geometry) restates, with a stricter
contract shape, most of what commits 3–4 above already deliver:

| Revamped plan | Already built as |
|---|---|
| B-1A InputXML source contract | `inputXmlToCanonicalGeometry.js` — parsing, diagnostics and rejection codes exist; the `piping-inputxml-source/v1` envelope (acceptance state, interpretation profile as its own record) does not |
| B-1B topology reconciliation | `ray-projection.js` — candidate detection/ranking exists as a standalone, non-mutating module exactly as B-1B requires; wiring it into a staged accept/reject flow with committed-topology evidence does not exist yet |
| B-1C conditioned geometry ancestry | `geometry-conditioning.js` / `node-seeding.js` — node/segment generation with reasons exists; the specific `sourceNodeIds`/`sourceComponentIds` ancestry arrays and canonical (non-source-order) ordering are not yet in the exact shape specified |

None of this is wasted — it is the computational core the new contract layer wraps.
What is missing is the stricter envelope (acceptance states, profile-as-evidence,
explicit ancestry fields) and all of the Phase 1 UI (source intake, findings, geometry
review screens).

**Not started:** Phase 2 in full (units/convention freeze, `fea-linear-model/v1`,
strict material-state resolver, local-axis policy, bend mechanical state via
`resolveBendArcCentre` wrapped in the declared bend-mechanics API, rigid components,
linear restraint compiler) and Phase 3 in full (physical load-case contract, gravity
with density authority — currently blocked, since metallic material records expose
no density field — thermal initial strain, sparse solver, mechanical result recovery,
attachment-load handoff wired to a real solved result).

**Sequencing decision, open:** whether to (a) retrofit Phase 1's stricter contract
shape onto the already-built ingestion/topology/conditioning modules before moving on,
or (b) proceed directly to Phase 2's B-2.0 (units/conventions) and B-2.1
(`fea-linear-model/v1`) since those are net-new regardless, returning to the Phase 1
contract-hardening once Phase 2 clarifies what Phase 1's output actually needs to
carry. Not decided in this change.
