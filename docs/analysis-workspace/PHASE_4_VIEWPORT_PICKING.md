# Analysis Workspace Phase 4 — Viewport Picking

## Status

Phase 4 adds read-only entity picking and synchronizes selection across Tree, Viewport, and Properties. It does not add model editing, transform controls, mesh reconstruction, or solver execution.

## Selection ownership

`WorkspaceState` remains the only selection-state owner.

```text
Tree click or viewport hit
  -> viewport:selectionRequested
  -> DatasetController
  -> WorkspaceState.selectEntity()
  -> workspace:snapshotChanged
  -> viewport:entitySelected
  -> Tree + Viewport + Properties
```

The command and notification topics are intentionally different:

- `viewport:selectionRequested` asks the state owner to select a real dataset entity.
- `viewport:entitySelected` informs decoupled consumers about the resolved canonical entity.

A direct `viewport:entitySelected` publication remains supported for the Phase 1 DevTools verification path, but it does not mutate `WorkspaceState`.

## Picking backends

### Canvas 2D

Canvas picking uses the same deterministic projection as rendering. A pure hit-test module computes the minimum CSS-pixel distance to:

- projected line segments;
- projected point markers.

Only hits within the configured tolerance produce a selection request. Empty-space clicks preserve the current selection.

### Three.js

The WebGL backend uses `THREE.Raycaster` against the render objects produced from `ViewportRenderModel.v1`.

- Lines use a model-scale-aware raycast threshold.
- Point markers use mesh intersections.
- A small pointer-travel threshold separates clicks from OrbitControls navigation.
- The backend resolves only the `entityId` stored in render-object trace metadata.

## Panel responsibilities

### Tree

- Publishes `viewport:selectionRequested` with source `tree`.
- Renders selection from `workspace:snapshotChanged`.
- Adds `aria-current="true"` and a selected class without rebuilding hierarchy.
- Opens collapsed ancestor groups for the selected row.

### Viewport

- Converts backend pick callbacks into `viewport:selectionRequested` with source `viewport`.
- Applies canonical selection without rebuilding the render model or replacing the canvas.
- Continues to own Fit View and Reset View only.

### Properties

- Continues to consume `viewport:entitySelected`.
- Resolves canonical dataset properties from `WorkspaceState` when available.
- Does not request or mutate selection.

## Lifecycle

Both backends remove:

- pointer listeners;
- selection callbacks;
- projected or raycast state;
- ResizeObserver;
- animation frames;
- OrbitControls;
- geometries, materials, renderer, and WebGL context where applicable.

Dataset clear removes selection and pickable model state. Workspace destruction removes every EventBus subscription and canvas.

## Guardrails

- No renderer import of `WorkspaceState`.
- No panel-to-panel DOM mutation.
- No React or Zustand import in `src/workspace`.
- No runtime JavaScript module above 300 lines.
- No empty-click deselection in this phase.
- No canvas picking of skipped/non-renderable entities.
- No editing, dragging, snapping, or engineering calculation execution.

## Verification

```bash
npm run check:phase4-workspace:static
npm run check:phase4-workspace:browser
npm run check:workspace-browser
```

The static gate certifies event semantics, state ownership, deterministic point/segment hit testing, raycast wiring, module size, root scoping, and listener cleanup. The browser gate certifies Tree selection, Canvas point/segment picks, empty-click retention, direct-notification compatibility, clear, and full teardown.
