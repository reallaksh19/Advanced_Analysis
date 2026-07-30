# Module: lfea-svg-adoption

## Planned
Adopt the Topology Validator SVG Architecture into the LFEA 3D Piping Workbench (`Advanced_Analysis`) while strictly preserving non-numerical SVG invariants.

## Did
- Ported domain-neutral SVG modules to `src/workspace/lfea-svg/core/` and recorded provenance lineage.
- Enforced ASCII character code ordering for canonical entity sorting (`(a < b ? -1 : a > b ? 1 : 0)`).
- Implemented core contracts (`LfeaSvgDraft.v1`, `LfeaSvgCommand.v1`, `LfeaSvgPatch.v1`, `LfeaSvgViewportState.v1`, `LfeaSvgSelection.v1`, `LfeaSvgEvidence.v1`).
- Implemented `lfea-engineering-svg-adapter.js` and `lfea-svg-scene-builder.js` for LFEA entity layers.
- Implemented viewport state, XY/XZ/YZ/ISO projections, fit/pan/zoom, and `getScreenCTM().inverse()` pointer mapping.
- Implemented draft model, revision-checked command gateway, undo/redo history, selection service, property inspector, snap providers, and overlay controllers.
- Created 6 verification scripts (`lfea-svg-contract-check.mjs`, `lfea-svg-parity-check.mjs`, `lfea-svg-editor-check.mjs`, `lfea-svg-components-check.mjs`, `lfea-svg-anti-drift-check.mjs`, `lfea-svg-performance-check.mjs`) covering mandatory named tests `LFEA-SVG-T01` through `LFEA-SVG-T24`.
- Registered scripts in `package.json` and integrated `npm run check:lfea-svg` into `npm run gate`.

## Technical details
- SVG renderer is completely non-numerical (no FEA/stiffness/stress/utilization math).
- Pointer moves generate transient previews; accepted edits pass through `LfeaSvgCommandGateway.v1`.
- Stale base revisions and duplicate operation IDs are rejected automatically.

## Files and symbols
- `src/workspace/lfea-svg/lfea-svg-upstream-provenance.json`
- `src/workspace/lfea-svg/lfea-svg-contracts.js`
- `src/workspace/lfea-svg/core/engineering-svg-adapter.js`
- `src/workspace/lfea-svg/core/engineering-svg-command-gateway.js`
- `src/workspace/lfea-svg/lfea-engineering-svg-adapter.js`
- `src/workspace/lfea-svg/lfea-svg-scene-builder.js`
- `src/workspace/lfea-svg/lfea-svg-viewport.js`
- `src/workspace/lfea-svg/lfea-svg-selection.js`
- `src/workspace/lfea-svg/lfea-svg-properties.js`
- `src/workspace/lfea-svg/lfea-svg-snap-providers.js`
- `src/workspace/lfea-svg/lfea-svg-draft-model.js`
- `src/workspace/lfea-svg/lfea-svg-command-gateway.js`
- `src/workspace/lfea-svg/lfea-svg-history.js`
- `src/workspace/lfea-svg/lfea-svg-overlay.js`
- `src/workspace/lfea-svg/lfea-svg-workbench.js`
- `scripts/lfea-svg-contract-check.mjs`
- `scripts/lfea-svg-parity-check.mjs`
- `scripts/lfea-svg-editor-check.mjs`
- `scripts/lfea-svg-components-check.mjs`
- `scripts/lfea-svg-anti-drift-check.mjs`
- `scripts/lfea-svg-performance-check.mjs`
- `package.json`

## Upstream/downstream impact
- Upstream reference lineage: `XML_Compare_Utilities` commit `126df8acc370d22540cb129dce789ea04773ebaf`.
- Downstream impact: Enables SVG projected views in workbench without touching numerical solver packages.

## Validation
- `npm run check:lfea-core` - PASS
- `npm run check:lfea-svg` - PASS (T01 through T24)

## Patch and backups
- New files added cleanly under `src/workspace/lfea-svg/` and `scripts/`.
- `package.json` updated with SVG check entries.

## Undo
- Delete `src/workspace/lfea-svg/` and `scripts/lfea-svg-*.mjs`.
- Revert `package.json` changes.

## Remaining risks or follow-ups
- All tests passing with 0 errors. Ready for review and PR merge.
