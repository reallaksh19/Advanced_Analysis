/** Pure support-frame and directional-restraint derivation for Wave 2. */
import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';
import {
  normalizeRestraintEvidence,
  supportRestraintRows,
} from './support-restraint-family.js';
import {
  addPoint,
  canonicalDirection,
  crossProduct,
  finitePoint,
  globalVertical,
  positiveNumber,
  scaleVector,
  unitVector,
  vector,
} from './topology-edit-geometry-math.js';

export function deriveSupportRestraintGeometry(input = {}) {
  const topology = input.canonicalTopology;
  const support = input.support;
  if (!topology?.nodes || !topology?.edges) {
    throw new TypeError('Support geometry requires canonical topology.');
  }
  if (!support?.id) throw new TypeError('Support geometry requires stable support identity.');
  const nodes = new Map(topology.nodes.map((node) => [stringValue(node.id), finitePoint(node.position)]));
  const origin = nodes.get(stringValue(support.nodeId)) || finitePoint(support.origin);
  const host = resolveHostEdge(topology.edges, support);
  const frame = host && origin ? hostFrame(host, nodes, input.verticalAxis || 'Z') : null;
  const diagnostics = supportDiagnostics(origin, host, frame);
  const restraints = supportRestraintRows(support).map((restraint, index) => deriveRestraint({
    support, restraint, index, origin, host, frame,
  }));
  return deepFreeze({
    supportId: stringValue(support.id),
    hostEntityId: host ? stringValue(host.componentKey || host.id) : null,
    origin,
    restraints,
    status: statusFor(diagnostics, restraints),
    diagnostics,
  });
}

export function deriveAllSupportRestraintGeometry(input = {}) {
  const supports = [...(input.canonicalTopology?.supports || [])]
    .sort((left, right) => stringValue(left.id).localeCompare(stringValue(right.id)));
  return Object.freeze(supports.map((support) => deriveSupportRestraintGeometry({
    ...input,
    support,
  })));
}

function supportDiagnostics(origin, host, frame) {
  const diagnostics = [];
  if (!origin) diagnostics.push(diagnostic('SUPPORT_ORIGIN_UNRESOLVED', 'Support origin is unresolved.'));
  if (!host) diagnostics.push(diagnostic('SUPPORT_HOST_UNRESOLVED', 'Support host edge is missing or ambiguous.'));
  if (host && !frame) diagnostics.push(diagnostic('SUPPORT_LOCAL_FRAME_UNRESOLVED', 'Support host local frame cannot be established.'));
  return diagnostics;
}

function deriveRestraint(context) {
  const evidence = normalizeRestraintEvidence(context.support, context.restraint, context.index);
  const direction = restraintDirection(evidence, context.frame);
  const gaps = restraintGaps(evidence);
  const diagnostics = restraintDiagnostics(evidence, direction, gaps);
  const contacts = contactPoints(
    context.origin,
    context.host,
    direction,
    evidence.family,
    gaps,
  );
  diagnostics.push(...contacts.diagnostics);
  return deepFreeze({
    restraintId: evidence.restraintId,
    family: evidence.family || 'UNKNOWN',
    direction,
    positiveGapMm: gaps.positive,
    negativeGapMm: gaps.negative,
    positiveContactPoint: contacts.positive,
    negativeContactPoint: contacts.negative,
    status: restraintStatus(direction, diagnostics),
    sourcePaths: evidence.sourcePaths,
    diagnostics,
  });
}

function resolveHostEdge(edges, support) {
  const explicit = stringValue(support.hostEntityId || support.edgeId || support.attachedEdgeId);
  if (explicit) {
    return edges.find((edge) => [edge.id, edge.componentKey]
      .map(stringValue)
      .includes(explicit)) || null;
  }
  const incident = edges.filter((edge) => (
    edge.fromNodeId === support.nodeId || edge.toNodeId === support.nodeId
  ));
  return incident.length === 1 ? incident[0] : null;
}

function hostFrame(edge, nodes, verticalAxis) {
  const start = nodes.get(stringValue(edge.fromNodeId));
  const end = nodes.get(stringValue(edge.toNodeId));
  const x = canonicalDirection(start && end ? vector(start, end) : null);
  const up = globalVertical(verticalAxis);
  const y = x ? unitVector(crossProduct(up, x)) : null;
  const z = x && y ? unitVector(crossProduct(x, y)) : null;
  return x && y && z ? Object.freeze({ x, y, z, up }) : null;
}

