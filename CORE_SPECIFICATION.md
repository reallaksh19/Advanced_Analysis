# Core Specification

## Purpose
The Simplified Analysis app is a React/Vite-based piping engineering simplified calculation suite. It is built to offer Screening, Design Aid, Reference, or Data Interface capabilities for 2D/3D calculations, canonical geometry mapping, PCF import/export, and pipe-rack/loop layouts.

## Engineering Limitations
**This application does NOT perform formal code-compliant pipe stress analysis.** All modules must explicitly disclose formulas, units, assumptions, and limits. The app provides warnings when outside calculation bounds, and under no circumstance should any calculation use hidden values, `Math.random()`, demo results, or silent solver switching.

## Architecture Guidelines
* **Canonical Geometry as Backbone:** Canonical geometry (as implemented in `src/core/geometry`) is the stable internal data layer that ties together PCF import, calculations, and reporting.
* **Module Ownership:** The codebase enforces strict separation of modules based on their designated "Level" (e.g. SCREENING, DESIGN_AID_SCREENING, or REFERENCE).
* **No Legacy Code:** The registry enforces the exclusion of old modules, including:
  * `src/gc3d`
  * `src/calc-extended/adv-piperack`
  * old product-surface `src/simp-analysis`
  * `src/3d-analysis/ExtendedSolver.js`
* **Benchmarks & Regression:** Each solver logic has an associated set of numeric regression checks, driven by either verified SPL2 outputs, hand calculations, or pending benchmark stubs.
