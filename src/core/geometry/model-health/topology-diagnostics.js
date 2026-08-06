import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import { buildTopologyGraph } from './graph-components.js';
import {
  aabbDistanceSquared,
  buildSegmentGeometry,
  classifySegmentPair,
} from './segment-proximity-3d.js';
import {
  MODEL_TOPOLOGY_DIAGNOSTICS_SCHEMA,
  STRICT_LINEAR_STATIC_PROFILE,
  sealModelTopologyDiagnostics,
} from './topology-diagnostics-contract.js';

const DEFAULT_TOLERANCES = Object.freeze({
  absolute: 1e-6,
  relative: 1e-9,
  near: 1e-3,
  angular: 1e-10,
});

export function diagnoseCanonicalTopology(input, options = {}) {
  const geometry = input?.geometry;
  if (!geometry || !Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    throw new TypeError('diagnoseCanonicalTopology requires canonical geometry.');
  }
  const tolerances = resolveTolerances(options);
  const nodeById = new Map(geometry.nodes.map((node) => [String(node.id), node]));
  const graph = buildTopologyGraph(geometry);
  const localScaleByNode = buildLocalScaleByNode(geometry, graph);
  const findings = [];

  for (const row of graph.unboundSegments) {
    findings.push(finding({
      code: 'TOPOLOGY_SEGMENT_NODE_UNBOUND',
      severity: 'error',
      blocks: true,
      message: `Segment ${row.segmentId} references a node that is not present in canonical geometry.`,
      entities: { segmentIds: [row.segmentId], nodeIds: [row.startNodeId, row.endNodeId] },
      evidence: row,
      remediation: 'Restore both endpoint node records before analysis.',
    }));
  }
  for (const nodeId of graph.isolatedNodeIds) {
    findings.push(finding({
      code: 'TOPOLOGY_ISOLATED_NODE',
      severity: 'error',
      blocks: true,
      message: `Node ${nodeId} has no incident segment.`,
      entities: { nodeIds: [nodeId] },
      evidence: { nodeId },
      remediation: 'Connect the node to its intended element or remove the unused node explicitly.',
    }));
  }
  if (graph.components.length > 1) {
    findings.push(finding({
      code: 'TOPOLOGY_MULTIPLE_CONNECTED_COMPONENTS',
      severity: 'warning',
      blocks: false,
      message: `The model contains ${graph.components.length} disconnected topology components.`,
      entities: { componentIds: graph.components.map((component) => component.componentId) },
      evidence: { componentCount: graph.components.length },
      remediation: 'Confirm that every disconnected component is intentional and independently constrained.',
    }));
  }

  const nodeProximities = collectNodeProximities(geometry.nodes, tolerances, localScaleByNode);
  for (const row of nodeProximities) {
    const exact = row.classification === 'EXACT_COINCIDENT';
    const withinTolerance = row.classification === 'NUMERIC_COINCIDENCE';
    findings.push(finding({
      code: exact
        ? 'TOPOLOGY_DISTINCT_NODES_EXACTLY_COINCIDENT'
        : withinTolerance
          ? 'TOPOLOGY_DISTINCT_NODES_NUMERIC_COINCIDENCE'
          : 'TOPOLOGY_DISTINCT_NODES_NEAR_COINCIDENT',
      severity: exact || withinTolerance ? 'error' : 'warning',
      blocks: exact || withinTolerance,
      message: `${row.nodeIds.join(' and ')} are ${row.classification.toLowerCase().replaceAll('_', ' ')}.`,
      entities: { nodeIds: row.nodeIds },
      evidence: row,
      remediation: exact || withinTolerance
        ? 'Declare an explicit connection or separate the node coordinates; do not merge identities silently.'
        : 'Review the small separation and connect or separate the nodes intentionally.',
    }));
  }

  const coordinateClosure = collectCoordinateClosure(input.sourceElements ?? [], nodeById, tolerances);
  for (const row of coordinateClosure.filter((candidate) => candidate.status === 'MISMATCH')) {
    findings.push(finding({
      code: 'TOPOLOGY_ELEMENT_DELTA_CLOSURE_MISMATCH',
      severity: 'error',
      blocks: true,
      message: `Source element ${row.sourceElementNumber} delta does not close between nodes ${row.fromNodeId} and ${row.toNodeId}.`,
      entities: {
        nodeIds: [row.fromNodeId, row.toNodeId],
        segmentIds: row.segmentId ? [row.segmentId] : [],
        sourceElementIndices: [row.sourceElementIndex],
      },
      evidence: row,
      remediation: 'Correct the source delta or the conflicting route loop; no coordinate is adjusted automatically.',
    }));
  }

  const segmentResult = collectSegmentInteractions(geometry.segments, nodeById, tolerances);
  for (const row of segmentResult.interactions) {
    const definition = interactionFinding(row.classification);
    if (!definition) continue;
    findings.push(finding({
      ...definition,
      message: `${row.segmentIds.join(' and ')} classify as ${row.classification.toLowerCase().replaceAll('_', ' ')}.`,
      entities: { segmentIds: row.segmentIds, nodeIds: row.sharedNodeIds },
      evidence: row,
    }));
  }

  findings.sort(compareFinding);
  const blockingFindingCount = findings.filter((row) => row.blocks.includes(STRICT_LINEAR_STATIC_PROFILE)).length;
  const warningFindingCount = findings.filter((row) => row.severity === 'warning').length;
  const status = blockingFindingCount > 0 ? 'BLOCKED' : warningFindingCount > 0 ? 'CONDITIONAL' : 'PASS';
  const nodeClassCounts = countBy(nodeProximities, 'classification');
  const summary = Object.freeze({
    nodeCount: geometry.nodes.length,
    segmentCount: geometry.segments.length,
    connectedComponentCount: graph.components.length,
    isolatedNodeCount: graph.isolatedNodeIds.length,
    unboundSegmentCount: graph.unboundSegments.length,
    exactCoincidentNodePairCount: nodeClassCounts.EXACT_COINCIDENT ?? 0,
    numericCoincidentNodePairCount: nodeClassCounts.NUMERIC_COINCIDENCE ?? 0,
    nearCoincidentNodePairCount: nodeClassCounts.NEAR_COINCIDENT ?? 0,
    coordinateClosureMismatchCount: coordinateClosure.filter((row) => row.status === 'MISMATCH').length,
    segmentPairClassCounts: Object.freeze(segmentResult.classCounts),
    blockingFindingCount,
    warningFindingCount,
  });

  return sealModelTopologyDiagnostics({
    schema: MODEL_TOPOLOGY_DIAGNOSTICS_SCHEMA,
    profileId: STRICT_LINEAR_STATIC_PROFILE,
    sourceBundleSemanticHash: input.sourceBundleSemanticHash,
    sourceBundleEvidenceHash: input.sourceBundleEvidenceHash,
    geometrySemanticHash: semanticHash(geometryProjection(geometry)),
    geometryUnit: geometry.unit ?? null,
    tolerances,
    components: graph.components,
    nodeProximities,
    coordinateClosure,
    segmentInteractions: segmentResult.interactions,
    findings,
    summary,
    status,
  });
}

