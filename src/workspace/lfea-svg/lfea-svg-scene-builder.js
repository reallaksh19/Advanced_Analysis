/**
 * LFEA SVG Scene Builder
 * Constructs projected scene primitives for LFEA entity layers.
 */
import { asciiSort } from './lfea-svg-contracts.js';

export const LFEA_SVG_SCENE_BUILDER_SCHEMA = 'LfeaSvgSceneBuilder.v1';

export function project3DPoint(point, projection = 'ISO') {
  const x = Number(point?.x) || 0;
  const y = Number(point?.y) || 0;
  const z = Number(point?.z) || 0;

  switch (projection) {
    case 'XY':
      return { px: x, py: -y };
    case 'XZ':
      return { px: x, py: -z };
    case 'YZ':
      return { px: y, py: -z };
    case 'ISO':
    default: {
      const cos30 = 0.8660254037844386; // Math.cos(Math.PI / 6)
      const sin30 = 0.5;
      const px = (x - y) * cos30;
      const py = -z + (x + y) * sin30;
      return { px, py };
    }
  }
}

export function createPrimitive({
  layer = 'source',
  type = 'line',
  sceneEntityId,
  sourceEntityId,
  points = [],
  attributes = {},
  metadata = {},
}) {
  if (!sceneEntityId || !sourceEntityId) {
    throw new TypeError('Primitives require sceneEntityId and sourceEntityId.');
  }
  return Object.freeze({
    layer,
    type,
    sceneEntityId,
    sourceEntityId,
    points: Object.freeze(points.map((p) => Object.freeze({ ...p }))),
    attributes: Object.freeze({ ...attributes }),
    metadata: Object.freeze({ ...metadata }),
  });
}

export function buildLfeaSvgScene({
  nodes = [],
  elements = [],
  components = [],
  supports = [],
  loads = [],
  codePoints = [],
  results = null,
  projection = 'ISO',
} = {}) {
  const primitives = [];

  // 1. Source Nodes & Pipe Spans
  const sortedElements = asciiSort(elements.map((e) => e.id || e.elementId || ''));
  const elementMap = new Map(elements.map((e) => [e.id || e.elementId, e]));

  sortedElements.forEach((elemId) => {
    const elem = elementMap.get(elemId);
    if (!elem) return;
    const n1 = nodes.find((n) => (n.id || n.nodeId) === elem.node1 || (n.id || n.nodeId) === elem.nodeI);
    const n2 = nodes.find((n) => (n.id || n.nodeId) === elem.node2 || (n.id || n.nodeId) === elem.nodeJ);
    if (n1 && n2) {
      const p1 = project3DPoint(n1, projection);
      const p2 = project3DPoint(n2, projection);
      primitives.push(createPrimitive({
        layer: 'source',
        type: 'line',
        sceneEntityId: `scene-elem-${elemId}`,
        sourceEntityId: elemId,
        points: [p1, p2],
        attributes: { stroke: '#3b82f6', strokeWidth: '2' },
        metadata: { entityType: elem.type || 'PIPE', sectionId: elem.sectionId },
      }));
    }
  });

  // 2. Components (BEND, TEE, REDUCER, RIGID)
  components.forEach((comp) => {
    const cId = comp.id || comp.componentId;
    if (!cId) return;
    primitives.push(createPrimitive({
      layer: 'components',
      type: comp.type === 'BEND' ? 'path' : 'group',
      sceneEntityId: `scene-comp-${cId}`,
      sourceEntityId: cId,
      points: [],
      attributes: { stroke: '#ec4899', strokeWidth: '2' },
      metadata: { componentType: comp.type },
    }));
  });

  // 3. Supports & Loads
  supports.forEach((supp) => {
    const sId = supp.id || supp.supportId;
    if (!sId) return;
    primitives.push(createPrimitive({
      layer: 'supports',
      type: 'glyph',
      sceneEntityId: `scene-supp-${sId}`,
      sourceEntityId: sId,
      points: [],
      attributes: { fill: '#10b981' },
      metadata: { supportType: supp.type },
    }));
  });

  loads.forEach((ld) => {
    const lId = ld.id || ld.loadId;
    if (!lId) return;
    primitives.push(createPrimitive({
      layer: 'loads',
      type: 'arrow',
      sceneEntityId: `scene-load-${lId}`,
      sourceEntityId: lId,
      points: [],
      attributes: { stroke: '#f59e0b' },
      metadata: { loadType: ld.type },
    }));
  });

  return Object.freeze({
    schema: 'LfeaSvgScene.v1',
    projection,
    primitives: Object.freeze(primitives),
    layerOrder: Object.freeze([
      'construction', 'source', 'conditioned', 'components',
      'supports', 'loads', 'code-points', 'results', 'selection', 'diagnostics',
    ]),
  });
}
