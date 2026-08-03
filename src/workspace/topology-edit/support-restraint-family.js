import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';

export const RESTRAINT_FAMILY_MAPPING = Object.freeze({
  REST: 'REST', HOLDOWN: 'HOLDOWN', HOLDDOWN: 'HOLDOWN', HOLD_DOWN: 'HOLDOWN',
  GUIDE: 'GUIDE', GUI: 'GUIDE', LINESTOP: 'LINE_STOP', LINE_STOP: 'LINE_STOP',
  LIMIT: 'LIMIT', LIM: 'LIMIT', CAN: 'CAN', SPRING: 'SPRING_WARNING',
  'SPRING CAN': 'SPRING_WARNING', 'CAN SPRING': 'SPRING_WARNING', U_BOLT: 'U_BOLT',
  SHOE: 'SHOE', TRUNNION: 'TRUNNION', HANGER: 'HANGER',
  SPRING_HANGER: 'SPRING_HANGER', ANCHOR: 'ANCHOR',
});
export const RESTRAINT_FAMILY_COLORS = Object.freeze({
  REST: 0x22d3ee, SHOE: 0x22d3ee, TRUNNION: 0x22d3ee, HANGER: 0x22d3ee,
  GUIDE: 0x4ade80, LINE_STOP: 0xf59e0b, LIMIT: 0xf59e0b, ANCHOR: 0xef4444,
  HOLDOWN: 0xa78bfa, U_BOLT: 0xa78bfa, SPRING_WARNING: 0xfacc15,
  SPRING_HANGER: 0xfacc15, CAN: 0xfacc15,
});

