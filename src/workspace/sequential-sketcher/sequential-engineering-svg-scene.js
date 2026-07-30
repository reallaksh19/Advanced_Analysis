import {
  createEngineeringScene,
  createEngineeringSceneEntity,
  createPointGeometry,
  createPolylineGeometry,
  createSegmentGeometry,
  freezeJsonValue,
} from './engineering-scene-contracts.js';
import { asciiSort } from './sequential-sketcher-contract.js';

export const SEQUENTIAL_ENGINEERING_SVG_PARITY_SCHEMA = 'SequentialEngineeringSvgParityReport.v1';

function point(value) {
  if (!value || !['x', 'y', 'z'].every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]))) return null;
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function samePoint(left, right) {
  return left && right && left.x === right.x && left.y === right.y && left.z === right.z;
}

function uniquePoints(values) {
  const points = values.map(point).filter(Boolean);
  return points.filter((value, index) => !index || !samePoint(value, points[index - 1]));
}

function lineGeometry(startValue, endValue) {
  const start = point(startValue); const end = point(endValue);
  if (!start || !end) return null;
  return samePoint(start, end) ? createPointGeometry(start) : createSegmentGeometry(start, end);
}

function pathGeometry(values) {
  const points = uniquePoints(values);
  if (!points.length) return null;
  if (points.length === 1) return createPointGeometry(points[0]);
  return points.length === 2 ? createSegmentGeometry(points[0], points[1]) : createPolylineGeometry(points);
}

function propertyId(entityId) { return `ssk:properties:${entityId}`; }

function sceneEntity(input) {
  return createEngineeringSceneEntity({
    id: input.id,
    kind: input.geometry.kind,
    domainType: input.domainType,
    geometry: input.geometry,
    domainRef: input.domainRef,
    propertySetIds: [propertyId(input.id)],
    editCapabilities: [],
    layer: input.layer,
    renderOrder: input.renderOrder,
    contributesToFit: input.contributesToFit,
    metadata: { sequential: input.metadata },
  });
}

export function buildSequentialEngineeringSvgSceneFromTopology(topology, options = {}) {
  const sceneId = String(options.sceneId || 'sequential-scene').trim();
  const projection = options.projection || 'ISO';
  const entities = [];

  (topology.segments || []).forEach((segment) => {
    const fromNode = topology.nodes.find((n) => n.id === segment.fromNodeId);
    const toNode = topology.nodes.find((n) => n.id === segment.toNodeId);
    if (!fromNode || !toNode) return;
    const geom = lineGeometry(fromNode.position, toNode.position);
    if (!geom) return;
    entities.push(sceneEntity({
      id: `ssk:segment:${segment.id}`,
      geometry: geom,
      domainType: 'SEQUENTIAL_CONFIRMED_COMPONENT',
      layer: 'sequential-confirmed',
      renderOrder: 10,
      contributesToFit: true,
      domainRef: { owner: 'sequential-sketcher', category: 'confirmed', componentId: segment.componentId },
      metadata: { category: 'confirmed', status: 'CONFIRMED', segment },
    }));
  });

  (topology.nodes || []).forEach((node) => {
    if (!node.position) return;
    entities.push(sceneEntity({
      id: `ssk:node:${node.id}`,
      geometry: createPointGeometry(node.position),
      domainType: 'SEQUENTIAL_ACTIVE_PORT',
      layer: 'sequential-active-port',
      renderOrder: 30,
      contributesToFit: true,
      domainRef: { owner: 'sequential-sketcher', category: 'node', nodeId: node.id },
      metadata: { category: 'node', status: 'ACTIVE', node },
    }));
  });

  const scene = createEngineeringScene({
    sceneId,
    revision: 'rev-001',
    coordinateSystem: options.coordinateSystem,
    projections: ['ISO', 'XY', 'XZ', 'YZ'],
    entities,
    capabilities: { selection: true, properties: true, parity: true, editing: false },
    metadata: { sequential: { branchId: topology.branchId, visibleProjection: projection } },
  });

  return Object.freeze({ scene, topology });
}
