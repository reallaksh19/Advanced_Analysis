import {
  deepFreeze,
  finiteNumber,
  isPlainRecord,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import { canonicalLengthFactor, canonicalLengthUnit, normalizeLengthUnit } from './connection-profile.js';
import { ENGINEERING_PORT_PROJECTION_SCHEMA, TOPOLOGY_STATES } from './constants.js';

export function projectEngineeringPorts(sharedModel) {
  assertSharedModel(sharedModel);
  const lengthUnit = normalizeLengthUnit(sharedModel.units?.length);
  const factor = canonicalLengthFactor(lengthUnit);
  const components = sharedModel.components.map(projectComponent).sort(byKey('componentKey'));
  const ports = sharedModel.unconnectedPorts.map((port) => projectPort(port, components, lengthUnit, factor)).sort(byKey('portKey'));
  const diagnostics = projectionDiagnostics(ports, lengthUnit);
  const base = {
    schema: ENGINEERING_PORT_PROJECTION_SCHEMA,
    datasetId: sharedModel.project.datasetId,
    modelSemanticHash: sharedModel.semanticHash,
    lengthUnit,
    canonicalLengthUnit: canonicalLengthUnit(),
    components,
    ports,
    diagnostics,
    summary: projectionSummary(components, ports, diagnostics),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateEngineeringPortProjection(projection) {
  const errors = [];
  if (!projection || projection.schema !== ENGINEERING_PORT_PROJECTION_SCHEMA) errors.push('Invalid engineering port projection schema.');
  if (!stringValue(projection?.datasetId)) errors.push('Port projection datasetId is required.');
  if (!stringValue(projection?.modelSemanticHash)) errors.push('Port projection model hash is required.');
  validateUniqueRows(projection?.components, 'componentKey', 'components', errors);
  validateUniqueRows(projection?.ports, 'portKey', 'ports', errors);
  if (!Array.isArray(projection?.diagnostics)) errors.push('Port projection diagnostics must be an array.');
  if (projection && projection.semanticHash !== semanticHash(withoutHash(projection))) errors.push('Port projection semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function projectComponent(component) {
  return deepFreeze({
    componentKey: requiredString(component?.componentKey, 'componentKey'),
    type: stringValue(component?.type || 'UNKNOWN'),
    engineeringIdentity: normalizeIdentity(component?.identity),
    portKeys: (component?.geometry?.ports || []).map((port) => stringValue(port?.portKey)).filter(Boolean).sort(),
    sourceReferences: cloneRecord(component?.sourceReferences),
  });
}

function projectPort(port, components, lengthUnit, factor) {
  const componentKey = requiredString(port?.componentKey, 'port.componentKey');
  const component = components.find((row) => row.componentKey === componentKey);
  const position = normalizePosition(port?.position);
  const sourceReference = cloneRecord(port?.sourceReference);
  return deepFreeze({
    portKey: requiredString(port?.portKey, 'port.portKey'),
    componentKey,
    role: stringValue(port?.role || 'port'),
    position,
    positionCanonical: factor === null ? null : scalePosition(position, factor),
    sourceReference,
    explicitPeerPortKeys: explicitPeerKeys(port, sourceReference),
    explicitReferenceIds: explicitReferenceIds(port, sourceReference),
    sourceEndpointIdentity: endpointIdentity(port, sourceReference),
    engineeringIdentity: component?.engineeringIdentity || normalizeIdentity({}),
    multiConnection: multiConnectionFlag(port, sourceReference),
    coordinateEvidence: coordinateEvidence(position, lengthUnit, factor),
  });
}

function projectionDiagnostics(ports, lengthUnit) {
  const diagnostics = ports.filter((port) => !port.position).map((port) => ({
    code: 'TOPOLOGY_PORT_POSITION_INVALID',
    severity: 'ERROR',
    scope: port.portKey,
    state: TOPOLOGY_STATES.INVALID_POSITION,
    message: 'Port position is missing or non-finite.',
  }));
  if (lengthUnit === 'unknown') diagnostics.push({
    code: 'TOPOLOGY_LENGTH_UNIT_UNKNOWN',
    severity: 'WARNING',
    scope: 'units.length',
    state: TOPOLOGY_STATES.UNIT_BLOCKED,
    message: 'Unknown length units permit exact equality only and block tolerance inference.',
  });
  return diagnostics.sort(diagnosticOrder);
}

function projectionSummary(components, ports, diagnostics) {
  return {
    componentCount: components.length,
    portCount: ports.length,
    validPositionCount: ports.filter((port) => port.position).length,
    invalidPositionCount: ports.filter((port) => !port.position).length,
    multiPortComponentCount: components.filter((component) => component.portKeys.length > 2).length,
    diagnosticCount: diagnostics.length,
  };
}

function explicitPeerKeys(port, sourceReference) {
  return stringList([
    port?.explicitPeerPortKey,
    port?.peerPortKey,
    port?.explicitPeerPortKeys,
    port?.peerPortKeys,
    sourceReference.explicitPeerPortKey,
    sourceReference.peerPortKey,
    sourceReference.connectedPortKey,
    sourceReference.explicitPeerPortKeys,
    sourceReference.peerPortKeys,
  ]);
}

function explicitReferenceIds(port, sourceReference) {
  return stringList([
    port?.explicitConnectionId,
    port?.connectionReferenceId,
    port?.connectionId,
    port?.explicitConnectionIds,
    port?.connectionReferenceIds,
    sourceReference.explicitConnectionId,
    sourceReference.connectionReferenceId,
    sourceReference.connectionId,
    sourceReference.referenceId,
    sourceReference.explicitConnectionIds,
    sourceReference.connectionReferenceIds,
    sourceReference.connectionIds,
  ]);
}

function endpointIdentity(port, sourceReference) {
  return firstString([
    port?.sourceEndpointIdentity,
    port?.sourceEndpointId,
    sourceReference.sourceEndpointIdentity,
    sourceReference.sourceEndpointId,
    sourceReference.endpointIdentity,
    sourceReference.endpointId,
    sourceReference.sourceNodeId,
    sourceReference.nodeId,
  ]);
}

function coordinateEvidence(position, lengthUnit, factor) {
  return deepFreeze({
    sourceUnit: lengthUnit,
    canonicalUnit: factor === null ? null : canonicalLengthUnit(),
    canonicalized: Boolean(position && factor !== null),
  });
}

function normalizeIdentity(identity) {
  return deepFreeze({
    lineId: stringValue(identity?.lineId),
    branchId: stringValue(identity?.branchId),
    systemId: stringValue(identity?.systemId),
    zoneId: stringValue(identity?.zoneId),
  });
}

function normalizePosition(value) {
  if (!isPlainRecord(value)) return null;
  const x = finiteNumber(value.x ?? value.X);
  const y = finiteNumber(value.y ?? value.Y);
  const z = finiteNumber(value.z ?? value.Z);
  return x === null || y === null || z === null ? null : deepFreeze({ x, y, z });
}

function scalePosition(position, factor) {
  return position ? deepFreeze({ x: position.x * factor, y: position.y * factor, z: position.z * factor }) : null;
}

function multiConnectionFlag(port, sourceReference) {
  return port?.multiConnection === true
    || port?.allowMultipleConnections === true
    || sourceReference.multiConnection === true
    || sourceReference.allowMultipleConnections === true;
}

function stringList(values) {
  const flat = values.flatMap((value) => Array.isArray(value) ? value : [value]);
  return [...new Set(flat.map(stringValue).filter(Boolean))].sort();
}

function firstString(values) {
  return values.map(stringValue).find(Boolean) || '';
}

function validateUniqueRows(rows, key, label, errors) {
  if (!Array.isArray(rows)) return errors.push(`Port projection ${label} must be an array.`);
  const keys = rows.map((row) => stringValue(row?.[key]));
  if (keys.some((value) => !value)) errors.push(`Port projection ${label} contains a missing ${key}.`);
  if (new Set(keys).size !== keys.length) errors.push(`Port projection ${label} contains duplicate ${key} values.`);
}

function assertSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  const blockers = validation.errors.filter((error) => !isRecoverablePositionError(error));
  if (blockers.length) throw new TypeError(`Port projection requires shared-piping-model/v1: ${blockers.join(' ')}`);
}

function isRecoverablePositionError(error) {
  return /^Shared model port .+ position is required\.$/.test(error);
}

function cloneRecord(value) {
  return isPlainRecord(value) ? deepFreeze(structuredClone(value)) : deepFreeze({});
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function byKey(field) {
  return (left, right) => stringValue(left?.[field]).localeCompare(stringValue(right?.[field]));
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
