# Architecture Truth

This document supersedes `rules.md`, `CORE_SPECIFICATION.md`,
`AUDIT_CURRENT_BASELINE.md`, and `Tasks.md`.

Verified against baseline `ac9f689b86d58362626d69f8905131e6d809b2df` and the
FEA UI upgrade starting point `d0718fa2ed18ac4f521b27d66758c39634272fce`.

## Runtime

The application uses vanilla JavaScript ES modules, Vite 7, and `three`.
There is no React, JSX, react-three-fiber, or Zustand runtime.

## Composition

The runtime entry is `main.js`, which delegates to `workspace/bootstrap.js`.
Features use explicit stores, controllers, DOM views, pure model functions, and
the workspace event bus for cross-feature messages.

## Forbidden legacy paths

Do not create:

- `src/calc-extended`
- `src/store`
- `src/settings`
- `src/gc3d`
- `src/3d-analysis`
- `src/simp-analysis`
- `src/components`
- `src/config`

Do not add `.jsx` or `.tsx` files.

## FEA kernels

The retained numerical kernels are:

- `src/core/element-fea`
- `src/core/local-continuum`
- `src/core/local-shell`
- `src/core/local-stress`
- `src/core/local-attachment-screening`
- `src/core/local-trunnion-footprint`
- `src/core/vertical-beam-solver`

The workbench layer selects and presents kernel evidence. It must not rederive
stress invariants, convergence orders, Richardson estimates, or qualification
classifications.

## FEA UI invariants

- Every displayed engineering number carries a unit, quantity identity, and
  provenance path.
- Raw and projected stress are different quantities and never share authority.
- Geometry state and deformation scale are always explicit.
- Rejected stages do not advance.
- Projected stress is prohibited for convergence studies.
- `SINGULARITY_SUSPECTED` is rendered verbatim and is never softened.
- Kernel limitations remain visible with the result.
- New or materially edited FEA UI modules are at most 300 physical lines.
- No new runtime dependency is added for the FEA workbenches.

The detailed defect register, wave design, tests, and engineering limitations
are in `FEA_UI_UPGRADE_PLAN.md`.