function collectNodeProximities(nodes, tolerances, localScaleByNode) {
  const sorted = [...nodes]
    .filter(finiteNode)
    .sort((left, right) => compareAscii(left.id, right.id));
  const cellSize = tolerances.near;
  const buckets = new Map();
  const rows = [];
  for (const node of sorted) {
    const cell = cellOf(node, cellSize);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const prior = buckets.get(cellKey(cell.x + dx, cell.y + dy, cell.z + dz)) ?? [];
          for (const candidate of prior) {
            const separation = distance(node, candidate);
            const scale = Math.max(
              localScaleByNode.get(String(node.id)) ?? 1,
              localScaleByNode.get(String(candidate.id)) ?? 1,
            );
            const exactTolerance = tolerances.absolute + tolerances.relative * scale;
            let classification = null;
            if (separation === 0) classification = 'EXACT_COINCIDENT';
            else if (separation <= exactTolerance) classification = 'NUMERIC_COINCIDENCE';
            else if (separation <= tolerances.near) classification = 'NEAR_COINCIDENT';
            if (classification) {
              rows.push(Object.freeze({
                classification,
                nodeIds: Object.freeze([String(candidate.id), String(node.id)].sort(compareAscii)),
                separation,
                exactTolerance,
                nearTolerance: tolerances.near,
              }));
            }
          }
        }
      }
    }
    const key = cellKey(cell.x, cell.y, cell.z);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  }
  return Object.freeze(rows.sort((left, right) => compareAscii(left.nodeIds.join('|'), right.nodeIds.join('|'))));
}

