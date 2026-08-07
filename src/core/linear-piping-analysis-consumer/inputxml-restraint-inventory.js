import {
  resolveRestraintTypeMutation,
  restraintTypeCodeLabel,
} from '../geometry/adapters/inputxml-restraint-type-mutation.js';
import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  exactDisposition,
  approximationDisposition,
  unsupportedDisposition,
  nonlinearDisposition,
  invalidDisposition,
  inactiveDisposition,
} from './inputxml-model-health-profile.js';

const NUMERIC_TOLERANCE = 1e-12;
const CAESAR_UNSET_SENTINEL = -1.0101;
const CAESAR_SENTINEL_TOLERANCE = 0.001;
const RESTRAINT_DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const GENERIC_LINEARIZED_UNILATERAL_CODES = new Set(['14', '15']);

export function classifyInputXmlRestraint(attributes, element, segment) {
  const rawType = attribute(attributes, ['TYPE']);
  const mutation = resolveRestraintTypeMutation(rawType);
  const typeCode = mutation.typeCode;
  const nodeId = normalizedNodeAttribute(attributes, ['NODE'])
    ?? element.toNodeId
    ?? element.fromNodeId
    ?? null;
  const direction = directionOf(attributes);
  const gap = caesarOptionalNumber(attributes, ['GAP', 'GAP1']);
  const friction = caesarOptionalNumber(attributes, ['FRIC_COEF', 'FRICTION', 'MU']);
  const connectingNodeId = normalizedNodeAttribute(attributes, ['CNODE', 'CONNECTING_NODE', 'NODE2']);
  const stiffness = caesarOptionalNumber(attributes, ['STIFF', 'STIFFNESS', 'K']);
  const targetDofs = targetDofsOf(typeCode, direction);
  const targetDof = targetDofs.length === RESTRAINT_DOFS.length ? 'ALL' : targetDofs[0] ?? null;
  const active = rawType !== null || nodeId !== null;
  return Object.freeze({
    active,
    rawType,
    typeCode,
    typeLabel: restraintTypeCodeLabel(typeCode),
    mutation,
    nodeId,
    targetDof,
    targetDofs: Object.freeze(targetDofs),
    direction,
    gapActive: finiteNonzero(gap),
    frictionActive: finitePositive(friction),
    connectingNodeActive: connectingNodeId !== null,
    connectingNodeId,
    finiteStiffnessActive: finitePositive(stiffness),
    canonicalNodeRestraint: canonicalNodeRestraint(segment, nodeId),
  });
}

export function inputXmlRestraintDispositions(classification) {
  if (!classification.active) return both(inactiveDisposition());
  if (classification.typeCode === null || classification.typeLabel === null || classification.nodeId === null) {
    return both(invalidDisposition('MODEL_RESTRAINT_SOURCE_INVALID'));
  }
  if (classification.gapActive) return both(nonlinearDisposition('MODEL_RESTRAINT_GAP_UNSUPPORTED'));
  if (classification.frictionActive) return both(nonlinearDisposition('MODEL_RESTRAINT_FRICTION_UNSUPPORTED'));
  if (classification.connectingNodeActive) {
    return both(unsupportedDisposition('MODEL_RESTRAINT_CONNECTING_NODE_UNSUPPORTED'));
  }
  if (classification.finiteStiffnessActive) {
    return both(unsupportedDisposition('MODEL_RESTRAINT_FINITE_STIFFNESS_UNSUPPORTED'));
  }
  if (classification.typeCode === '0') return both(exactDisposition());
  if (GENERIC_LINEARIZED_UNILATERAL_CODES.has(classification.typeCode)) {
    if (!classification.direction.valid || classification.targetDofs.length !== 1) {
      return both(invalidDisposition('MODEL_RESTRAINT_DIRECTION_INVALID'));
    }
    return {
      [STRICT]: nonlinearDisposition('MODEL_RESTRAINT_UNILATERAL_UNSUPPORTED'),
      [APPROXIMATE]: approximationDisposition('GENERIC_APPROX_UNILATERAL_LINEARIZED'),
    };
  }
  return both(unsupportedDisposition('MODEL_RESTRAINT_TYPE_NOT_COMPILED'));
}

export function inputXmlChildNodeIds(attributes, element) {
  const nodeId = normalizedNodeAttribute(attributes, ['NODE', 'NODE_NUM']);
  return [nodeId, element.fromNodeId, element.toNodeId];
}

export function inputXmlNumericAttribute(attributes, names) {
  const value = attribute(attributes, names);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function targetDofsOf(typeCode, direction) {
  if (typeCode === '0') return [...RESTRAINT_DOFS];
  if (!direction.valid || direction.dominantAxis === null) return [];
  return [direction.dominantAxis];
}

function directionOf(attributes) {
  const vector = [
    inputXmlNumericAttribute(attributes, ['XCOSINE']),
    inputXmlNumericAttribute(attributes, ['YCOSINE']),
    inputXmlNumericAttribute(attributes, ['ZCOSINE']),
  ];
  if (vector.every((value) => value === null)) {
    return Object.freeze({ vector: Object.freeze(vector), valid: false, dominantAxis: null });
  }
  if (!vector.every((value) => value !== null)) {
    return Object.freeze({ vector: Object.freeze(vector), valid: false, dominantAxis: null });
  }
  const magnitude = Math.hypot(...vector);
  if (!(magnitude > NUMERIC_TOLERANCE)) {
    return Object.freeze({ vector: Object.freeze(vector), magnitude, valid: false, dominantAxis: null });
  }
  const unit = vector.map((value) => value / magnitude);
  const absolute = unit.map(Math.abs);
  const dominantIndex = absolute.indexOf(Math.max(...absolute));
  return Object.freeze({
    vector: Object.freeze(vector),
    unit: Object.freeze(unit),
    magnitude,
    valid: Math.abs(magnitude - 1) <= 1e-9,
    dominantAxis: ['UX', 'UY', 'UZ'][dominantIndex],
  });
}

function canonicalNodeRestraint(segment, nodeId) {
  if (!segment || nodeId === null) return null;
  if (String(segment.startNodeId) === String(nodeId)) return 'START_NODE';
  if (String(segment.endNodeId) === String(nodeId)) return 'END_NODE';
  return 'UNBOUND_NODE';
}

function attribute(attributes, names) {
  for (const name of names) {
    const key = Object.keys(attributes ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (key !== undefined) {
      const text = String(attributes[key] ?? '').trim();
      return text.length > 0 ? text : null;
    }
  }
  return null;
}

function caesarOptionalNumber(attributes, names) {
  const value = inputXmlNumericAttribute(attributes, names);
  if (value === null) return null;
  return Math.abs(value - CAESAR_UNSET_SENTINEL) < CAESAR_SENTINEL_TOLERANCE
    ? null
    : value;
}

function normalizedNodeAttribute(attributes, names) {
  const value = attribute(attributes, names);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : value;
}

function finitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > NUMERIC_TOLERANCE;
}

function finiteNonzero(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > NUMERIC_TOLERANCE;
}

function both(disposition) {
  return Object.freeze({ [STRICT]: disposition, [APPROXIMATE]: disposition });
}
