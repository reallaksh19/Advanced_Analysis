import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  inputXmlModelHealthGeometryProjection,
  requireInputXmlModelHealthSource,
} from './inputxml-model-health-source-contract.js';
import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './topology-graph-diagnostics-contract.js';
import {
  TOPOLOGY_PROXIMITY_DIAGNOSTICS_SCHEMA,
  sealTopologyProximityDiagnostics,
} from './topology-proximity-diagnostics-contract.js';
import {
  aabbDistanceSquared,
  buildSegmentGeometry,
  classifySegmentPair,
} from './segment-proximity-3d.js';

const DEFAULT_TOLERANCES = Object.freeze({
  nodeAbsolute: 1e-6,
  nodeRelative: 1e-9,
  nodeNear: 1e-3,
  segmentAbsolute: 1e-6,
  segmentRelative: 1e-9,
  segmentNear: 1e-3,
  angular: 1e-10,
});

export function diagnoseInputXmlTopologyProximity(sourceBundle, options = {}) {
  const accepted = requireInputXmlModelHealthSource(sourceBundle);
  const geometry = accepted.geometry;
  const tolerances = resolveTolerances(options);
  const findings = [];
  const nodeInventory = buildNodeInventory(geometry.nodes);
  const segmentInventory = buildSegmentInventory(geometry.segments, nodeInventory.uniqueNodeById, tolerances);

  for (const row of nodeInventory.unresolved) {
    findings.push(finding({
      code: 'TOPOLOGY_PROXIMITY_NODE_GEOMETRY_UNRESOLVED',
      effect: 'BLOCK',
      scopeKey: `NODE_ORDINAL:${row.nodeOrdinal}`,
      message: `Canonical node record ${row.nodeOrdinal + 1} cannot participate in proximity diagnostics.`,
      entities: { nodeIds: row.nodeId ? [row.nodeId] : [] },
      evidence: row,
      remediation: 'Provide one non-empty node identity with finite x, y, and z coordinates.',
    }));
  }
  for (const nodeId of nodeInventory.duplicateNodeIds) {
    findings.push(finding({
      code: 'TOPOLOGY_PROXIMITY_NODE_ID_AMBIGUOUS',
      effect: 'BLOCK',
      scopeKey: `NODE:${nodeId}`,
      message: `Node identity ${nodeId} is duplicated and cannot define one proximity location.`,
      entities: { nodeIds: [nodeId] },
      evidence: { nodeId },
      remediation: 'Resolve duplicate node identities before geometric proximity evaluation.',
    }));
  }
  for (const row of segmentInventory.unresolved) {
    findings.push(finding({
      code: 'TOPOLOGY_PROXIMITY_SEGMENT_GEOMETRY_UNRESOLVED',
      effect: 'BLOCK',
      scopeKey: `SEGMENT_ORDINAL:${row.segmentOrdinal}`,
      message: `Canonical segment record ${row.segmentOrdinal + 1} cannot define one finite line segment.`,
      entities: { segmentIds: row.segmentId ? [row.segmentId] : [] },
      evidence: row,
      remediation: 'Provide one segment identity and two uniquely bound finite endpoint nodes.',
    }));
  }
  for (const segmentId of segmentInventory.duplicateSegmentIds) {
    findings.push(finding({
      code: 'TOPOLOGY_PROXIMITY_SEGMENT_ID_AMBIGUOUS',
      effect: 'BLOCK',
      scopeKey: `SEGMENT:${segmentId}`,
      message: `Segment identity ${segmentId} is duplicated and cannot define one proximity entity.`,
      entities: { segmentIds: [segmentId] },
      evidence: { segmentId },
      remediation: 'Resolve duplicate segment identities before geometric proximity evaluation.',
    }));
  }
  for (const row of segmentInventory.degenerate) {
    findings.push(finding({
      code: 'TOPOLOGY_PROXIMITY_SEGMENT_DEGENERATE',
      effect: 'BLOCK',
      scopeKey: `SEGMENT:${row.segmentId}`,
      message: `Segment ${row.segmentId} has length ${row.length}, within its geometric hit tolerance.`,
      entities: { segmentIds: [row.segmentId], nodeIds: row.nodeIds },
      evidence: row,
      remediation: 'Remove the zero-length span or provide distinct endpoint coordinates.',
    }));
  }

  const nodeProximities = collectNodeProximities(nodeInventory.eligibleNodes, tolerances);
  for (const row of nodeProximities) {
    const definition = nodeFindingDefinition(row.classification);
    findings.push(finding({
      ...definition,
      scopeKey: `NODE_PAIR:${row.nodeIds.join('|')}`,
      message: `${row.nodeIds.join(' and ')} are ${readable(row.classification)}.`,
      entities: { nodeIds: row.nodeIds },
      evidence: row,
    }));
  }

  const segmentInteractions = collectSegmentInteractions(segmentInventory.eligibleSegments, tolerances);
  for (const row of segmentInteractions) {
    const definition = segmentFindingDefinition(row.classification);
    if (!definition) continue;
    findings.push(finding({
      ...definition,
      scopeKey: `SEGMENT_PAIR:${row.segmentIds.join('|')}`,
      message: `${row.segmentIds.join(' and ')} classify as ${readable(row.classification)}.`,
      entities: { segmentIds: row.segmentIds, nodeIds: row.sharedNodeIds },
      evidence: row,
    }));
  }

  findings.sort(compareFinding);
  const blockingFindingCount = findings.filter(isBlocking).length;
  const advisoryFindingCount = findings.filter(isAdvisory).length;
  const status = blockingFindingCount > 0 ? 'BLOCKED' : advisoryFindingCount > 0 ? 'CONDITIONAL' : 'PASS';
  const nodeClassCounts = countBy(nodeProximities, 'classification');
  const segmentClassCounts = countBy(segmentInteractions, 'classification');

  return sealTopologyProximityDiagnostics({
    schema: TOPOLOGY_PROXIMITY_DIAGNOSTICS_SCHEMA,
    profileId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
    sourceBundleSemanticHash: computeInputXmlModelHealthSourceSemanticHash(accepted),
    sourceBundleEvidenceHash: computeInputXmlModelHealthSourceEvidenceHash(accepted),
    geometrySemanticHash: semanticHash(inputXmlModelHealthGeometryProjection(geometry)),
    geometryUnit: geometry.unit ?? null,
    tolerances,
    nodeProximities,
    segmentInteractions,
    findings,
    summary: Object.freeze({
      nodeCount: geometry.nodes.length,
      segmentCount: geometry.segments.length,
      eligibleNodeCount: nodeInventory.eligibleNodes.length,
      eligibleSegmentCount: segmentInventory.eligibleSegments.length,
      unresolvedNodeCount: nodeInventory.unresolved.length,
      unresolvedSegmentCount: segmentInventory.unresolved.length,
      duplicateNodeIdentityCount: nodeInventory.duplicateNodeIds.length,
      duplicateSegmentIdentityCount: segmentInventory.duplicateSegmentIds.length,
      degenerateSegmentCount: segmentInventory.degenerate.length,
      nodeClassCounts: Object.freeze(nodeClassCounts),
      segmentClassCounts: Object.freeze(segmentClassCounts),
      blockingFindingCount,
      advisoryFindingCount,
    }),
    status,
  });
}

