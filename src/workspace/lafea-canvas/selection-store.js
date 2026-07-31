// src/workspace/lafea-canvas/selection-store.js

import {
  SCHEMAS, contractError, deepFreeze, requireAsciiIdentity,
} from './contracts.js';

export function createLafeaSelectionStore() {
  let state = emptySelection(0);
  const listeners = new Set();

  function publish(next) {
    state = deepFreeze(next);
    listeners.forEach((listener) => listener(state));
  }

  return Object.freeze({
    getSnapshot: () => state,

    selectSource({ sceneRevision, sourceEntityId }) {
      requireRevision(sceneRevision);
      requireAsciiIdentity(sourceEntityId, 'sourceEntityId');
      publish({
        sceneRevision,
        sourceEntityId,
        meshEntityId: null,
        entityRole: 'SOURCE',
      });
    },

    selectMeshPick({ visibleSceneRevision, pick, pickMap }) {
      requireRevision(visibleSceneRevision);
      if (pickMap?.schema !== SCHEMAS.pickMap || !Array.isArray(pickMap.entries)) {
        throw contractError('LAFEA_PICK_MAP_INVALID');
      }
      if (!pick || typeof pick !== 'object' || Array.isArray(pick)
        || typeof pick.drawGroup !== 'string'
        || !Number.isInteger(pick.primitiveIndex) || pick.primitiveIndex < 0) {
        throw contractError('LAFEA_GPU_PICK_INVALID');
      }
      if (pickMap.sceneRevision !== visibleSceneRevision) {
        throw contractError('LAFEA_STALE_PICK_MAP_REJECTED');
      }

      pickMap.entries.forEach(requirePickMapEntry);
      const entry = pickMap.entries.find(
        (row) =>
          row.drawGroup === pick.drawGroup &&
          pick.primitiveIndex >= row.primitiveStart &&
          pick.primitiveIndex < row.primitiveEnd,
      );

      if (!entry) {
        throw contractError('LAFEA_GPU_PICK_UNRESOLVED', { pick });
      }
      requireAsciiIdentity(entry.sourceEntityId, 'pickMap.sourceEntityId');
      requireAsciiIdentity(entry.meshEntityId, 'pickMap.meshEntityId');
      requireAsciiIdentity(entry.entityRole, 'pickMap.entityRole');

      publish({
        sceneRevision: visibleSceneRevision,
        sourceEntityId: entry.sourceEntityId,
        meshEntityId: entry.meshEntityId,
        entityRole: entry.entityRole,
      });
    },

    clear(sceneRevision) {
      requireRevision(sceneRevision);
      publish(emptySelection(sceneRevision));
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw contractError('LAFEA_SELECTION_LISTENER_REQUIRED');
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw contractError('LAFEA_SCENE_REVISION_INVALID', { value });
  }
}

function emptySelection(sceneRevision) {
  return {
    sceneRevision,
    sourceEntityId: null,
    meshEntityId: null,
    entityRole: null,
  };
}

function requirePickMapEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)
    || typeof entry.drawGroup !== 'string'
    || !Number.isInteger(entry.primitiveStart) || entry.primitiveStart < 0
    || !Number.isInteger(entry.primitiveEnd)
    || entry.primitiveEnd <= entry.primitiveStart) {
    throw contractError('LAFEA_PICK_MAP_ENTRY_INVALID', { index });
  }
  requireAsciiIdentity(entry.sourceEntityId, `pickMap.entries[${index}].sourceEntityId`);
  requireAsciiIdentity(entry.meshEntityId, `pickMap.entries[${index}].meshEntityId`);
  requireAsciiIdentity(entry.entityRole, `pickMap.entries[${index}].entityRole`);
}
