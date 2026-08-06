import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import { buildTopologyGraph } from './graph-components.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  inputXmlModelHealthGeometryProjection,
  requireInputXmlModelHealthSource,
} from './inputxml-model-health-source-contract.js';
import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  TOPOLOGY_GRAPH_DIAGNOSTICS_SCHEMA,
  sealTopologyGraphDiagnostics,
} from './topology-graph-diagnostics-contract.js';

const DEFAULT_TOLERANCES = Object.freeze({
  coordinateAbsolute: 1e-6,
  coordinateRelative: 1e-9,
});

export function diagnoseInputXmlTopologyGraph(sourceBundle, options = {}) {
  const accepted = requireInputXmlModelHealthSource(sourceBundle);
  const geometry = accepted.geometry;
  const tolerances = resolveTolerances(options);
  const graph = buildTopologyGraph(geometry);
  const nodeById = indexNodes(geometry.nodes);
  const findings = [];

  if (geometry.nodes.length === 0 || geometry.segments.length === 0) {
    findings.push(finding({
      code: 'TOPOLOGY_MODEL_EMPTY',
      effect: 'BLOCK',
      scopeKey: 'MODEL',
      message: 'The model has no analyzable node-and-segment topology.',
      evidence: { nodeCount: geometry.nodes.length, segmentCount: geometry.segments.length },
      remediation: 'Provide at least one segment with two bound endpoint nodes.',
    }));
  }
  for (const ordinal of graph.invalidNodeIdentityOrdinals) {
    findings.push(finding({
      code: 'TOPOLOGY_NODE_ID_INVALID',
      effect: 'BLOCK',
      scopeKey: `NODE_ORDINAL:${ordinal}`,
      message: `Canonical node record ${ordinal + 1} has no usable identity.`,
      evidence: { nodeOrdinal: ordinal },
      remediation: 'Assign a non-empty canonical node identity before analysis.',
    }));
  }
  for (const ordinal of graph.invalidSegmentIdentityOrdinals) {
    findings.push(finding({
      code: 'TOPOLOGY_SEGMENT_ID_INVALID',
      effect: 'BLOCK',
      scopeKey: `SEGMENT_ORDINAL:${ordinal}`,
      message: `Canonical segment record ${ordinal + 1} has no usable identity.`,
      evidence: { segmentOrdinal: ordinal },
      remediation: 'Assign a non-empty canonical segment identity before analysis.',
    }));
  }
  for (const nodeId of graph.duplicateNodeIds) {
    findings.push(finding({
      code: 'TOPOLOGY_NODE_ID_DUPLICATE',
      effect: 'BLOCK',
      scopeKey: `NODE:${nodeId}`,
      message: `Node identity ${nodeId} is declared more than once.`,
      entities: { nodeIds: [nodeId] },
      evidence: { nodeId },
      remediation: 'Assign one canonical record per node identity before analysis.',
    }));
  }
  for (const segmentId of graph.duplicateSegmentIds) {
    findings.push(finding({
      code: 'TOPOLOGY_SEGMENT_ID_DUPLICATE',
      effect: 'BLOCK',
      scopeKey: `SEGMENT:${segmentId}`,
      message: `Segment identity ${segmentId} is declared more than once.`,
      entities: { segmentIds: [segmentId] },
      evidence: { segmentId },
      remediation: 'Assign one canonical record per segment identity before analysis.',
    }));
  }
  graph.unboundSegments.forEach((row, ordinal) => {
    findings.push(finding({
      code: 'TOPOLOGY_SEGMENT_NODE_UNBOUND',
      effect: 'BLOCK',
      scopeKey: `SEGMENT:${row.segmentId ?? 'UNIDENTIFIED'}:${row.startNodeId ?? 'NULL'}:${row.endNodeId ?? 'NULL'}:${ordinal}`,
      message: `Segment ${row.segmentId ?? '(unidentified)'} does not bind two declared endpoint nodes.`,
      entities: {
        segmentIds: row.segmentId === null ? [] : [row.segmentId],
        nodeIds: [row.startNodeId, row.endNodeId].filter((value) => value !== null),
      },
      evidence: row,
      remediation: 'Restore the segment identity and both endpoint node records.',
    }));
  });
  for (const row of graph.selfLoopSegments) {
    findings.push(finding({
      code: 'TOPOLOGY_SEGMENT_SELF_LOOP',
      effect: 'BLOCK',
      scopeKey: `SEGMENT:${row.segmentId}:NODE:${row.nodeId}`,
      message: `Segment ${row.segmentId} starts and ends at node ${row.nodeId}.`,
      entities: { segmentIds: [row.segmentId], nodeIds: [row.nodeId] },
      evidence: row,
      remediation: 'Replace the zero-topology segment with distinct endpoint nodes or remove it explicitly.',
    }));
  }
  for (const nodeId of graph.isolatedNodeIds) {
    findings.push(finding({
      code: 'TOPOLOGY_ISOLATED_NODE',
      effect: 'BLOCK',
      scopeKey: `NODE:${nodeId}`,
      message: `Node ${nodeId} has no incident segment.`,
      entities: { nodeIds: [nodeId] },
      evidence: { nodeId },
      remediation: 'Connect the node to its intended segment or remove the unused node explicitly.',
    }));
  }
  if (graph.components.length > 1) {
    findings.push(finding({
      code: 'TOPOLOGY_MULTIPLE_CONNECTED_COMPONENTS',
      effect: 'ADVISORY',
      scopeKey: 'MODEL',
      message: `The model contains ${graph.components.length} disconnected topology components.`,
      entities: { componentIds: graph.components.map((component) => component.componentId) },
      evidence: { componentCount: graph.components.length },
      remediation: 'Confirm that every component is intentional and will receive independent stability checks.',
    }));
  }

  const coordinateClosure = collectCoordinateClosure(accepted.elementRecords, nodeById, tolerances);
  for (const row of coordinateClosure) {
    if (row.status === 'PASS') continue;
    const unresolved = row.status === 'UNRESOLVED';
    findings.push(finding({
      code: unresolved
        ? 'TOPOLOGY_ELEMENT_DELTA_CLOSURE_UNRESOLVED'
        : 'TOPOLOGY_ELEMENT_DELTA_CLOSURE_MISMATCH',
      effect: 'BLOCK',
      scopeKey: `SOURCE:${row.sourceFeatureId}`,
      message: unresolved
        ? `Source element ${row.sourceElementNumber} cannot prove endpoint-delta closure.`
        : `Source element ${row.sourceElementNumber} delta does not close between nodes ${row.fromNodeId} and ${row.toNodeId}.`,
      entities: {
        nodeIds: [row.fromNodeId, row.toNodeId].filter(Boolean),
        segmentIds: row.canonicalSegmentId ? [row.canonicalSegmentId] : [],
        sourceFeatureIds: [row.sourceFeatureId],
      },
      evidence: row,
      remediation: unresolved
        ? 'Restore finite source deltas, endpoint identities, and canonical reconciliation.'
        : 'Correct the source delta or the conflicting route loop; no coordinate is adjusted automatically.',
    }));
  }

  findings.sort(compareFinding);
  const blockingFindingCount = findings.filter(isBlocking).length;
  const advisoryFindingCount = findings.filter(isAdvisory).length;
  const status = blockingFindingCount > 0 ? 'BLOCKED' : advisoryFindingCount > 0 ? 'CONDITIONAL' : 'PASS';
  const closureCounts = countBy(coordinateClosure, 'status');

  return sealTopologyGraphDiagnostics({
    schema: TOPOLOGY_GRAPH_DIAGNOSTICS_SCHEMA,
    profileId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
    sourceBundleSemanticHash: computeInputXmlModelHealthSourceSemanticHash(accepted),
    sourceBundleEvidenceHash: computeInputXmlModelHealthSourceEvidenceHash(accepted),
    geometrySemanticHash: semanticHash(inputXmlModelHealthGeometryProjection(geometry)),
    geometryUnit: geometry.unit ?? null,
    tolerances,
    components: graph.components,
    incidentSegments: graph.incidentSegments,
    nodeDegrees: graph.nodeDegrees,
    coordinateClosure,
    findings,
    summary: Object.freeze({
      nodeCount: geometry.nodes.length,
      segmentCount: geometry.segments.length,
      connectedComponentCount: graph.components.length,
      isolatedNodeCount: graph.isolatedNodeIds.length,
      unboundSegmentCount: graph.unboundSegments.length,
      selfLoopSegmentCount: graph.selfLoopSegments.length,
      invalidNodeIdentityCount: graph.invalidNodeIdentityOrdinals.length,
      invalidSegmentIdentityCount: graph.invalidSegmentIdentityOrdinals.length,
      duplicateNodeIdentityCount: graph.duplicateNodeIds.length,
      duplicateSegmentIdentityCount: graph.duplicateSegmentIds.length,
      coordinateClosurePassCount: closureCounts.PASS ?? 0,
      coordinateClosureMismatchCount: closureCounts.MISMATCH ?? 0,
      coordinateClosureUnresolvedCount: closureCounts.UNRESOLVED ?? 0,
      blockingFindingCount,
      advisoryFindingCount,
    }),
    status,
  });
}