function buildNodeInventory(nodes) {
  const groups = new Map();
  const unresolved = [];
  nodes.forEach((node, nodeOrdinal) => {
    const nodeId = normalizeIdentity(node?.id);
    if (nodeId === null || !finitePoint(node)) {
      unresolved.push(Object.freeze({
        nodeOrdinal,
        nodeId,
        reasons: Object.freeze([
          ...(nodeId === null ? ['NODE_ID_INVALID'] : []),
          ...(!finitePoint(node) ? ['NODE_COORDINATES_NONFINITE'] : []),
        ]),
      }));
      return;
    }
    if (!groups.has(nodeId)) groups.set(nodeId, []);
    groups.get(nodeId).push(Object.freeze({
      nodeId,
      nodeOrdinal,
      x: node.x,
      y: node.y,
      z: node.z,
    }));
  });
  const duplicateNodeIds = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([nodeId]) => nodeId)
    .sort(compareAscii);
  const duplicateSet = new Set(duplicateNodeIds);
  const eligibleNodes = [...groups.entries()]
    .filter(([nodeId]) => !duplicateSet.has(nodeId))
    .map(([, rows]) => rows[0])
    .sort((left, right) => compareAscii(left.nodeId, right.nodeId));
  const uniqueNodeById = new Map(eligibleNodes.map((node) => [node.nodeId, node]));
  return Object.freeze({
    unresolved: Object.freeze(unresolved),
    duplicateNodeIds: Object.freeze(duplicateNodeIds),
    eligibleNodes: Object.freeze(eligibleNodes),
    uniqueNodeById,
  });
}

