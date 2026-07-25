# Module Finalization Matrix

This matrix documents the final architecture modules, their statuses, and engineering levels.

| Module ID | Display Name | Path | Status | Engineering Level | Replacement For | Notes |
|---|---|---|---|---|---|---|
| `core-geometry` | Canonical Geometry | `src/core/geometry` | ACTIVE | SYSTEM | | Canonical geometry backbone |
| `pcf-interface` | PCF Import/Export | `src/pcf` | ACTIVE | DATA_INTERFACE | | PCF import/export layer |
| `2d-simplified-stress-check` | 2D Simplified Stress Check | `src/calc-extended` | ACTIVE | SCREENING | `simp-analysis-legacy` | Screening module for 2D simplified checks |
| `3d-guided-cantilever` | 3D Guided Cantilever | `src/3d-analysis` | ACTIVE | SCREENING | `gc3d` | Screening module for 3D guided cantilever |
| `piperack-expansion-loop` | Pipe Rack & Expansion Loop | `src/piperack` | ACTIVE | DESIGN_AID_SCREENING | `adv-piperack` | Design aid + screening module |
| `reporting` | Reporting | `src/reporting` | ACTIVE | SYSTEM | | Engineering report export |
| `benchmark-validation` | Benchmark/Validation | `src/benchmarking` | ACTIVE | SYSTEM | | Numeric QA and regression |
| `settings-defaults` | Settings/Defaults | `src/settings` | ACTIVE | SYSTEM | | App configuration |
| `spl2-bundle` | SPL2 Bundle | `src/spl2-bundle` | REFERENCE | REFERENCE | | Legacy reference / benchmark only |
| `gc3d` | GC3D | `src/gc3d` | REMOVED | UNKNOWN | | Removed duplicate GC3D module |
| `adv-piperack` | Advanced Pipe Rack | `src/calc-extended/adv-piperack` | REMOVED | UNKNOWN | | Removed duplicate adv-piperack module |
| `simp-analysis-legacy` | Simp Analysis (Legacy) | `src/simp-analysis` | REMOVED | UNKNOWN | | Removed old product-surface simp-analysis module |
| `extended-solver` | Extended Solver | `src/3d-analysis/ExtendedSolver.js` | REMOVED | UNKNOWN | | Removed ExtendedSolver.js |