function collectCoordinateClosure(records, nodeById, tolerances) {
  return Object.freeze(records.map((record) => {
    const sourceFeatureId = String(record.sourceFeatureId);
    const fromNodeId = record.fromNodeId === null ? null : String(record.fromNodeId);
    const toNodeId = record.toNodeId === null ? null : String(record.toNodeId);
    const from = fromNodeId === null ? null : nodeById.get(fromNodeId);
    const to = toNodeId === null ? null : nodeById.get(toNodeId);
    const declared = declaredDelta(record);
    const unresolvedReasons = [];
    if (record.canonicalStatus !== 'RECONCILED' || !record.canonicalSegmentId) {
      unresolvedReasons.push('SOURCE_RECORD_NOT_RECONCILED');
    }
    if (!finitePoint(from)) unresolvedReasons.push('FROM_NODE_COORDINATE_UNAVAILABLE');
    if (!finitePoint(to)) unresolvedReasons.push('TO_NODE_COORDINATE_UNAVAILABLE');
    if (!declared.valid) unresolvedReasons.push(...declared.reasons);
    if (unresolvedReasons.length > 0) {
      return Object.freeze({
        sourceFeatureId,
        sourceElementIndex: record.sourceIndex,
        sourceElementNumber: record.sourceIndex + 1,
        canonicalSegmentId: record.canonicalSegmentId ?? null,
        fromNodeId,
        toNodeId,
        declaredDelta: declared.value,
        declaredDeltaDisposition: declared.disposition,
        actualDelta: null,
        residual: null,
        residualNorm: null,
        acceptanceTolerance: null,
        unresolvedReasons: Object.freeze([...new Set(unresolvedReasons)].sort(compareAscii)),
        status: 'UNRESOLVED',
      });
    }
    const actual = Object.freeze({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
    const residual = Object.freeze({
      x: actual.x - declared.value.x,
      y: actual.y - declared.value.y,
      z: actual.z - declared.value.z,
    });
    const residualNorm = vectorNorm(residual);
    const scale = Math.max(vectorNorm(actual), vectorNorm(declared.value), 1);
    const acceptanceTolerance = tolerances.coordinateAbsolute + tolerances.coordinateRelative * scale;
    return Object.freeze({
      sourceFeatureId,
      sourceElementIndex: record.sourceIndex,
      sourceElementNumber: record.sourceIndex + 1,
      canonicalSegmentId: record.canonicalSegmentId,
      fromNodeId,
      toNodeId,
      declaredDelta: declared.value,
      declaredDeltaDisposition: declared.disposition,
      actualDelta: actual,
      residual,
      residualNorm,
      acceptanceTolerance,
      unresolvedReasons: Object.freeze([]),
      status: residualNorm <= acceptanceTolerance ? 'PASS' : 'MISMATCH',
    });
  }).sort((left, right) => left.sourceElementIndex - right.sourceElementIndex));
}

function declaredDelta(record) {
  const axes = [
    ['x', ['DELTA_X', 'DX']],
    ['y', ['DELTA_Y', 'DY']],
    ['z', ['DELTA_Z', 'DZ']],
  ];
  const value = {};
  const disposition = {};
  const reasons = [];
  for (const [axis, names] of axes) {
    const rawName = Object.keys(record.rawAttributes ?? {})
      .find((candidate) => names.some((name) => candidate.toLowerCase() === name.toLowerCase()));
    if (rawName === undefined) {
      value[axis] = 0;
      disposition[axis] = 'ABSENT_DEFAULT_ZERO';
      continue;
    }
    const parsed = record.rawDelta?.[axis];
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      value[axis] = null;
      disposition[axis] = 'INVALID';
      reasons.push(`DECLARED_DELTA_${axis.toUpperCase()}_INVALID`);
      continue;
    }
    value[axis] = parsed;
    disposition[axis] = 'EXPLICIT';
  }
  return Object.freeze({
    value: Object.freeze(value),
    disposition: Object.freeze(disposition),
    reasons: Object.freeze(reasons),
    valid: reasons.length === 0,
  });
}

function finding({ code, effect, scopeKey, message, entities = {}, evidence = {}, remediation }) {
  const blocking = effect === 'BLOCK';
  return Object.freeze({
    findingId: `TOPOLOGY_GRAPH:${code}:${scopeKey}`,
    code,
    category: 'TOPOLOGY_GRAPH',
    severity: blocking ? 'error' : 'warning',
    capabilityEffects: Object.freeze([
      Object.freeze({
        capabilityId: STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
        effect,
      }),
    ]),
    blocks: Object.freeze(blocking ? [STRICT_INPUTXML_LINEAR_STATIC_PROFILE] : []),
    message,
    entities: Object.freeze(normalizeEntities(entities)),
    evidence: Object.freeze(evidence),
    remediation,
  });
}

function resolveTolerances(options) {
  return Object.freeze({
    coordinateAbsolute: positive(
      options.coordinateAbsoluteTolerance ?? DEFAULT_TOLERANCES.coordinateAbsolute,
      'coordinateAbsoluteTolerance',
    ),
    coordinateRelative: nonnegative(
      options.coordinateRelativeTolerance ?? DEFAULT_TOLERANCES.coordinateRelative,
      'coordinateRelativeTolerance',
    ),
    unit: 'GEOMETRY_NATIVE',
  });
}

function indexNodes(nodes) {
  const index = new Map();
  for (const node of nodes) {
    const nodeId = node?.id === null || node?.id === undefined ? null : String(node.id);
    if (nodeId !== null && !index.has(nodeId)) index.set(nodeId, node);
  }
  return index;
}

function normalizeEntities(entities) {
  const result = {};
  for (const [key, values] of Object.entries(entities)) {
    result[key] = Object.freeze([...new Set(values ?? [])].map(String).sort(compareAscii));
  }
  return result;
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

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

function finitePoint(value) {
  return value && ['x', 'y', 'z'].every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]));
}

function vectorNorm(value) {
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

function compareAscii(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}
