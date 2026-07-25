# Final Module Certification

## Active Modules
* **Canonical Geometry Backbone (`src/core/geometry`)** - Data Interface layer
* **PCF Import/Export Layer (`src/pcf` or `src/import` / `src/export`)** - Data Interface layer
* **2D Simplified Stress Check (`src/calc-extended/`)** - Screening module
* **3D Guided Cantilever (`src/3d-analysis/`)** - Screening module
* **Pipe Rack & Expansion Loop (`src/piperack/`)** - Design Aid + Screening module
* **Reporting (`src/reporting/`)** - Engineering Report Export
* **Benchmark/Validation (`benchmarks/` / `src/benchmarking/`)** - Numeric QA and Regression
* **Settings/Defaults (`src/settings/`)** - App Configuration

## Reference-Only Modules
* **SPL2 Bundle (`src/spl2-bundle` or `src/reference/spl2/`)** - Legacy reference and benchmark source ONLY.

## Removed Modules
The following legacy and obsolete components are permanently removed and strictly forbidden from re-entry:
* `src/gc3d`
* `src/calc-extended/adv-piperack`
* `src/simp-analysis` (old product surface)
* `src/3d-analysis/ExtendedSolver.js`
