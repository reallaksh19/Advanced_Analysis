# 3D Guided Cantilever Certification

## Purpose
This document certifies that the 3D Guided Cantilever module has been finalized as a **Screening** level calculation module. It does not replace full code-compliant pipe stress analysis.

## Required Capabilities Implemented
1. Accepts canonical geometry (or a subset thereof matching the GC payload requirements).
2. Identifies anchors, guides, supports, and free spans based on the provided geometry and node types.
3. Interprets basic thermal load displacements.
4. Produces deterministic, repeatable approximate results.
5. Exposes assumptions, formulas used, and warnings.
6. Returns appropriate diagnostics if the input geometry is missing required data.
7. Has benchmark cases established.

## Result Structure
The module returns a standardized result object containing:
- `moduleId`: "3d-guided-cantilever"
- `engineeringLevel`: "SCREENING"
- `inputs`: The canonical inputs used.
- `formulas`: Trace of key mathematical steps.
- `assumptions`: Engineering assumptions applied.
- `results`: The node and leg stress check values.
- `warnings`: Actionable warnings for out-of-bounds or non-ideal input.
- `diagnostics`: System/schema level diagnostics.
- `visualizationHints`: UI helpers (e.g. `criticalNode`).

## Warnings and Applicability Limits
The module will warn or return failure status if:
- Missing critical parameters (e.g. material, temperature).
- Insufficient geometry (fewer than 2 nodes or 1 segment).
- Missing anchor nodes.
- Geometry indicates invalid dimensions.
