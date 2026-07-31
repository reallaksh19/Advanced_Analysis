// src/workspace/lafea-canvas/accessible-inspector.js

import {
  RENDERERS, contractError, requireAsciiIdentity,
} from './contracts.js';

export function createAccessibleInspector() {
  return Object.freeze({
    render({ target, scene, selection, renderer }) {
      if (!target?.ownerDocument) {
        throw contractError('LAFEA_INSPECTOR_TARGET_REQUIRED');
      }
      if (!Number.isInteger(scene?.sceneRevision) || scene.sceneRevision < 0
        || !RENDERERS.includes(renderer)) {
        throw contractError('LAFEA_INSPECTOR_SCENE_REQUIRED');
      }
      if (selection?.sourceEntityId !== null && selection?.sourceEntityId !== undefined) {
        requireAsciiIdentity(selection.sourceEntityId, 'selection.sourceEntityId');
        requireAsciiIdentity(selection.entityRole, 'selection.entityRole');
      }

      target.replaceChildren();
      target.setAttribute('role', 'region');
      target.setAttribute('aria-label', 'Accessible Engineering Canvas Inspector');
      const documentRef = target.ownerDocument;

      const statusText = documentRef.createElement('p');
      statusText.textContent = `Scene Revision: ${scene.sceneRevision} | Mode: ${renderer}`;

      const selectionText = documentRef.createElement('p');
      if (selection?.sourceEntityId) {
        selectionText.textContent = `Selected Entity: ${selection.sourceEntityId} (${selection.entityRole})`;
      } else {
        selectionText.textContent = 'No entity selected';
      }

      target.append(statusText, selectionText);
    },
  });
}

export function presentMeshQuality(qualifiedQuality) {
  const statuses = ['OK', 'WARNING', 'BLOCK', 'QUALIFIED', 'BLOCKED'];
  if (!qualifiedQuality || !statuses.includes(qualifiedQuality.status)
    || !Number.isFinite(qualifiedQuality.value)
    || !Number.isFinite(qualifiedQuality.limit)
    || typeof qualifiedQuality.semanticHash !== 'string'
    || !qualifiedQuality.semanticHash) {
    throw contractError('LAFEA_QUALIFIED_MESH_QUALITY_REQUIRED');
  }
  return Object.freeze({
    elementId: qualifiedQuality.elementId,
    status: qualifiedQuality.status,
    metricId: qualifiedQuality.metricId,
    value: qualifiedQuality.value,
    limit: qualifiedQuality.limit,
    units: qualifiedQuality.units,
    sourceHash: qualifiedQuality.semanticHash,
    canSolve: !['BLOCK', 'BLOCKED'].includes(qualifiedQuality.status),
  });
}
