# Developer Guide

## Canonical Geometry
* The canonical geometry serves as the strict backbone across all modules. It is strictly the sole interface by which parsing routines, calculators, visualizers, and reporters interchange model data.
* Entities within canonical geometry (nodes, segments, supports, components) require unique identification and must be reliably validated before passing to calculators.

## Solver Design Rules
* **No `Math.random()` or Hidden Outputs:** All formulas must be explicit, trackable, and deterministic. Under no circumstances should calculations return demo values.
* **Warning Bubbling:** Solvers must check boundaries (ranges, missing data like properties or boundary conditions) and emit explicitly coded severity warnings or structural diagnostics rather than silently omitting issues.
* **Clear Disclosure:** The results format from 2D, 3D, and Piperack modules must include `formulas`, `assumptions`, and `units` keys to support report serialization.
* **Do Not Claim Stress Analysis Verification:** Solvers must strictly adhere to the engineering levels set out in the Core Specifications: **Screening**, **Design Aid**, **Data Interface**, or **Reference**.

## Testing & Benchmarks
* Unit tests, end-to-end user workflows via Playwright, and deterministic regression benchmark tests are strictly enforced.
* Add benchmarks against known fixtures (`PENDING_NUMERIC_EXTRACTION` must be resolved during the pipeline validation).

## Code Structure Constraints
* Read module structures using the module registry `src/config/moduleRegistry.js`. Obsolete endpoints have been permanently removed and cannot be reintroduced.
* No blanket conflict resolution tools (like `--ours` or `--theirs`) during merging.
