# SPL2 Reference Map

This document maps legacy SPL2 bundle formulas to their current module destinations.

| SPL2 Module | Purpose | Mapping Target | Status |
| ----------- | ------- | -------------- | ------ |
| `spl2_simp_logic.js` | 2D Simplified Stress | `src/solvers/2d/` (Agent 5) | Pending replacement |
| `spl2_loop_algo.js` | Expansion Loop Sizing | `src/solvers/piperack/` (Agent 7) | Pending replacement |
| `spl2_rack_logic.js` | Rack Span Load | `src/solvers/piperack/` (Agent 7) | Pending replacement |

## Known Variables for Benchmarking

- See `benchmarks/spl2-reference/extraction.json` for initial variable and formula scraping.
- See `docs/SPL2_FORMULA_EXTRACTION.md` for specific extracted logic rules.

Currently, benchmark fixtures mapping to exact SPL2 numeric outputs are marked as `PENDING_NUMERIC_EXTRACTION` as strict exact numeric verification datasets from SPL2 test cases require manual verification.
