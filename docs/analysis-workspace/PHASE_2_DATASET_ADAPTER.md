# Analysis Workspace Phase 2 Dataset Adapter

## Status

Phase 2 replaces the Phase 1 mock dataset with real JSON package import and a framework-neutral state boundary. It does not add WebGL rendering or execute engineering solvers.

## Data flow

```text
Tree file input
  -> dataset:loadRequested
  -> DatasetController
  -> normalizeWorkspaceDataset()
  -> WorkspaceState.loadDataset()
  -> workspace:snapshotChanged
  -> dataset:loaded
  -> Tree / Viewport / Properties subscribers
```

Invalid package adaptation publishes `dataset:loadFailed` and leaves the previous valid `WorkspaceState` snapshot unchanged.

## State ownership

`WorkspaceStateStore` is the only mutable workspace owner. It exposes:

- `loadDataset(dataset)`
- `clearDataset()`
- `selectEntity(entityId)`
- `getSnapshot()`
- `getEntity(entityId)`

Snapshots and normalized datasets are deeply frozen. Panel controllers never import Zustand and never mutate each other.

## Supported package shapes

- `rvm-selected-geometry-workspace-package/v1`
- `inputxml-managed-stage/v1`
- `json-viewer-selection/v1` selected-item packages
- raw managed-stage arrays

The adapter projects source objects into `analysis-workspace-dataset/v1` with deterministic identity, normalized pipe/support selection type, immutable properties, hierarchy, and summary counts.

## Projection modules

- `dataset-adapter.js`: schema detection and entity normalization
- `dataset-hierarchy.js`: source-path hierarchy projection
- `dataset-types.js`: pipe/support classification
- `property-flattener.js`: bounded dynamic-property rows
- `workspace-state.js`: immutable dataset and selection snapshots
- `dataset-controller.js`: command/event orchestration

Each JavaScript module remains at or below 300 lines.

## Panel behavior

### Tree

- Provides native JSON file input and clear action.
- Renders real normalized hierarchy only.
- Uses delegated root-scoped events.
- Publishes selection without touching other panels.
- Retains the previous valid tree when an import fails.

### Viewport placeholder

- Shows dataset identity, entity count, selection, and analysis-request status.
- Remains a non-WebGL host in Phase 2.

### Properties

- Resolves imported entities from `WorkspaceState`.
- Falls back to direct EventBus payloads for DevTools verification.
- Flattens nested fields with a 240-row cap.
- Publishes contextual analysis requests without invoking a solver.

## Verification

```bash
npm run check:phase2-workspace:static
npm run check:phase2-workspace:browser
npm run check:workspace-browser
```

Checks enforce schema adaptation, immutable state, invalid-import retention, root-scoped DOM access, no Zustand imports under `src/workspace`, module-size limits, real browser import, selection, clear, and teardown behavior.
