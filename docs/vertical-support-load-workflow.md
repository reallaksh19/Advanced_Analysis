# Vertical support-load workflow

Simplified Analysis imports `json-viewer-selection/v1`, adapts flat `enrichedAttributes` into the isolated calculation workspace, and evaluates element weights without hidden engineering fallbacks.

## Explicit weight rules

- Pipe metal: source kg/m, or `π/4 × (OD² − ID²) × 1e-6 × material density` when all terms exist.
- OPE/HYD fluid: evaluated independently from explicit per-metre weight or density and inside diameter.
- Insulation: explicit per-metre weight, or annular area and explicit insulation density. Source thickness zero is a valid zero.
- Components: valves, flanges, fittings, gaskets, instruments, and olets require explicit component weight.

Missing values remain `null` with diagnostics. HYD never copies OPE. Missing insulation density never becomes 200 kg/m³. Missing component weight never becomes zero.

## Distribution

Engineering results use `CHAINAGE_TRIBUTARY_SPAN_V2`. Line-load ranges are split at support chainages; each partial uniform load acts at its overlap centroid and is reacted to bracketing supports by the static lever rule. Lump component weight acts at component chainage. Supports require explicit position, chainage, and vertical capability.

`NEAREST_TWO_SUPPORT_LEVER_V1` remains identified as **SCREENING ONLY** and is never selected silently.

The visible configuration supplies gravity and project load factor. The interface exposes every active profile value through the Config tab and information tooltip.

## Outputs

- Support table with OPE/HYD kg and N, contribution count, and contribution audit.
- Independent OPE/HYD COG and excluded-element lists.
- Load-result JSON.
- Managed stagedJson with `LOADMARKER` nodes, support identity, position, OPE/HYD values, method, timestamp, contributing element IDs, diagnostics, and `FALLBACK_USED: false`.

## Verified benchmark

`C:\Code3\Vertical load benchmark` contains 24 weighted elements and six supports. The integration test compares every expected support OPE/HYD reaction and total mass at tolerances of 1e-6 kg and 1e-3 N.
