import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertGraphOpenEndpoint,
  routeContext,
} from '../professional/topology-edit-route-operation-helpers.js';
import { assertConnectEndpointsIntent } from './topology-edit-connect-endpoints-intent.js';

export const CONNECT_ENDPOINTS_PLAN_SCHEMA = 'TopologyEditConnectEndpointsPlan.v1';
const TOLERANCE = 1e-8;
const NUMERIC_FIELDS = new Set(['nominalSizeMm', 'outsideDiameterMm', 'wallThicknessMm']);
const ENGINEERING_FIELDS = Object.freeze([
  'nominalSizeMm', 'outsideDiameterMm', 'schedule', 'wallThicknessMm',
  'materialSpecification', 'pipingClass', 'pressureClass',
]);

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditConnectEndpointsPlan: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) fail('session must be a TopologyEditCertifiedSession.', TypeError);
  value.assertUsable();
  return value;
}
function revision(kind, record) { return semanticHash({ kind, record }); }
function point(value) {
  const result = { x: Number(value?.x), y: Number(value?.y), z: Number(value?.z) };
  if (!Object.values(result).every(Number.isFinite)) fail('canonical endpoint coordinates must be finite.');
  return result;
}
function difference(left, right) {
  const a = Number(left); const b = Number(right);
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > TOLERANCE;
}
function requiredEngineering(edge, field, nodeId) {
  const value = edge[field];
  if (NUMERIC_FIELDS.has(field)) {
    if (!Number.isFinite(Number(value))) fail(`endpoint ${nodeId} incident pipe lacks ${field} authority.`);
    return Number(value);
  }
  const text = String(value ?? '').trim();
  if (!text) fail(`endpoint ${nodeId} incident pipe lacks ${field} authority.`);
  return text;
}
function sameField(field, left, right) {
  if (NUMERIC_FIELDS.has(field)) return !difference(left, right);
  const a = String(left ?? '').trim().toUpperCase();
  const b = String(right ?? '').trim().toUpperCase();
  return Boolean(a && b && a === b);
}
function unit(from, to) {
  const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const lengthMm = Math.hypot(delta.x, delta.y, delta.z);
  if (!(lengthMm > TOLERANCE)) fail('route contains coincident consecutive points.');
  return { lengthMm, direction: { x: delta.x / lengthMm, y: delta.y / lengthMm, z: delta.z / lengthMm } };
}
function negate(value) { return { x: -value.x, y: -value.y, z: -value.z }; }
function angleDeg(left, right) {
  const dot = Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y + left.z * right.z));
  return Math.acos(dot) * 180 / Math.PI;
}
function endpoint(topology, nodeId, expectedRevision) {
  const nodes = topology.nodes.filter((row) => row.id === nodeId);
  if (nodes.length !== 1) fail(`endpoint ${nodeId} resolved ${nodes.length} nodes.`);
  const node = nodes[0];
  if (revision('NODE', node) !== expectedRevision) fail(`endpoint ${nodeId} revision is stale.`);
  const incident = topology.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
  if (incident.length !== 1) fail(`endpoint ${nodeId} must have graph degree one; received ${incident.length}.`);
  const edge = incident[0];
  if (String(edge.componentType ?? edge.entityType ?? '').toUpperCase() !== 'PIPE') {
    fail(`endpoint ${nodeId} incident edge must be a governed PIPE.`);
  }
  assertGraphOpenEndpoint(routeContext(topology, topology.canonicalTopologyHash), nodeId, edge.id);
  const otherNodeId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
  const other = topology.nodes.find((row) => row.id === otherNodeId);
  if (!other) fail(`endpoint ${nodeId} incident pipe has a stale opposite node.`);
  const geometry = unit(point(other.position), point(node.position));
  const connection = String(edge.fromNodeId === nodeId ? edge.endConnectionFrom : edge.endConnectionTo)
    .trim().toUpperCase();
  if (!connection) fail(`endpoint ${nodeId} incident pipe lacks connection authority.`);
  const engineering = Object.fromEntries(
    ENGINEERING_FIELDS.map((field) => [field, requiredEngineering(edge, field, nodeId)]),
  );
  const material = {
    nodeId,
    nodeRevision: revision('NODE', node),
    position: point(node.position),
    incidentEdgeId: edge.id,
    incidentEdgeRevision: revision('EDGE', edge),
    incidentEdgeLengthMm: geometry.lengthMm,
    outwardDirection: geometry.direction,
    connection,
    engineering,
  };
  return deepFreeze({ ...material, endpointHash: semanticHash(material) });
}
function compatibility(endpointRow, binding, routeEnd) {
  const differences = ENGINEERING_FIELDS.filter((field) => !sameField(field, endpointRow.engineering[field], binding[field]));
  const expectedConnection = String(routeEnd === 'START' ? binding.endConnectionFrom : binding.endConnectionTo).trim().toUpperCase();
  if (!expectedConnection || endpointRow.connection !== expectedConnection) differences.push('endConnection');
  return differences;
}
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index))
    .map((rest) => [item, ...rest]));
}
function orthogonalPoints(start, end, order) {
  const points = [point(start)];
  let current = point(start);
  order.forEach((axis, index) => {
    current = { ...current, [axis]: end[axis] };
    if (index < order.length - 1) points.push(current);
  });
  points.push(point(end));
  return points;
}
function geometry(kind, points, startEndpoint, endEndpoint, minimumLengthMm, signature) {
  const segments = [];
  const blockers = [];
  for (let index = 1; index < points.length; index += 1) {
    const resolved = unit(points[index - 1], points[index]);
    if (resolved.lengthMm + TOLERANCE < minimumLengthMm) blockers.push(`SEGMENT_${index}_BELOW_MINIMUM_LENGTH`);
    segments.push(deepFreeze({
      sequence: index - 1, startPointMm: points[index - 1], endPointMm: points[index],
      lengthMm: resolved.lengthMm, unitDirection: resolved.direction,
    }));
  }
  const turns = [];
  const startAngle = angleDeg(startEndpoint.outwardDirection, segments[0].unitDirection);
  if (startAngle > TOLERANCE) turns.push({ location: 'START_ENDPOINT', angleDeg: startAngle, nodeId: startEndpoint.nodeId });
  for (let index = 1; index < segments.length; index += 1) {
    const angle = angleDeg(segments[index - 1].unitDirection, segments[index].unitDirection);
    if (angle > TOLERANCE) turns.push({ location: `INTERNAL_${index}`, angleDeg: angle, vertexIndex: index });
  }
  const endAngle = angleDeg(segments.at(-1).unitDirection, negate(endEndpoint.outwardDirection));
  if (endAngle > TOLERANCE) turns.push({ location: 'END_ENDPOINT', angleDeg: endAngle, nodeId: endEndpoint.nodeId });
  const material = {
    kind, signature, points, segments,
    turns: turns.map((turn) => deepFreeze({ ...turn, turnHash: semanticHash(turn) })),
    segmentCount: segments.length,
    fittingCount: turns.length,
    totalLengthMm: segments.reduce((sum, row) => sum + row.lengthMm, 0),
    blockerCodes: blockers.sort(),
  };
  const alternativeHash = semanticHash(material);
  return deepFreeze({ ...material, alternativeId: `connect:${alternativeHash.split(':').at(-1)}`, alternativeHash });
}
function compareAlternative(left, right) {
  return left.blockerCodes.length - right.blockerCodes.length
    || left.fittingCount - right.fittingCount
    || left.totalLengthMm - right.totalLengthMm
    || left.signature.localeCompare(right.signature);
}
function assertEndpointHash(value) {
  const material = { ...value }; delete material.endpointHash;
  if (semanticHash(material) !== value.endpointHash) fail(`endpoint authority ${value.nodeId} was mutated.`);
}
function assertAlternative(value) {
  const material = { ...value }; delete material.alternativeId; delete material.alternativeHash; delete material.rank;
  if (semanticHash(material) !== value.alternativeHash) fail(`route alternative ${value.alternativeId} was mutated.`);
}

