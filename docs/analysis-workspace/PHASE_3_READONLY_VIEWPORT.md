# Analysis Workspace Phase 3 — Read-only Viewport

## Status

Phase 3 adds a read-only engineering viewport driven by normalized workspace snapshots. It does not add canvas picking, object editing, solver execution, or high-fidelity RVM primitive reconstruction.

## Canonical pipeline

```text
Imported package
→ normalizeWorkspaceDataset()
→ analysis-workspace-dataset/v1
→ WorkspaceState snapshot
→ buildViewportRenderModel()
→ viewport-render-model/v1
→ ViewportRenderer
    → ThreeViewportBackend
    → Canvas2DViewportBackend fallback
```

The renderer never receives a raw package and does not know the source package schema.

## Geometry evidence

Dataset normalization preserves only bounded, solved coordinate evidence:

```text
properties.geometry.start
properties.geometry.end
properties.geometry.center
```

Coordinates may be derived from native start/end/center values, APOS/LPOS/CENTER attributes, coordinate component fields, or a start-plus-delta representation.

Entities with start and end coordinates become render segments. Entities with only a center become point markers. Entities without valid coordinates remain in the dataset and hierarchy but are listed as skipped in the render model.

## ViewportRenderModel.v1

The immutable render contract contains:

- dataset identity;
- traceable entity IDs and categories;
- segment or point primitive intent;
- solved coordinates;
- model bounds and center;
- renderable, skipped, segment, and point counts;
- skipped entity IDs.

It contains no DOM nodes, Three.js classes, mutable vectors, materials, cameras, or controls.

## Renderer lifecycle

Every backend implements:

```text
mount(host)
renderModel(model)
setSelection(entityId)
fitView()
resetView()
resize()
clear()
destroy()
```

The Three.js backend owns and disposes its renderer, context, camera, controls, animation frame, ResizeObserver, geometries, and materials. WebGL construction failure is caught by the facade and replaced with a deterministic Canvas 2D renderer.

## Selection behavior

Tree selection remains the source of selection events. The viewport highlights the matching render item but does not publish selection from the canvas in this phase. A selection-only workspace snapshot does not rebuild the render model or replace the canvas.

## Failure behavior

An invalid dataset import does not mutate WorkspaceState and does not replace the last valid render model. The viewport reports the import failure while retaining the existing scene and canvas instance.

## Navigation

The WebGL backend uses OrbitControls for read-only rotation, pan, and zoom. Both backends support scoped Fit View and Reset View actions. No navigation command mutates engineering data.

## Certification

```bash
npm run check:phase3-workspace:static
npm run check:phase3-workspace:browser
npm run check:workspace-browser
```

Static gates enforce the render schema, deterministic coordinate derivation, immutable contracts, module size, no global panel selectors, no React/Zustand import, backend fallback, and explicit disposal. Browser gates cover real import, canvas creation, render/skipped counts, selection without rebuild, Fit/Reset, retained rendering after invalid imports, clear, destroy, and automatic backend selection.
