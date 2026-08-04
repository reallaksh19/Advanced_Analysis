# Topology Edit Phase B — Deterministic Snapping Architecture

## Scope

This increment implements the Phase B snapping foundation only:

- immutable snap query, candidate and result contracts;
- bounded spatial indexing for nodes, ports and edge segments;
- node, port, centerline, midpoint, grid, orthogonal and collinear candidates;
- screen-space acquisition with world-space engineering geometry;
- hard filtering for disabled kinds, exclusions, hidden state, locked state and incompatibility;
- deterministic ranking and total tie-breaking;
- acquisition/release hysteresis;
- deterministic candidate cycling;
- stale-result rejection against dataset, basis, session, selection, interaction and query identity;
- Zustand-owned snap interaction summaries and persisted user preferences;
- real Chromium/WebGL qualification and structured evidence.

Deferred: component-family compatibility authored by the Phase C HUD, tangent/branch-clocking/component-face/support-axis candidates, worker offload, and gizmo command commits beyond the existing governed interaction path.

## Architecture assessment

### Selection ownership

`TopologyEditSelectionCoordinator` and `TopologyEditEditorStore.selection` are the single semantic selection authority. Viewport, tree, search and HUD are projections. Phase B reads the current selection revision and excluded canonical IDs; it does not create another selection store.

### Canonical topology ownership

`TopologyEditCertifiedSession.currentTopology()` remains authoritative for nodes, edges, connectivity and canonical hashes. Snapping consumes immutable topology projections and never mutates topology.

### Command and transaction path

The existing interaction controller creates display-only previews. Accepted movement continues through the governed transform intent, planning, certification, atomic session transaction and journal. A snap result only resolves an intended geometric target; it is not itself an engineering command.

### Catalogue path

Catalogue authority is unchanged. Phase B exposes compatibility fields and hard filtering but does not invent component catalogue rules. Phase C/D will supply operation-specific compatibility classifications.

### Tree action path

Tree rows publish canonical selection intent through the Phase A coordinator. Phase B only consumes the resulting selection identity and revision.

### WebGL picking path

The production Three.js viewport adapter owns pointer capture, ray construction and camera snapshots. Phase B adds CSS-pixel pointer coordinates and a frozen camera snapshot to snap queries. Three.js remains a display/input projection.

### Undo/Redo authority

The certified session journal remains the only engineering Undo/Redo authority. Snap state is disposable UI state and is reset on dataset, basis, selection or interaction changes.

## Existing gap

The pre-Phase-B resolver scans the full topology for every pointer update, applies a fixed world-distance tolerance, lacks dataset/session/query identities, has no port contract, hidden/locked filtering, screen-space ranking, hysteresis, cycling or stale asynchronous acceptance contract.

## Proposed change map

| File | Existing responsibility | Proposed responsibility | Tests |
|---|---|---|---|
| `topology-edit-snap-contract.js` | new | versioned query/candidate/result schemas, validation, hashing and current-result acceptance | snap contract/engine tests |
| `topology-edit-snap-spatial-index.js` | new | immutable uniform-grid point/segment index and bounded corridor queries | spatial-index tests |
| `topology-edit-deterministic-snap-engine.js` | new | candidate generation, filtering, projection, ranking, hysteresis and cycling | deterministic-engine tests |
| `topology-edit-snap-collector.js` | full-model legacy collector | production adapter that caches an index per canonical basis and delegates to the deterministic engine while retaining legacy API compatibility | existing collector tests plus integration |
| `topology-edit-interaction-viewport-adapter.js` | pointer/ray/gizmo adapter | publish CSS-pixel pointer and immutable camera snapshots with drag events | adapter/browser qualification |
| `topology-edit-interaction-controller-runtime.js` | live gizmo preview orchestration | own snap interaction/query identities, index lifecycle, store summaries and stale-result rejection | integration/browser qualification |
| `topology-edit-interaction-preview.js` | display-only movement preview | accept both legacy resolutions and Phase B snap results | preview tests |
| `topology-edit-editor-store.js` | Phase A UI state | governed snap summaries, candidate-set cycling, preference updates and reset conditions | editor-store tests |
| `topology-edit-gizmo-three-renderer.js` | gizmo/preview marker | render an explicit snap indicator without making it pickable or authoritative | browser qualification |
| Phase B unit/e2e/workflow files | new | exact-head deterministic and real-WebGL qualification | exact-head workflow |

## Contract proposal

### Snap query

`TopologyEditSnapQuery.v1` binds:

- `datasetSourceHash`;
- `basisHash`;
- `sessionVersion`;
- `selectionRevision`;
- `interactionId`;
- `queryId` and `querySequence`;
- pointer screen coordinates in CSS pixels;
- raw world point;
- camera projection snapshot;
- interaction constraint;
- enabled kinds and exclusions;
- acquisition/release radii;
- active candidate and cycle index.

### Snap candidate

`TopologyEditDeterministicSnapCandidate.v1` records:

- stable candidate identity and full semantic hash;
- kind and canonical target IDs;
- exact world point;
- screen/world distance and constraint residual;
- compatibility classification;
- operation priority and stable tie-breaker;
- source feature and label.

### Snap result

`TopologyEditSnapResult.v1` copies the complete query identity and records:

- status;
- selected candidate and snapped point;
- score tuple;
- candidate-set hash/count;
- cycle index;
- hysteresis retention;
- bounded-query statistics.

A result is accepted only when all six identity fields and query sequence match the active interaction.

## Operation sequence

```text
pointer move
  -> viewport adapter freezes pointer/camera snapshot
  -> runtime creates identity-bound SnapQuery
  -> cached basis index performs bounded corridor lookup
  -> engine generates and hard-filters candidates
  -> engine applies active-candidate release hysteresis
  -> otherwise deterministic total ordering and cycle selection
  -> runtime rejects stale result identities
  -> Zustand stores only compact active-result/candidate metadata
  -> preview renderer draws display-only target and snap indicator
  -> governed command path remains unchanged
```

## State ownership

| State | Owner | Reset |
|---|---|---|
| canonical nodes/edges/connectivity | certified topology session | transaction/dataset lifecycle |
| spatial snap index | interaction runtime, outside Zustand | canonical basis change/deactivate |
| query ray, camera matrices, per-move candidate arrays | runtime local variables | every query/end/cancel |
| active snap summary, candidate count, cycle index | Zustand snapping slice | identity/candidate-set change/end/cancel |
| enabled kinds, grid spacing, acquire/release radii | Zustand preferences | user preference reset only |
| preview meshes/markers | Three.js transient group | each render/end/cancel |

## Acceptance checks

- deterministic result under source/index/candidate reordering;
- exact tie resolves through stable semantic ordering;
- acquire/release hysteresis prevents flicker;
- hidden, locked, excluded and incompatible targets are absent before scoring;
- screen tolerance remains stable under zoom and perspective depth;
- node, port, centerline, midpoint, grid, orthogonal and collinear candidates are covered;
- candidate cycling is stable and resets on material candidate-set change;
- stale dataset/basis/session/selection/interaction/query results are rejected;
- bounded query statistics prove no per-pointer whole-model scan;
- existing professional interaction and 3D Edit audit remain green;
- real Chromium/WebGL evidence is uploaded for the exact PR head.

## Rollback boundary

The increment changes no canonical topology schema, command schema, catalogue schema, transaction schema or journal authority. Rollback removes the Phase B modules and restores the legacy collector adapter; committed engineering data requires no migration.