export function createConnectEndpointsPlan({ intent: input, session: sessionInput } = {}) {
  const intent = assertConnectEndpointsIntent(input);
  const session = assertSession(sessionInput);
  const topology = session.currentTopology();
  const start = endpoint(topology, intent.startNodeId, intent.startNodeRevision);
  const end = endpoint(topology, intent.endNodeId, intent.endNodeRevision);
  const compatibilityDifferences = [...new Set([
    ...compatibility(start, intent.catalogueBinding, 'START').map((field) => `START:${field}`),
    ...compatibility(end, intent.catalogueBinding, 'END').map((field) => `END:${field}`),
  ])].sort();
  const alternatives = [];
  if (intent.routePolicy.allowDirect) {
    alternatives.push(geometry('DIRECT', [start.position, end.position], start, end,
      intent.segmentPolicy.minimumLengthMm, 'DIRECT'));
  }
  const axes = ['x', 'y', 'z'].filter((axis) => difference(start.position[axis], end.position[axis]));
  if (intent.routePolicy.allowOrthogonal && axes.length > 1) {
    for (const order of permutations(axes)) alternatives.push(geometry(
      'ORTHOGONAL', orthogonalPoints(start.position, end.position, order), start, end,
      intent.segmentPolicy.minimumLengthMm, order.join('>'),
    ));
  }
  const unique = [...new Map(alternatives.map((row) => [row.alternativeHash, row])).values()]
    .sort(compareAlternative).slice(0, intent.routePolicy.maxAlternatives)
    .map((row, index) => deepFreeze({ ...row, rank: index + 1 }));
  if (!unique.length) fail('route policy produced no connection alternatives.');
  const basis = deepFreeze({
    datasetId: session.baseAuthority.datasetId,
    datasetVersion: session.baseAuthority.datasetVersion,
    sourceHash: session.baseAuthority.sourceHash,
    baseCanonicalHash: session.baseAuthority.baseCanonicalHash,
    priorCanonicalHash: topology.canonicalTopologyHash,
    priorJournalHash: session.journal.journalHash,
    sessionVersion: session.journal.sessionVersion,
    startEndpointHash: start.endpointHash,
    endEndpointHash: end.endpointHash,
    catalogueHash: intent.catalogueBinding.catalogueHash,
  });
  const material = {
    schema: CONNECT_ENDPOINTS_PLAN_SCHEMA,
    intentHash: intent.intentHash,
    basis,
    basisHash: semanticHash(basis),
    compatibilityStatus: compatibilityDifferences.length ? 'TRANSITION_REQUIRED' : 'COMPATIBLE',
    compatibilityDifferences,
    alternativeHashes: unique.map((row) => row.alternativeHash),
  };
  return deepFreeze({ ...material, planHash: semanticHash(material), intent, startEndpoint: start, endEndpoint: end, alternatives: unique });
}

export function assertConnectEndpointsPlan(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_PLAN_SCHEMA) fail(`plan must use ${CONNECT_ENDPOINTS_PLAN_SCHEMA}.`, TypeError);
  assertConnectEndpointsIntent(value.intent);
  assertEndpointHash(value.startEndpoint); assertEndpointHash(value.endEndpoint);
  value.alternatives.forEach(assertAlternative);
  const material = { ...value };
  delete material.planHash; delete material.intent; delete material.startEndpoint; delete material.endEndpoint; delete material.alternatives;
  if (semanticHash(material) !== value.planHash || value.basisHash !== semanticHash(value.basis)
    || semanticHash(value.alternativeHashes) !== semanticHash(value.alternatives.map((row) => row.alternativeHash))) {
    fail('connect-endpoints plan differs from immutable authority.');
  }
  return value;
}