function restraintDirection(evidence, frame) {
  const explicit = explicitDirection(evidence.directionToken, frame);
  if (explicit) return explicit;
  if (evidence.family === 'GUIDE') return frame?.y || null;
  if (['LINE_STOP', 'LIMIT'].includes(evidence.family)) return frame?.x || null;
  if (verticalFamilies().has(evidence.family)) return frame?.up || null;
  return null;
}

function verticalFamilies() {
  return new Set([
    'REST', 'SHOE', 'TRUNNION', 'HANGER', 'HOLDOWN',
    'U_BOLT', 'SPRING_HANGER',
  ]);
}

function explicitDirection(token, frame) {
  const global = {
    '+X': { x: 1, y: 0, z: 0 },
    '-X': { x: -1, y: 0, z: 0 },
    '+Y': { x: 0, y: 1, z: 0 },
    '-Y': { x: 0, y: -1, z: 0 },
    '+Z': { x: 0, y: 0, z: 1 },
    '-Z': { x: 0, y: 0, z: -1 },
  };
  if (global[token]) return global[token];
  if (token === 'LOCAL_X') return frame?.x || null;
  if (token === 'LOCAL_Y') return frame?.y || null;
  if (token === 'LOCAL_Z') return frame?.z || null;
  if (token === 'GLOBAL_VERTICAL') return frame?.up || null;
  return null;
}

function restraintGaps(evidence) {
  if (['GUIDE', 'LINE_STOP', 'LIMIT', 'U_BOLT'].includes(evidence.family)) {
    return {
      required: true,
      positive: evidence.positiveGapMm ?? evidence.gapMm,
      negative: evidence.negativeGapMm ?? evidence.gapMm,
    };
  }
  if (evidence.family === 'HOLDOWN') {
    return { required: true, positive: evidence.positiveGapMm ?? evidence.gapMm, negative: null };
  }
  if (['REST', 'SHOE', 'TRUNNION', 'HANGER', 'SPRING_HANGER'].includes(evidence.family)) {
    return { required: true, positive: null, negative: evidence.negativeGapMm ?? evidence.gapMm };
  }
  return {
    required: false,
    positive: evidence.positiveGapMm,
    negative: evidence.negativeGapMm,
  };
}

function restraintDiagnostics(evidence, direction, gaps) {
  const diagnostics = [];
  if (!direction && evidence.family !== 'ANCHOR') {
    diagnostics.push(diagnostic('RESTRAINT_DIRECTION_UNRESOLVED', 'Restraint direction evidence is unresolved.'));
  }
  if (gaps.required && gaps.positive === null && gaps.negative === null) {
    diagnostics.push(diagnostic('RESTRAINT_GAP_MISSING', 'Restraint gap evidence is missing.'));
  }
  return diagnostics;
}

function contactPoints(origin, host, direction, family, gaps) {
  const diagnostics = [];
  if (!origin || !direction) return { positive: null, negative: null, diagnostics };
  const axial = ['LINE_STOP', 'LIMIT'].includes(family);
  const radius = axial ? 0 : hostOutsideRadius(host);
  if (!axial && radius === null) {
    diagnostics.push(diagnostic(
      'HOST_OUTSIDE_DIAMETER_MISSING',
      'Radial restraint contact requires authoritative host outside diameter.',
    ));
  }
  const positive = gaps.positive !== null && radius !== null
    ? addPoint(origin, scaleVector(direction, radius + gaps.positive))
    : null;
  const negative = gaps.negative !== null && radius !== null
    ? addPoint(origin, scaleVector(direction, -(radius + gaps.negative)))
    : null;
  return { positive, negative, diagnostics };
}

function hostOutsideRadius(host) {
  const diameter = positiveNumber(host?.outsideDiameterMm);
  return diameter === null ? null : diameter / 2;
}

function statusFor(diagnostics, restraints) {
  return diagnostics.length || restraints.some((row) => row.status !== 'RESOLVED')
    ? 'PARTIAL'
    : 'RESOLVED';
}

function restraintStatus(direction, diagnostics) {
  if (!diagnostics.length) return 'RESOLVED';
  return direction ? 'PARTIAL' : 'UNRESOLVED';
}

function diagnostic(code, message) {
  return Object.freeze({ code, severity: 'ERROR', message });
}