function buildSegmentInventory(segments, nodeById, tolerances) {
  const identityCounts = new Map();
  for (const segment of segments) {
    const segmentId = normalizeIdentity(segment?.id);
    if (segmentId !== null) identityCounts.set(segmentId, (identityCounts.get(segmentId) ?? 0) + 1);
  }
  const duplicateSegmentIds = [...identityCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([segmentId]) => segmentId)
    .sort(compareAscii);
  const duplicateSet = new Set(duplicateSegmentIds);
  const unresolved = [];
  const degenerate = [];
  const eligibleSegments = [];
  segments.forEach((segment, segmentOrdinal) => {
    const segmentId = normalizeIdentity(segment?.id);
    const startNodeId = normalizeIdentity(segment?.startNodeId);
    const endNodeId = normalizeIdentity(segment?.endNodeId);
    if (segmentId === null) {
      unresolved.push(Object.freeze({
        segmentOrdinal,
        segmentId,
        startNodeId,
        endNodeId,
        reasons: Object.freeze(['SEGMENT_ID_INVALID']),
      }));
      return;
    }
    if (duplicateSet.has(segmentId)) return;
    const geometry = buildSegmentGeometry(segment, nodeById);
    if (!geometry) {
      unresolved.push(Object.freeze({
        segmentOrdinal,
        segmentId,
        startNodeId,
        endNodeId,
        reasons: Object.freeze(['SEGMENT_ENDPOINT_GEOMETRY_UNAVAILABLE']),
      }));
      return;
    }
    const hitTolerance = tolerances.segmentAbsolute
      + tolerances.segmentRelative * Math.max(geometry.length, 1);
    if (geometry.length <= hitTolerance) {
      degenerate.push(Object.freeze({
        segmentId,
        nodeIds: Object.freeze([geometry.startNodeId, geometry.endNodeId].sort(compareAscii)),
        length: geometry.length,
        hitTolerance,
      }));
      return;
    }
    eligibleSegments.push(geometry);
  });
  eligibleSegments.sort((left, right) => compareAscii(left.segmentId, right.segmentId));
  return Object.freeze({
    unresolved: Object.freeze(unresolved),
    duplicateSegmentIds: Object.freeze(duplicateSegmentIds),
    degenerate: Object.freeze(degenerate),
    eligibleSegments: Object.freeze(eligibleSegments),
  });
}

function collectNodeProximities(nodes, tolerances) {
  const sorted = [...nodes].sort((left, right) => left.x - right.x || compareAscii(left.nodeId, right.nodeId));
  const rows = [];
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    const left = sorted[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const right = sorted[rightIndex];
      if (right.x - left.x > tolerances.nodeNear) break;
      const separation = distance(left, right);
      if (separation > tolerances.nodeNear) continue;
      const coincidenceTolerance = tolerances.nodeAbsolute
        + tolerances.nodeRelative * Math.max(separation, 1);
      const classification = separation === 0
        ? 'EXACT_COINCIDENT'
        : separation <= coincidenceTolerance
          ? 'NUMERIC_COINCIDENT'
          : 'NEAR_COINCIDENT';
      rows.push(Object.freeze({
        classification,
        nodeIds: Object.freeze([left.nodeId, right.nodeId].sort(compareAscii)),
        separation,
        coincidenceTolerance,
        nearTolerance: tolerances.nodeNear,
      }));
    }
  }
  return Object.freeze(rows.sort(compareNodePair));
}

