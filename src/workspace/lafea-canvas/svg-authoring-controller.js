// src/workspace/lafea-canvas/svg-authoring-controller.js

import {
  contractError, deepFreeze, requireAsciiIdentity,
} from './contracts.js';

export function createSvgAuthoringController({
  getAcceptedSource,
  getCurrentRevision,
  commandGateway,
  compilePreview,
}) {
  if (![getAcceptedSource, getCurrentRevision, compilePreview].every(
    (value) => typeof value === 'function',
  ) || typeof commandGateway?.execute !== 'function') {
    throw contractError('LAFEA_AUTHORING_ADAPTER_REQUIRED');
  }
  let preview = null;

  return Object.freeze({
    begin(intent) {
      if (preview) throw contractError('LAFEA_PREVIEW_ALREADY_ACTIVE');
      validateIntent(intent);
      const baseRevision = getCurrentRevision();
      requireRevision(baseRevision);
      preview = deepFreeze({
        baseRevision,
        intent: copyIntent(intent),
        previewGeometry: null,
      });
    },

    update(pointerState) {
      if (!preview) {
        throw contractError('LAFEA_PREVIEW_NOT_ACTIVE');
      }
      if (!pointerState || typeof pointerState !== 'object' || Array.isArray(pointerState)) {
        throw contractError('LAFEA_POINTER_STATE_REQUIRED');
      }

      preview = deepFreeze({
        ...preview,
        previewGeometry: compilePreview({
          acceptedSource: getAcceptedSource(),
          intent: preview.intent,
          pointerState,
        }),
      });

      return preview;
    },

    cancel() {
      preview = null;
    },

    commit({ operationId, exactAfterValues }) {
      if (!preview) {
        throw contractError('LAFEA_PREVIEW_NOT_ACTIVE');
      }
      requireAsciiIdentity(operationId, 'operationId');
      if (!exactAfterValues || typeof exactAfterValues !== 'object'
        || Array.isArray(exactAfterValues)) {
        throw contractError('LAFEA_AUTHORING_AFTER_VALUES_REQUIRED');
      }

      if (preview.baseRevision !== getCurrentRevision()) {
        throw contractError('LAFEA_AUTHORING_BASE_REVISION_STALE');
      }

      const command = deepFreeze({
        schema: 'LafeaSvgCommand.v2',
        operationId,
        baseRevision: preview.baseRevision,
        operationType: preview.intent.operationType,
        selectedEntityIds: [...preview.intent.selectedEntityIds],
        beforeValues: structuredClone(preview.intent.beforeValues),
        afterValues: structuredClone(exactAfterValues),
      });

      const result = commandGateway.execute(command);
      preview = null;
      return result;
    },

    getPreview: () => preview,
  });
}

function validateIntent(intent) {
  requireAsciiIdentity(intent?.operationType, 'operationType');
  if (!Array.isArray(intent.selectedEntityIds) || !intent.selectedEntityIds.length) {
    throw contractError('LAFEA_AUTHORING_SELECTION_REQUIRED');
  }
  intent.selectedEntityIds.forEach((id, index) => {
    requireAsciiIdentity(id, `selectedEntityIds[${index}]`);
  });
  if (!intent.beforeValues || typeof intent.beforeValues !== 'object'
    || Array.isArray(intent.beforeValues)) {
    throw contractError('LAFEA_AUTHORING_BEFORE_VALUES_REQUIRED');
  }
}

function copyIntent(intent) {
  return {
    operationType: intent.operationType,
    selectedEntityIds: [...intent.selectedEntityIds],
    beforeValues: structuredClone(intent.beforeValues),
  };
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw contractError('LAFEA_AUTHORING_REVISION_INVALID', { value });
  }
}