function collectCoordinateClosure(sourceElements, nodeById, tolerances) {
  const rows = [];
  for (const record of sourceElements) {
    const from = nodeById.get(String(record.fromNodeId));
    const to = nodeById.get(String(record.toNodeId));
    const declared = {
      x: record.delta?.x?.effectiveValue,
      y: record.delta?.y?.effectiveValue,
      z: record.delta?.z?.effectiveValue,
    };
    if (!finitePoint(from) || !finitePoint(to) || !finitePoint(declared)) continue;
    const actual = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const residual = { x: actual.x - declared.x, y: actual.y - declared.y, z: actual.z - declared.z };
    const residualNorm = normVector(residual);
    const scale = Math.max(normVector(actual), normVector(declared), 1);
    const acceptanceTolerance = tolerances.absolute + tolerances.relative * scale;
    rows.push(Object.freeze({
      sourceElementIndex: record.sourceElementIndex,
      sourceElementNumber: record.sourceElementNumber,
      segmentId: record.segmentId,
      fromNodeId: String(record.fromNodeId),
      toNodeId: String(record.toNodeId),
      declaredDelta: Object.freeze(declared),
      actualDelta: Object.freeze(actual),
      residual: Object.freeze(residual),
      residualNorm,
      acceptanceTolerance,
      status: residualNorm <= acceptanceTolerance ? 'PASS' : 'MISMATCH',
    }));
  }
  rows.sort((left, right) => left.sourceElementIndex - right.sourceElementIndex);
  return Object.freeze(rows);
}

function collectSegmentInteractions(segments, nodeById, tolerances) {
  const geometries = segments
    .map((segment) => buildSegmentGeometry(segment, nodeById))
    .filter(Boolean)
    .sort((left, right) => left.aabb.min.x - right.aabb.min.x || compareAscii(left.segmentId, right.segmentId));
  const interactions = [];
  const classCounts = {};
  for (let leftIndex = 0; leftIndex < geometries.length; leftIndex += 1) {
    const left = geometries[leftIndex];
    const broadphaseTolerance = tolerances.near + tolerances.relative * Math.max(left.length, 1);
    for (let rightIndex = leftIndex + 1; rightIndex < geometries.length; rightIndex += 1) {
      const right = geometries[rightIndex];
      if (right.aabb.min.x > left.aabb.max.x + broadphaseTolerance) break;
      const pairScale = Math.max(left.length, right.length, 1);
      const near = Math.max(tolerances.near, tolerances.absolute + tolerances.relative * pairScale);
      if (aabbDistanceSquared(left.aabb, right.aabb) > near * near) continue;
      const row = classifySegmentPair(left, right, {
        absoluteTolerance: tolerances.absolute,
        relativeTolerance: tolerances.relative,
        nearTolerance: tolerances.near,
        angularTolerance: tolerances.angular,
      });
      classCounts[row.classification] = (classCounts[row.classification] ?? 0) + 1;
      if (row.classification !== 'DISJOINT') interactions.push(row);
    }
  }
  interactions.sort((left, right) => compareAscii(left.segmentIds.join('|'), right.segmentIds.join('|')));
  return Object.freeze({
    interactions: Object.freeze(interactions),
    classCounts: Object.freeze(Object.fromEntries(Object.entries(classCounts).sort(([a], [b]) => compareAscii(a, b)))),
  });
}

function interactionFinding(classification) {
  const common = {
    blocks: true,
    severity: 'error',
    remediation: 'Revise the source topology and create explicit shared nodes where physical connectivity is intended.',
  };
  if (classification === 'EXACT_DUPLICATE') return { ...common, code: 'TOPOLOGY_EXACT_DUPLICATE_SEGMENTS' };
  if (classification === 'NUMERIC_DUPLICATE') return { ...common, code: 'TOPOLOGY_NUMERIC_DUPLICATE_SEGMENTS' };
  if (classification === 'COLLINEAR_OVERLAP') return { ...common, code: 'TOPOLOGY_COLLINEAR_SEGMENT_OVERLAP' };
  if (classification === 'INTERIOR_INTERSECTION') return { ...common, code: 'TOPOLOGY_UNNODED_INTERIOR_INTERSECTION' };
  if (classification === 'ENDPOINT_ON_INTERIOR') return { ...common, code: 'TOPOLOGY_ENDPOINT_ON_SEGMENT_INTERIOR' };
  if (classification === 'COINCIDENT_ENDPOINT_CONTACT') return { ...common, code: 'TOPOLOGY_UNSHARED_COINCIDENT_ENDPOINTS' };
  if (classification === 'DEGENERATE') return { ...common, code: 'TOPOLOGY_DEGENERATE_SEGMENT_PAIR' };
  if (classification === 'NEAR_MISS') {
    return {
      code: 'TOPOLOGY_SEGMENT_NEAR_MISS',
      severity: 'warning',
      blocks: false,
      remediation: 'Review whether the small clearance is intentional; no connection is inferred.',
    };
  }
  return null;
}