function collectSegmentInteractions(segments, tolerances) {
  if (segments.length < 2) return Object.freeze([]);
  const maxLength = Math.max(...segments.map((segment) => segment.length), 1);
  const globalBroadphaseTolerance = Math.max(
    tolerances.segmentNear,
    tolerances.segmentAbsolute + tolerances.segmentRelative * maxLength,
  );
  const sorted = [...segments]
    .sort((left, right) => left.aabb.min.x - right.aabb.min.x || compareAscii(left.segmentId, right.segmentId));
  const rows = [];
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    const left = sorted[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const right = sorted[rightIndex];
      if (right.aabb.min.x > left.aabb.max.x + globalBroadphaseTolerance) break;
      if (aabbDistanceSquared(left.aabb, right.aabb) > globalBroadphaseTolerance ** 2) continue;
      const row = classifySegmentPair(left, right, {
        absoluteTolerance: tolerances.segmentAbsolute,
        relativeTolerance: tolerances.segmentRelative,
        nearTolerance: tolerances.segmentNear,
        angularTolerance: tolerances.angular,
      });
      if (row.classification !== 'DISJOINT') rows.push(row);
    }
  }
  return Object.freeze(rows.sort(compareSegmentPair));
}

function nodeFindingDefinition(classification) {
  if (classification === 'EXACT_COINCIDENT') {
    return {
      code: 'TOPOLOGY_DISTINCT_NODES_EXACTLY_COINCIDENT',
      effect: 'BLOCK',
      remediation: 'Declare an explicit shared node or separate the node coordinates.',
    };
  }
  if (classification === 'NUMERIC_COINCIDENT') {
    return {
      code: 'TOPOLOGY_DISTINCT_NODES_NUMERIC_COINCIDENCE',
      effect: 'BLOCK',
      remediation: 'Resolve the tolerance-level coincidence explicitly; no identities are merged automatically.',
    };
  }
  return {
    code: 'TOPOLOGY_DISTINCT_NODES_NEAR_COINCIDENT',
    effect: 'ADVISORY',
    remediation: 'Review whether the small separation is intentional.',
  };
}

function segmentFindingDefinition(classification) {
  const block = (code, remediation) => ({ code, effect: 'BLOCK', remediation });
  if (classification === 'EXACT_DUPLICATE') {
    return block('TOPOLOGY_EXACT_DUPLICATE_SEGMENTS', 'Remove the duplicate span or preserve only one governed segment identity.');
  }
  if (classification === 'NUMERIC_DUPLICATE') {
    return block('TOPOLOGY_NUMERIC_DUPLICATE_SEGMENTS', 'Resolve the tolerance-equivalent spans explicitly; no segment is discarded automatically.');
  }
  if (classification === 'COLLINEAR_OVERLAP') {
    return block('TOPOLOGY_COLLINEAR_SEGMENT_OVERLAP', 'Split or remove overlapping spans so each physical interval has one owner.');
  }
  if (classification === 'INTERIOR_INTERSECTION') {
    return block('TOPOLOGY_UNNODED_INTERIOR_INTERSECTION', 'Create an explicit shared node if the crossing is connected, or separate the spans.');
  }
  if (classification === 'ENDPOINT_ON_INTERIOR') {
    return block('TOPOLOGY_ENDPOINT_ON_SEGMENT_INTERIOR', 'Split the host segment at the endpoint or separate the geometry.');
  }
  if (classification === 'COINCIDENT_ENDPOINT_CONTACT') {
    return block('TOPOLOGY_UNSHARED_COINCIDENT_ENDPOINTS', 'Use one shared node identity for intended connectivity or separate the endpoints.');
  }
  if (classification === 'DEGENERATE') {
    return block('TOPOLOGY_PROXIMITY_PAIR_DEGENERATE', 'Resolve the short span before pair classification.');
  }
  if (classification === 'NEAR_MISS') {
    return {
      code: 'TOPOLOGY_SEGMENT_NEAR_MISS',
      effect: 'ADVISORY',
      remediation: 'Review whether the small clearance is intentional; no connection is inferred.',
    };
  }
  return null;
}

