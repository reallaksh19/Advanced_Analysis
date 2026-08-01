/** Shared source-geometry SVG overlay for source and result hybrid viewports. */
import { renderLafeaWorkbenchSvg } from '../lafea-workbench-svg.js';

export function renderLafeaSourceOverlay(input) {
  if (!input?.target?.ownerDocument || !input.scene || !input.registryEntry) {
    throw new TypeError('LAFEA_SOURCE_OVERLAY_INPUT_REQUIRED');
  }
  const geometry = sourceGeometry(
    input.scene,
    input.registryEntry,
    input.editable === true,
  );
  renderLafeaWorkbenchSvg(
    input.target,
    geometry,
    input.editable === true && typeof input.onMoveNode === 'function'
      ? { onMoveNode: input.onMoveNode }
      : {},
    input.viewport,
  );
  bindSourceSelection(
    input.target,
    input.scene,
    input.selection,
    input.onSelectSource,
  );
  return geometry;
}

export function lafeaSourceOverlayGeometry(scene, registryEntry, editable = false) {
  return sourceGeometry(scene, registryEntry, editable);
}

function sourceGeometry(scene, registryEntry, editable) {
  const nodes = scene.sourcePrimitives
    .filter((row) => row.kind === 'SOURCE_POINT')
    .map((row) => ({
      nodeId: row.nodeIds[0],
      x: row.coordinates[0].x,
      y: row.coordinates[0].y,
      z: row.coordinates[0].z,
      sceneEntityId: row.sceneEntityId,
      sourceEntityId: row.sourceEntityId,
      sourcePath: row.sourcePath,
    }));
  const elements = scene.sourcePrimitives
    .filter((row) => row.kind === 'SOURCE_ELEMENT')
    .map((row) => ({
      elementId: row.sourceEntityId,
      nodeIds: [...row.nodeIds],
      nodes: [...row.nodeIds],
      type: 'SOURCE_ELEMENT',
      sceneEntityId: row.sceneEntityId,
      sourceEntityId: row.sourceEntityId,
      sourcePath: row.sourcePath,
    }));
  return Object.freeze({
    nodes: Object.freeze(nodes),
    elements: Object.freeze(elements),
    nodePath: editable ? registryEntry.previewSource.nodePath : null,
  });
}

function bindSourceSelection(target, scene, visibleSelection, onSelectSource) {
  const selectedId = visibleSelection?.sourceEntityId ?? null;
  const bind = (node, sourceEntityId) => {
    const selected = sourceEntityId === selectedId;
    node.dataset.selected = selected ? 'true' : 'false';
    node.classList[selected ? 'add' : 'remove']('lafea-svg-highlighted');
    if (typeof onSelectSource === 'function') {
      node.addEventListener('click', () => onSelectSource(sourceEntityId));
    }
  };
  for (const node of target.querySelectorAll?.('[data-node-id]') ?? []) {
    bind(node, node.dataset.nodeId);
  }
  for (const node of target.querySelectorAll?.('[data-element-id]') ?? []) {
    bind(node, node.dataset.elementId);
  }
  if (selectedId !== null && !scene.sourcePrimitives.some(
    (row) => row.sourceEntityId === selectedId,
  )) {
    throw new TypeError('LAFEA_SOURCE_SELECTION_ENTITY_NOT_IN_SCENE');
  }
}
