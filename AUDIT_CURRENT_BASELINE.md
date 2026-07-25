# Simplified Analysis — Phase U0 Current Baseline Certification

## Scope

This document locks the Phase U0 audit baseline before the next upgrade waves. It corrects the previous audit wording against the current repository state and defines the certification gate that must remain green before functional upgrades proceed.

Repository: `reallaksh19/Simplified_Analysis`  
Baseline source ref used for audit: `f7ce7f94001a40eaa874a9a3a36ee5570dbf041a`  
Phase: `U0 — Baseline certification and correction pack`

## Audit corrections

### Corrected item 1 — Engineering benchmarks are now enforced

The earlier audit said benchmark tests mostly log values without assertions. The current repository has a dedicated benchmark runner in `scripts/run-engineering-benchmarks.mjs` that:

- loads `engineering-benchmark-v2` fixtures from `benchmarks/fixtures`;
- dispatches each fixture to its declared solver export;
- verifies the required method ID;
- requires a non-empty `formulaIds` array;
- checks required status when present;
- compares actual numeric results against expected values;
- writes `reports/benchmark-results.json` and `reports/benchmark-summary.md`;
- exits with non-zero status if any fixture fails.

The committed benchmark report records:

```text
Total engineering cases: 37
Passed: 37
Failed: 0
Pending: 0
Skipped legacy/reference fixtures: 11
Max Rounded Numeric Error: 0
```

### Corrected item 2 — Settings UI exists, but settings are not yet fully authoritative

The previous audit stated that hidden settings were not exposed. The current repository includes:

- `src/settings/SettingsTab.jsx`
- `src/data/engineeringDefaults/defaults.js`
- `engineeringDefaults` state in `src/store/appStore.js`

The UI exposes project unit system, default length/force/stress units, pipe/material data source selectors, rack friction factor, rack spacing margin, short-drop limit, placeholder-load policy, report timestamp policy, and benchmark certification requirement.

Residual U1/U2 risk: multiple stores and solvers still hold independent defaults. Examples include `useExtendedStore`, `SketcherStore`, and `AnalysisStore`. Settings are visible, but not yet a single authoritative contract for all calculations.

### Corrected item 3 — Formula trace display exists in part of the UI

The previous audit stated that formula traces were not visible. `Bundle2DSolverView.jsx` now includes a `FormulaTracePanel` that renders calculation trace steps for the 2D bundle view.

Residual risk: trace presentation is not yet normalized across Calc Extended, GC3D, Pipe Rack, Reports, and Diagnostics.

### Corrected item 4 — SRSS wording must distinguish GC3D from Calc Extended

GC3D has node stress combination through `combineStressAtNode` and fixture coverage such as `GC3D-COMBINE-001`. Calc Extended calculates per-axis guided-cantilever reactions and maps them into MIST and flange screening. Reports and future documentation must not claim that Calc Extended globally performs GC3D-style node SRSS unless the code path explicitly does so.

## Current baseline status matrix

| Area | Current status | U0 certification judgment |
| --- | --- | --- |
| Package scripts | `check:full`, `check:qa`, `check:e2e`, and `build` scripts exist | Accept for U0 after adding `ci:u0` aggregate script |
| Benchmark runner | Enforces method ID, formula IDs, status, numeric comparison, and non-zero exit on failure | Accept |
| Benchmark artifact | `reports/benchmark-results.json` shows 37/37 passed and max rounded numeric error 0 | Accept as recorded baseline |
| Settings UI | Present | Accept with residual U2 integration risk |
| Reports engine | V2 report builder exists | Accept with residual U6 active-result wiring risk |
| Reports tab | Uses demo/current mock context rather than active solver result | Residual risk for U6 |
| Sketcher → 3D sync | Known route mismatch risk: `viewer` vs rendered `home` route | Residual risk for U1 |
| Sketcher → 2D solver | May navigate to combined solver without forcing 2D subtab | Residual risk for U1 |
| Branch/tee/olet solving | GC3D blocks unsupported branch/tee/olet geometry | Safe but UX requires U1 preflight |
| Data source governance | New strict engineering-data layer exists, but Calc Extended still has local fallback DB path | Residual risk for U3 |
| Determinism | Math.random guard exists; Date.now still appears in runtime paths | Residual risk for U7 |

## U0 certification gate

Phase U0 is considered complete when the following local/CI commands return zero:

```bash
npm install
npm run check:full
npm run check:qa
npm run build
npm run ci:u0
```

Minimum expected benchmark result:

```text
Total: 37
Passed: 37
Failed: 0
Max Rounded Numeric Error: 0
```

## U0 deliverables included in this branch

1. `AUDIT_CURRENT_BASELINE.md` — current corrected audit baseline.
2. `scripts/u0-certification-check.mjs` — deterministic certification guard for Phase U0 recorded benchmark output.
3. `package.json` — adds:
   - `check` alias to `check:full`;
   - `ci:u0` aggregate script.
4. `.github/workflows/u0-certification.yml` — CI workflow for install, full checks, QA checks, and build.

## Known residual work moved out of U0

These are intentionally not fixed in U0 and must be handled in later upgrade phases:

- U1: Sketcher navigation and solver handoff workflow hardening.
- U2: Single authoritative engineering settings contract.
- U3: Unified engineering data resolver and no silent solver fallback.
- U4: Professional sketcher topology/fitting behavior.
- U5: Solver certification metadata and formula expansion.
- U6: Active-result calculation reports.
- U7: Browser-level workflow regression suite and stronger determinism checks.

## Implementation rule for later phases

No future phase may mark an audit item as fixed unless all three are true:

1. The source code has changed.
2. A benchmark/unit/e2e test proves the fix.
3. The relevant report or diagnostic path exposes the status to the user.
