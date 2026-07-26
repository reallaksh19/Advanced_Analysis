# FEA UI upgrade completion

Status: **UI-0 through UI-8 implemented** on 2026-07-26.

Evidence basis: retained repository fixtures processed through the real kernels.
Fixtures are labelled `[SIMULATED]/ANALYTICAL`; no result below is presented as
field or plant data.

| Wave | Implemented outcome | Executable evidence |
|---|---|---|
| UI-0 | Architecture truth, stale-document banners, doc-drift gate, cross-kernel T3 comparison | `check:doc-drift`, `check:fea-ui-upgrade` |
| UI-1 | One field-selection authority; displayed values select retained solver values | benchmark T4 cases, UI invariant gate |
| UI-2 | Explicit geometry state/scale, numeric locked legends, units and authority captions | benchmark presentation cases |
| UI-3 | Bit-identical 32-bit-half FNV-1a-64 acceleration | benchmark hash reference vectors |
| UI-4 | Fail-closed staged pipeline, module Worker, progress, terminating cancel and preflight | worker lifecycle and pipeline integration checks |
| UI-5 | Persistent workbench shells, caret restoration, bounded 100-row pagination, preview/apply/revert node edits | workbench and UI-upgrade checks |
| UI-6 | Preflight capacity exit plus retained Q4/T3 mesh-quality fields and evidence tables | capacity and retained-value identity checks |
| UI-7 | Strict supplied-level convergence import, kernel interpretation, probe residuals, classifications and review/export propagation | convergence fixture and projection-prohibition checks |
| UI-8 | Five LAFEA presenter contracts, shell field visualization, raw evidence disclosure and keyboard/live-region semantics | all five LAFEA contract suites and presenter checks |

## Measured acceptance evidence

- FEA UI source modules checked: 39; maximum permitted size: 300 lines;
  current largest: 299 lines.
- Production JavaScript output: 15 chunks; largest emitted file:
  `vendor-three-core`, 487,423 bytes. The former approximately 1.57 MB
  application chunk and Vite large-chunk warning are gone.
- Cross-kernel T3 shared problem:
  - `local-continuum` sigma-x: 2
  - `element-fea` sigma-x: 2
  - `local-continuum` loaded-node ux: 0.04
  - `element-fea` loaded-node ux: 0.04
- Presenter rows selected from retained evidence:
  - LAFEA.1: 11
  - LAFEA.2: 11
  - LAFEA.3: 14
  - LAFEA.4: 12
  - LAFEA.5: 468, paged in groups of 100
- Capacity behavior:
  - declared adapter capacity breaches stop at `PREFLIGHT`;
  - predicted export-byte breaches stop safely after `SOLVE`;
  - neither condition creates partial qualified review/export evidence.

## Gate

Run:

```text
npm run gate
```

The gate covers strict syntax/imports, documentation drift, LFEA-001 through
LFEA-006 core checks, all five LAFEA kernels, workspace contracts, both
workbenches, the nine-wave integration check, UI anti-drift invariants, the
production build, and emitted chunk-size verification.