export function restraintFamily(restraint = {}) {
  const raw = stringValue(restraint.kind || restraint.family || restraint.type).toUpperCase();
  return RESTRAINT_FAMILY_MAPPING[raw] || raw;
}
export function restraintColor(family) {
  return RESTRAINT_FAMILY_COLORS[stringValue(family).toUpperCase()] ?? 0x22d3ee;
}
export function stableRestraintId(support = {}, restraint = {}, index = 0) {
  const explicit = stringValue(restraint.id || restraint.restraintId);
  const supportId = stringValue(support.id || support.supportId);
  if (explicit) return explicit;
  if (!supportId) throw new TypeError('Stable restraint identity requires a support ID.');
  return `${supportId}:restraint:${Number(index)}`;
}
export function normalizeSupportScale(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(6, Math.max(0.25, parsed)) : 2.5;
}
export function normalizeGapMm(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function normalizeRestraintEvidence(support, restraint, index) {
  return deepFreeze({
    restraintId: stableRestraintId(support, restraint, index),
    originalKind: stringValue(restraint?.kind || restraint?.type || restraint?.family),
    family: restraintFamily(restraint),
    gapMm: normalizeGapMm(restraint?.gapMm ?? restraint?.gap),
    positiveGapMm: normalizeGapMm(restraint?.positiveGapMm),
    negativeGapMm: normalizeGapMm(restraint?.negativeGapMm),
    directionToken: stringValue(restraint?.direction || restraint?.axis).toUpperCase(),
    sourcePaths: sourcePaths(support, restraint),
  });
}

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
  const diagnostics = [];
  if (!origin) diagnostics.push(diag('SUPPORT_ORIGIN_UNRESOLVED', 'Support origin is unresolved.'));
  if (!host) diagnostics.push(diag('SUPPORT_HOST_UNRESOLVED', 'Support host edge is missing or ambiguous.'));
  if (host && !frame) {
    diagnostics.push(diag('SUPPORT_LOCAL_FRAME_UNRESOLVED', 'Support host local frame cannot be established.'));
  }
  const restraints = restraintRows(support).map((restraint, index) => deriveRestraint({
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
    .sort((left, right) => compareCodeUnits(stringValue(left.id), stringValue(right.id)));
  return deepFreeze(supports.map((support) => deriveSupportRestraintGeometry({ ...input, support })));
}
export function projectSupportGeometryToViewport(overlays, policy = {}) {
  const arrowLengthMm = positive(policy.arrowLengthMm) || 80;
  const arrowRadiusMm = positive(policy.arrowRadiusMm) || 5;
  const markerSizeMm = positive(policy.markerSizeMm) || 20;
  const elements = [];
  const segments = [];
  for (const overlay of overlays || []) {
    if (overlay.origin) elements.push(supportMarker(overlay, markerSizeMm));
    for (const restraint of overlay.restraints) {
      if (!overlay.origin || !restraint.direction) continue;
      segments.push({
        id: `${restraint.restraintId}:direction`,
        entityId: restraint.restraintId,
        type: 'RESTRAINT_DIRECTION',
        start: overlay.origin,
        end: add(overlay.origin, scale(restraint.direction, arrowLengthMm)),
        radiusMm: arrowRadiusMm,
        colorInt: restraintColor(restraint.family),
        pickTarget: restraintPick(overlay, restraint),
      });
    }
  }
  return deepFreeze({ elements, segments, glyphOverlays: overlays || [] });
}

function deriveRestraint(context) {
  const evidence = normalizeRestraintEvidence(context.support, context.restraint, context.index);
  const diagnostics = [];
  const direction = restraintDirection(evidence, context.frame);
  if (!direction && evidence.family !== 'ANCHOR') {
    diagnostics.push(diag('RESTRAINT_DIRECTION_UNRESOLVED', 'Restraint direction evidence is unresolved.'));
  }
  const gaps = restraintGaps(evidence);
  if (gaps.required && gaps.positive === null && gaps.negative === null) {
    diagnostics.push(diag('RESTRAINT_GAP_MISSING', 'Restraint gap evidence is missing.'));
  }
  const contacts = contactPoints(context.origin, context.host, direction, evidence.family, gaps);
  diagnostics.push(...contacts.diagnostics);
  return deepFreeze({
    restraintId: evidence.restraintId,
    family: evidence.family || 'UNKNOWN',
    direction,
    positiveGapMm: gaps.positive,
    negativeGapMm: gaps.negative,
    positiveContactPoint: contacts.positive,
    negativeContactPoint: contacts.negative,
    status: diagnostics.length ? (direction ? 'PARTIAL' : 'UNRESOLVED') : 'RESOLVED',
    sourcePaths: evidence.sourcePaths,
    diagnostics,
  });
}
function resolveHostEdge(edges, support) {
  const explicit = stringValue(support.hostEntityId || support.edgeId || support.attachedEdgeId);
  if (explicit) {
    return edges.find((edge) => [edge.id, edge.componentKey].map(stringValue).includes(explicit)) || null;
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
  const y = x ? unit(cross(up, x)) : null;
  const z = x && y ? unit(cross(x, y)) : null;
  return x && y && z ? Object.freeze({ x, y, z, up }) : null;
}
function restraintDirection(evidence, frame) {
  const explicit = explicitDirection(evidence.directionToken, frame);
  if (explicit) return explicit;
  if (evidence.family === 'GUIDE') return frame?.y || null;
  if (['LINE_STOP', 'LIMIT'].includes(evidence.family)) return frame?.x || null;
  const verticalFamilies = ['REST', 'SHOE', 'TRUNNION', 'HANGER', 'HOLDOWN', 'U_BOLT', 'SPRING_HANGER'];
  return verticalFamilies.includes(evidence.family) ? frame?.up || null : null;
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
  return { required: false, positive: evidence.positiveGapMm, negative: evidence.negativeGapMm };
}
function contactPoints(origin, host, direction, family, gaps) {
  const diagnostics = [];
  if (!origin || !direction) return { positive: null, negative: null, diagnostics };
  const axial = ['LINE_STOP', 'LIMIT'].includes(family);
  const radius = axial ? 0 : hostOutsideRadius(host);
  if (!axial && radius === null) {
    diagnostics.push(diag(
      'HOST_OUTSIDE_DIAMETER_MISSING',
      'Radial restraint contact requires authoritative host outside diameter.',
    ));
  }
  return {
    positive: gaps.positive !== null && radius !== null
      ? add(origin, scale(direction, radius + gaps.positive)) : null,
    negative: gaps.negative !== null && radius !== null
      ? add(origin, scale(direction, -(radius + gaps.negative))) : null,
    diagnostics,
  };
}
function hostOutsideRadius(host) {
  const diameter = positive(host?.outsideDiameterMm);
  return diameter === null ? null : diameter / 2;
}
function explicitDirection(token, frame) {
  const global = {
    '+X': { x: 1, y: 0, z: 0 }, '-X': { x: -1, y: 0, z: 0 },
    '+Y': { x: 0, y: 1, z: 0 }, '-Y': { x: 0, y: -1, z: 0 },
    '+Z': { x: 0, y: 0, z: 1 }, '-Z': { x: 0, y: 0, z: -1 },
  };
  if (global[token]) return global[token];
  if (token === 'LOCAL_X') return frame?.x || null;
  if (token === 'LOCAL_Y') return frame?.y || null;
  if (token === 'LOCAL_Z') return frame?.z || null;
  return token === 'GLOBAL_VERTICAL' ? frame?.up || null : null;
}
function restraintRows(support) {
  if (Array.isArray(support.restraints)) return support.restraints;
  if (Array.isArray(support.restraint?.restraints)) return support.restraint.restraints;
  return support.restraint ? [support.restraint] : [];
}
function supportMarker(overlay, sizeMm) {
  return {
    id: overlay.supportId,
    entityId: overlay.supportId,
    type: 'SUPPORT',
    x: overlay.origin.x,
    y: overlay.origin.y,
    z: overlay.origin.z,
    sizeMm,
    pickTarget: { objectKind: 'support', objectId: overlay.supportId, supportId: overlay.supportId },
  };
}
function restraintPick(overlay, restraint) {
  return {
    objectKind: 'restraint',
    objectId: restraint.restraintId,
    supportId: overlay.supportId,
    restraintId: restraint.restraintId,
    restraintFamily: restraint.family,
    sourcePaths: restraint.sourcePaths,
  };
}
function sourcePaths(support, restraint) {
  return Object.freeze([...new Set([
    ...(support?.sourcePaths || []), support?.sourcePath,
    ...(restraint?.sourcePaths || []), restraint?.sourcePath,
  ].map(stringValue).filter(Boolean))].sort());
}
function statusFor(diagnostics, restraints) {
  return diagnostics.length || restraints.some((row) => row.status !== 'RESOLVED')
    ? 'PARTIAL' : 'RESOLVED';
}
function diag(code, message) { return Object.freeze({ code, severity: 'ERROR', message }); }
function globalVertical(axis) {
  return String(axis).toUpperCase() === 'Y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}
function canonicalDirection(value) {
  const normalized = unit(value);
  if (!normalized) return null;
  const first = [normalized.x, normalized.y, normalized.z]
    .find((row) => Math.abs(row) > 1e-12);
  return first < 0 ? scale(normalized, -1) : normalized;
}
function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? Object.freeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) }) : null;
}
function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function vector(a, b) { return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(value, scalar) {
  return cleanVector({ x: value.x * scalar, y: value.y * scalar, z: value.z * scalar });
}
function unit(value) {
  if (!value) return null;
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-12
    ? cleanVector({ x: value.x / length, y: value.y / length, z: value.z / length }) : null;
}
function cross(a, b) {
  return cleanVector({
    x: (a.y * b.z) - (a.z * b.y),
    y: (a.z * b.x) - (a.x * b.z),
    z: (a.x * b.y) - (a.y * b.x),
  });
}
function cleanVector(value) {
  return {
    x: Object.is(value.x, -0) ? 0 : value.x,
    y: Object.is(value.y, -0) ? 0 : value.y,
    z: Object.is(value.z, -0) ? 0 : value.z,
  };
}
function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
