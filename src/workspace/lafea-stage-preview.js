/**
 * Source-derived visual geometry adapter for LAFEA calculation stages.
 *
 * This module does not manufacture pads, pipe rings, continuum grids, shell
 * cylinders, weld profiles, loads, dimensions, mesh topology or quality
 * evidence. A rendered primitive exists only when an accepted stage document
 * contains the corresponding source entity.
 */

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
    sceneEntityId: `SCENE:${nodePath}[${index}]`,
    sourceEntityId: `${nodePath}[${index}]`,
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
    sceneEntityId: `SCENE:${elementPath}[${index}]`,
    sourceEntityId: `${elementPath}[${index}]`,
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

  if (stageId === 'LAFEA.1') {
    return sourceGeometry(
      document.loadReferencePoints,
      [],
      'loadReferencePoints',
      'loadReferenceElements',
    );
  }

  if (stageId === 'LAFEA.2') {
    return sourceGeometry(document.nodes, document.elements, 'nodes', 'elements');
  }

  if (stageId === 'LAFEA.3' || stageId === 'LAFEA.4') {
    return sourceGeometry(document.nodes, document.elements, 'nodes', 'elements', true);
  }

  if (stageId === 'LAFEA.5') {
    return sourceGeometry(
      document.shellTemplate?.nodes,
      document.shellTemplate?.elements,
      'shellTemplate.nodes',
      'shellTemplate.elements',
      true,
    );
  }

  if (stageId === 'LAFEA.6') {
    return sourceGeometry(document.nodes, document.elements, 'nodes', 'elements');
  }

  return sourceGeometry([], [], 'nodes', 'elements');
}
