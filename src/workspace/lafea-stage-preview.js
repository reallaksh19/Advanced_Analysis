/**
 * Source-derived visual geometry adapter for LAFEA calculation stages.
 *
 * This module does not manufacture pads, pipe rings, continuum grids, shell
 * cylinders, weld profiles, loads, dimensions, mesh topology or quality
 * evidence. A rendered primitive exists only when an accepted stage document
 * contains the corresponding source entity. The governed stage registry owns
 * the source paths and editability policy.
 */
import { lafeaRegisteredPreviewSource } from './lafea-stage-registry.js';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function identityOf(row) {
  const value = row?.nodeId ?? row?.elementId ?? row?.identity ?? row?.id;
  return typeof value === 'string' && value.trim() ? value : null;
}

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceNode(row, index, nodePath) {
  if (!isRecord(row)) return null;
  const nodeId = identityOf(row);
  if (!nodeId) return null;

  let coordinates = null;
  if (Array.isArray(row.position)) coordinates = row.position;
  else if (Array.isArray(row.point?.value)) coordinates = row.point.value;
  else if (row.x !== undefined && row.y !== undefined) coordinates = [row.x, row.y, row.z];

  if (!coordinates) return null;
  const x = finiteCoordinate(coordinates[0]);
  const y = finiteCoordinate(coordinates[1]);
  const z = coordinates[2] === undefined ? 0 : finiteCoordinate(coordinates[2]);
  if (x === null || y === null || z === null) return null;

  return Object.freeze({
    nodeId,
    x,
    y,
    z,
    sceneEntityId: `SCENE:NODE:${nodeId}`,
    sourceEntityId: nodeId,
    sourcePath: `${nodePath}[${index}]`,
  });
}

function sourceElement(row, index, elementPath, knownNodeIds) {
  if (!isRecord(row)) return null;
  const elementId = identityOf(row);
  if (!elementId) return null;
  const rawNodeIds = Array.isArray(row.nodeIds)
    ? row.nodeIds
    : (Array.isArray(row.nodes) ? row.nodes : []);
  const nodeIds = rawNodeIds.map(String);
  if (nodeIds.length < 2 || nodeIds.some((nodeId) => !knownNodeIds.has(nodeId))) return null;

  return Object.freeze({
    elementId,
    nodeIds: Object.freeze(nodeIds),
    nodes: Object.freeze([...nodeIds]),
    type: typeof row.type === 'string' && row.type ? row.type : 'SOURCE_ELEMENT',
    sceneEntityId: `SCENE:ELEMENT:${elementId}`,
    sourceEntityId: elementId,
    sourcePath: `${elementPath}[${index}]`,
  });
}

function sourceGeometry(nodesInput, elementsInput, nodePath, elementPath, editable = false) {
  const nodes = Array.isArray(nodesInput)
    ? nodesInput.map((row, index) => sourceNode(row, index, nodePath)).filter(Boolean)
    : [];
  const knownNodeIds = new Set(nodes.map((node) => node.nodeId));
  const elements = Array.isArray(elementsInput)
    ? elementsInput
      .map((row, index) => sourceElement(row, index, elementPath, knownNodeIds))
      .filter(Boolean)
    : [];
  return Object.freeze({
    nodes: Object.freeze(nodes),
    elements: Object.freeze(elements),
    nodePath: editable ? nodePath : null,
  });
}

/**
 * Return renderer input backed only by explicit stage-document entities.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} input Accepted stage document.
 * @returns {{nodes: readonly object[], elements: readonly object[], nodePath: string|null}}
 */
export function lafeaPreviewGeometry(stageId, input) {
  const document = isRecord(input) ? input : {};
  const previewSource = lafeaRegisteredPreviewSource(stageId);
  const nodePath = previewSource.nodePath ?? 'nodes';
  const elementPath = previewSource.elementPath ?? 'elements';
  return sourceGeometry(
    previewSource.nodePath ? getAtPath(document, previewSource.nodePath) : [],
    previewSource.elementPath ? getAtPath(document, previewSource.elementPath) : [],
    nodePath,
    elementPath,
    previewSource.editable,
  );
}

function getAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}
