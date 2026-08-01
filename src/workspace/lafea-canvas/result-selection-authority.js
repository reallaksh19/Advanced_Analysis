/**
 * Result-selection bridge over the existing revision-checked selection store.
 *
 * GPU output remains a draw primitive. Engineering identity is resolved only
 * through the current V2 pick map and exact source-scene identity set.
 */
import { SCHEMAS, contractError } from './contracts.js';
import { createLafeaSelectionStore } from './selection-store.js';

export function createLafeaResultSelectionAuthority({
  sceneRevision,
  sourceScene,
  pickMap,
  initialSelection,
}) {
  if (!Number.isInteger(sceneRevision) || sceneRevision < 0
    || sourceScene?.sceneRevision !== sceneRevision
    || !Array.isArray(sourceScene?.sourcePrimitives)) {
    throw contractError('LAFEA_RESULT_SELECTION_SCENE_INVALID');
  }
  const sourceEntityIds = new Set(
    sourceScene.sourcePrimitives.map((entry) => entry.sourceEntityId),
  );
  const governedPickMap = validatePickMap(pickMap, sceneRevision, sourceEntityIds);
  const store = createLafeaSelectionStore();

  function selectSource(sourceEntityId) {
    if (!sourceEntityIds.has(sourceEntityId)) {
      throw contractError('LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID');
    }
    store.selectSource({ sceneRevision, sourceEntityId });
    return store.getSnapshot();
  }

  function selectMeshPick(pick) {
    if (governedPickMap === null) {
      throw contractError('LAFEA_RESULT_SELECTION_PICK_MAP_UNAVAILABLE');
    }
    store.selectMeshPick({
      visibleSceneRevision: sceneRevision,
      pick,
      pickMap: governedPickMap,
    });
    return store.getSnapshot();
  }

  function clear() {
    store.clear(sceneRevision);
    return store.getSnapshot();
  }

  initialize(initialSelection);

  return Object.freeze({
    getSelection: store.getSnapshot,
    selectSource,
    selectMeshPick,
    clear,
    subscribe: store.subscribe,
  });

  function initialize(value) {
    if (!value || value.sourceEntityId === null) {
      clear();
      return;
    }
    if (value.meshEntityId === null) {
      selectSource(value.sourceEntityId);
      return;
    }
    if (governedPickMap === null) {
      throw contractError('LAFEA_RESULT_SELECTION_INITIAL_PICK_MAP_UNAVAILABLE');
    }
    const entry = governedPickMap.entries.find((candidate) =>
      candidate.sourceEntityId === value.sourceEntityId
      && candidate.meshEntityId === value.meshEntityId
      && candidate.entityRole === value.entityRole);
    if (!entry) {
      throw contractError('LAFEA_RESULT_SELECTION_INITIAL_IDENTITY_UNRESOLVED');
    }
    selectMeshPick({
      drawGroup: entry.drawGroup,
      primitiveIndex: entry.primitiveStart,
    });
  }
}

function validatePickMap(value, sceneRevision, sourceEntityIds) {
  if (value === null || value === undefined) return null;
  if (value.schema !== SCHEMAS.pickMap
    || value.sceneRevision !== sceneRevision
    || !Array.isArray(value.entries)) {
    throw contractError('LAFEA_RESULT_SELECTION_PICK_MAP_INVALID');
  }
  for (const entry of value.entries) {
    if (!sourceEntityIds.has(entry?.sourceEntityId)) {
      throw contractError('LAFEA_RESULT_SELECTION_SOURCE_ID_UNRESOLVED');
    }
  }
  return value;
}
