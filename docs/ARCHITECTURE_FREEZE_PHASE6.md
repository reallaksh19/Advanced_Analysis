# Phase 6 Architecture Freeze

## Overview

The Simplified Analysis app has completed Phase 5 source-level consolidation. This document formally freezes the module architecture for Phase 6.

### Module Boundaries

1. **System Core Backbone**
   - **Canonical Geometry (`src/core/geometry`)**: The stable backbone and unified contract for handling piping geometry.

2. **Data Interface**
   - **PCF Interface (`src/pcf`)**: Handling PCF file imports, exports, and data interoperability to/from canonical geometry.

3. **Screening Modules**
   - **2D Simplified Stress Check (`src/calc-extended`)**: Handles 2D engineering screening via simplified models.
   - **3D Guided Cantilever (`src/3d-analysis`)**: Handles 3D guided cantilever engineering screening estimations.

4. **Design Aid + Screening**
   - **Pipe Rack & Expansion Loop (`src/piperack`)**: Tooling for layout screening and design aids for pipe racks.

5. **Reporting and QA**
   - **Reporting (`src/reporting`)**: Shared engine to render engineering-style output reports.
   - **Benchmark Framework (`src/benchmarking`)**: System for numerical QA against verified references.

6. **Configuration**
   - **Settings (`src/settings`)**: Shared configuration management.

7. **Reference Modules**
   - **SPL2 Bundle (`src/spl2-bundle`)**: Maintained strictly for legacy benchmarking and referencing.

### Constraints and Forbidden Modules

The following legacy and duplicate modules have been retired in prior phases. **They must not be reintroduced under any circumstances**:

- `src/gc3d`: Replaced by `src/3d-analysis`.
- `src/calc-extended/adv-piperack`: Replaced by `src/piperack`.
- `src/simp-analysis`: Replaced by `src/calc-extended`.
- `src/3d-analysis/ExtendedSolver.js`: Retired permanently without direct 1:1 file replacement.

The automated test `scripts/validate-module-registry.mjs` runs on `npm run check` to ensure these remain permanently excluded.
