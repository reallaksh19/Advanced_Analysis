import {
  deepFreeze,
  finiteNumber,
  isPlainRecord,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import { canonicalLengthFactor, normalizeLengthUnit } from '../piping-topology/index.js';
import { CANONICAL_LENGTH_UNIT, ENGINEERING_SUPPORT_PROJECTION_SCHEMA } from './constants.js';

export function projectEngineeringSupports(sharedModel) {
  assertSharedModel(sharedModel);
  const lengthUnit = normalizeLengthUnit(sharedModel.units?.length);
  const factor = canonicalLengthFactor(lengthUnit);
  const supports = sharedModel.supports.map((support) => projectSupport(support, lengthUnit, factor))
    .sort((left, right) => left.supportKey.localeCompare(right.supportKey));
  const diagnostics = projectionDiagnostics(supports, lengthUnit);
  const base = {
    schema: ENGINEERING_SUPPORT_PROJECTION_SCHEMA,
    datasetId: sharedModel.project.datasetId,
    sharedModelSemanticHash: sharedModel.semanticHash,
    lengthUnit,
    canonicalLengthUnit: CANONICAL_LENGTH_UNIT,
    supports,
    diagnostics,
    summary: projectionSummary(supports, diagnostics),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateEngineeringSupportProjection(projection) {
  const errors = [];
  if (!projection || projection.schema !== ENGINEERING_SUPPORT_PROJECTION_SCHEMA) errors.push('Invalid engineering support projection schema.');
  if (!stringValue(projection?.datasetId)) errors.push('Support projection datasetId is required.');
  if (!stringValue(projection?.sharedModelSemanticHash)) errors.push('Support projection shared-model hash is required.');
  validateRows(projection?.supports, 'supportKey', errors);
  if (!Array.isArray(projection?.diagnostics)) errors.push('Support projection diagnostics must be an array.');
  if (projection && projection.semanticHash !== semanticHash(withoutHash(projection))) errors.push('Support projection semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function projectSupport(support, lengthUnit, factor) {
  const evidence = isPlainRecord(support.supportEvidence) ? support.supportEvidence : {};
  const position = normalizePosition(support.position);
  return deepFreeze({
    supportKey: requiredString(support.supportKey, 'supportKey'),
    sourceEntityId: support.sourceEntityId ?? null,
    sourceType: stringValue(support.type || 'SUPPORT'),
    supportTypeEvidence: evidenceList(evidence.supportTypes),
    position,
    positionCanonical: scalePosition(position, factor),
    lengthUnit,
    identity: normalizeIdentity(support.identity),
    sourceReferences: cloneRecord(support.sourceReferences),
    attachmentEvidence: attachmentEvidence(evidence),
    capabilityEvidence: capabilityEvidence(evidence),
    gapEvidence: gapEvidence(evidence),
    stiffnessEvidence: evidenceList(evidence.stiffnessValues),
    springRateEvidence: evidenceList(evidence.springRateValues),
    frictionEvidence: evidenceList(evidence.frictionValues),
    multiAttachmentEvidence: evidenceList(evidence.multiAttachmentFlags),
    diagnostics: Array.isArray(support.diagnostics) ? [...support.diagnostics] : [],
  });
}

function attachmentEvidence(evidence) {
  return deepFreeze({
    portReferences: evidenceList(evidence.attachedPortReferences),
    componentReferences: evidenceList(evidence.attachedComponentReferences),
    supportedEntityReferences: evidenceList(evidence.supportedSourceEntityReferences),
  });
}

function capabilityEvidence(evidence) {
  return deepFreeze({
    vertical: evidenceList(evidence.verticalCapabilities),
    lateral: evidenceList(evidence.lateralCapabilities),
    longitudinal: evidenceList(evidence.longitudinalCapabilities),
    rotational: evidenceList(evidence.rotationalCapabilities),
  });
}

function gapEvidence(evidence) {
  return deepFreeze({
    vertical: evidenceList(evidence.verticalGaps),
    lateral: evidenceList(evidence.lateralGaps),
    longitudinal: evidenceList(evidence.longitudinalGaps),
  });
}

function projectionDiagnostics(supports, lengthUnit) {
  const rows = supports.filter((support) => !support.position).map((support) => diagnostic(
    'SUPPORT_POSITION_INVALID',
    support.supportKey,
    'Support position is missing or non-finite.',
  ));
  if (lengthUnit === 'unknown') rows.push(diagnostic(
    'SUPPORT_LENGTH_UNIT_UNKNOWN',
    'units.length',
    'Unknown length units block geometric support projection.',
    'WARNING',
  ));
  return rows.sort(diagnosticOrder);
}

function projectionSummary(supports, diagnostics) {
  return {
    supportCount: supports.length,
    validPositionCount: supports.filter((support) => support.position).length,
    invalidPositionCount: supports.filter((support) => !support.position).length,
    explicitPortReferenceCount: countEvidence(supports, 'portReferences'),
    explicitComponentReferenceCount: countEvidence(supports, 'componentReferences'),
    diagnosticCount: diagnostics.length,
  };
}

function countEvidence(supports, field) {
  return supports.filter((support) => support.attachmentEvidence[field].length > 0).length;
}

function evidenceList(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.filter(isPlainRecord).map((row) => deepFreeze(structuredClone(row))).sort(evidenceOrder);
}

function normalizePosition(value) {
  if (!isPlainRecord(value)) return null;
  const x = finiteNumber(value.x ?? value.X);
  const y = finiteNumber(value.y ?? value.Y);
  const z = finiteNumber(value.z ?? value.Z);
  return x === null || y === null || z === null ? null : deepFreeze({ x, y, z });
}

function scalePosition(position, factor) {
  return position && factor !== null
    ? deepFreeze({ x: position.x * factor, y: position.y * factor, z: position.z * factor })
    : null;
}

function normalizeIdentity(identity) {
  return deepFreeze({
    lineId: stringValue(identity?.lineId),
    branchId: stringValue(identity?.branchId),
    systemId: stringValue(identity?.systemId),
    zoneId: stringValue(identity?.zoneId),
  });
}

function cloneRecord(value) {
  return isPlainRecord(value) ? deepFreeze(structuredClone(value)) : deepFreeze({});
}

function diagnostic(code, scope, message, severity = 'ERROR') {
  return deepFreeze({ code, severity, scope, message });
}

function evidenceOrder(left, right) {
  return `${left.sourceKind || ''}|${left.sourcePath || ''}|${String(left.value)}`
    .localeCompare(`${right.sourceKind || ''}|${right.sourcePath || ''}|${String(right.value)}`);
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}

function validateRows(rows, key, errors) {
  if (!Array.isArray(rows)) return errors.push('Support projection supports must be an array.');
  const keys = rows.map((row) => stringValue(row?.[key]));
  if (keys.some((value) => !value)) errors.push('Support projection contains a missing supportKey.');
  if (new Set(keys).size !== keys.length) errors.push('Support projection contains duplicate supportKey values.');
}

function assertSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) throw new TypeError(`Support projection requires shared-piping-model/v1: ${validation.errors.join(' ')}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}