function finding({ code, effect, scopeKey, message, entities = {}, evidence = {}, remediation }) {
  const blocking = effect === 'BLOCK';
  return Object.freeze({
    findingId: `TOPOLOGY_PROXIMITY:${code}:${scopeKey}`,
    code,
    category: 'TOPOLOGY_PROXIMITY',
    severity: blocking ? 'error' : 'warning',
    capabilityEffects: Object.freeze([
      Object.freeze({ capabilityId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE, effect }),
    ]),
    blocks: Object.freeze(blocking ? [STRICT_INPUTXML_LINEAR_STATIC_PROFILE] : []),
    message,
    entities: Object.freeze(normalizeEntities(entities)),
    evidence: Object.freeze(evidence),
    remediation,
  });
}

function resolveTolerances(options) {
  const tolerances = Object.freeze({
    nodeAbsolute: positive(options.nodeAbsoluteTolerance ?? DEFAULT_TOLERANCES.nodeAbsolute, 'nodeAbsoluteTolerance'),
    nodeRelative: nonnegative(options.nodeRelativeTolerance ?? DEFAULT_TOLERANCES.nodeRelative, 'nodeRelativeTolerance'),
    nodeNear: positive(options.nodeNearTolerance ?? DEFAULT_TOLERANCES.nodeNear, 'nodeNearTolerance'),
    segmentAbsolute: positive(options.segmentAbsoluteTolerance ?? DEFAULT_TOLERANCES.segmentAbsolute, 'segmentAbsoluteTolerance'),
    segmentRelative: nonnegative(options.segmentRelativeTolerance ?? DEFAULT_TOLERANCES.segmentRelative, 'segmentRelativeTolerance'),
    segmentNear: positive(options.segmentNearTolerance ?? DEFAULT_TOLERANCES.segmentNear, 'segmentNearTolerance'),
    angular: positive(options.angularTolerance ?? DEFAULT_TOLERANCES.angular, 'angularTolerance'),
    unit: 'GEOMETRY_NATIVE',
  });
  const minimumNodeNear = tolerances.nodeAbsolute
    + tolerances.nodeRelative * Math.max(tolerances.nodeNear, 1);
  if (tolerances.nodeNear < minimumNodeNear) {
    throw new TypeError('nodeNearTolerance must not be smaller than the node coincidence tolerance.');
  }
  if (tolerances.segmentNear < tolerances.segmentAbsolute) {
    throw new TypeError('segmentNearTolerance must be greater than or equal to segmentAbsoluteTolerance.');
  }
  if (tolerances.angular > 1) throw new TypeError('angularTolerance must not exceed 1.');
  return tolerances;
}

function normalizeEntities(entities) {
  const result = {};
  for (const [key, values] of Object.entries(entities)) {
    result[key] = Object.freeze([...new Set(values ?? [])].map(String).sort(compareAscii));
  }
  return result;
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => compareAscii(left, right)));
}

function isBlocking(row) {
  return row.capabilityEffects.some((effect) => effect.effect === 'BLOCK');
}

function isAdvisory(row) {
  return row.capabilityEffects.some((effect) => effect.effect === 'ADVISORY');
}

function compareFinding(left, right) {
  return compareAscii(left.findingId, right.findingId);
}

function compareNodePair(left, right) {
  return compareAscii(left.nodeIds.join('|'), right.nodeIds.join('|'));
}

function compareSegmentPair(left, right) {
  return compareAscii(left.segmentIds.join('|'), right.segmentIds.join('|'))
    || compareAscii(left.classification, right.classification);
}

function readable(value) {
  return value.toLowerCase().replaceAll('_', ' ');
}

function normalizeIdentity(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function finitePoint(value) {
  return value && ['x', 'y', 'z'].every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]));
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function positive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number.`);
  }
  return value;
}

function nonnegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite nonnegative number.`);
  }
  return value;
}

function compareAscii(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}