function finding({ code, severity, blocks, message, entities = {}, evidence = {}, remediation }) {
  return Object.freeze({
    code,
    category: 'TOPOLOGY',
    severity,
    blocks: Object.freeze(blocks ? [STRICT_LINEAR_STATIC_PROFILE] : []),
    message,
    entities: Object.freeze(normalizeEntities(entities)),
    evidence: Object.freeze(evidence),
    remediation,
  });
}

function normalizeEntities(entities) {
  const result = {};
  for (const [key, values] of Object.entries(entities)) {
    result[key] = Object.freeze([...new Set(values ?? [])].map(String).sort(compareAscii));
  }
  return result;
}

function resolveTolerances(options) {
  const absolute = positive(options.absoluteTolerance ?? DEFAULT_TOLERANCES.absolute, 'absoluteTolerance');
  const relative = nonnegative(options.relativeTolerance ?? DEFAULT_TOLERANCES.relative, 'relativeTolerance');
  const near = positive(options.nearTolerance ?? Math.max(DEFAULT_TOLERANCES.near, absolute * 100), 'nearTolerance');
  const angular = positive(options.angularTolerance ?? DEFAULT_TOLERANCES.angular, 'angularTolerance');
  if (near < absolute) throw new TypeError('nearTolerance must be greater than or equal to absoluteTolerance.');
  return Object.freeze({ absolute, relative, near, angular, unit: 'GEOMETRY_NATIVE' });
}

function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...projection } = geometry;
  return projection;
}

function compareFinding(left, right) {
  return compareAscii(left.code, right.code)
    || compareAscii(JSON.stringify(left.entities), JSON.stringify(right.entities));
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

function compareAscii(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function finiteNode(node) {
  return node && finitePoint(node) && node.id !== null && node.id !== undefined;
}

function finitePoint(value) {
  return value && ['x', 'y', 'z'].every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]));
}

function cellOf(node, size) {
  return { x: Math.floor(node.x / size), y: Math.floor(node.y / size), z: Math.floor(node.z / size) };
}

function cellKey(x, y, z) {
  return `${x}:${y}:${z}`;
}

function buildLocalScaleByNode(geometry, graph) {
  const nodeById = new Map(geometry.nodes.filter(finiteNode).map((node) => [String(node.id), node]));
  const segmentById = new Map(geometry.segments.map((segment) => [String(segment.id), segment]));
  const scaleByNode = new Map();
  for (const component of graph.components) {
    const nodes = component.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(finiteNode);
    const bounds = componentBounds(nodes);
    let maximumSegmentLength = 0;
    for (const segmentId of component.segmentIds) {
      const segment = segmentById.get(segmentId);
      const start = segment ? nodeById.get(String(segment.startNodeId)) : null;
      const end = segment ? nodeById.get(String(segment.endNodeId)) : null;
      if (finiteNode(start) && finiteNode(end)) maximumSegmentLength = Math.max(maximumSegmentLength, distance(start, end));
    }
    const componentScale = Math.max(1, bounds.diagonal, maximumSegmentLength);
    for (const nodeId of component.nodeIds) scaleByNode.set(nodeId, componentScale);
  }
  return scaleByNode;
}

function componentBounds(nodes) {
  if (nodes.length === 0) return { diagonal: 0 };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const node of nodes) {
    for (const axis of ['x', 'y', 'z']) {
      min[axis] = Math.min(min[axis], node[axis]);
      max[axis] = Math.max(max[axis], node[axis]);
    }
  }
  return { diagonal: distance(min, max) };
}

function distance(left, right) {
  return Math.sqrt((left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2);
}

function normVector(value) {
  return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
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
