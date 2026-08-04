import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import {
  SUPPLEMENTARY_GEOMETRY_SCHEMA,
  fail,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireMember,
  requirePositive,
  requireRecord,
  requireText,
} from './contract.js';

export const SUPPLEMENTARY_GEOMETRY_SET_SCHEMA = 'fea-b31-supplementary-geometry-set/v1';

export const SUPPLEMENTARY_GEOMETRY_SET_KEYS = Object.freeze([
  'schema',
  'geometrySetId',
  'sourceIdentity',
  'entries',
  'semanticHash',
]);

export const SUPPLEMENTARY_GEOMETRY_ENTRY_KEYS = Object.freeze([
  'schema',
  'segmentId',
  'componentType',
  'lengthUnit',
  'geometry',
  'sourceEvidence',
]);

export const SUPPLEMENTARY_SOURCE_KEYS = Object.freeze([
  'sourceId',
  'sourceRevision',
  'sourceSemanticHash',
]);

const BEND_GEOMETRY_KEYS = Object.freeze([
  'outerDiameter',
  'wallThickness',
  'bendRadius',
  'bendAngleDegrees',
  'smooth90FlexibilityCorrection',
  'pressure',
  'elasticModulus',
]);
const TEE_GEOMETRY_KEYS = Object.freeze([
  'runOuterDiameter',
  'runWallThickness',
  'branchOuterDiameter',
  'branchWallThickness',
  'fittingQuality',
]);
const REDUCER_GEOMETRY_KEYS = Object.freeze([
  'largeEndOuterDiameter',
  'largeEndWallThickness',
  'smallEndOuterDiameter',
  'smallEndWallThickness',
  'coneAngleDegrees',
  'smallEndTransitionRadius',
  'smallEndCylinderLength',
  'bodyMinimumWallThickness',
]);

function requireCanonicalIdentity(value, field) {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    fail(`${field} must be a canonical identity.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  }
}

function requireNullablePositive(value, field) {
  if (value === null) return null;
  return requirePositive(value, field, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
}

function requireNullableNonnegative(value, field) {
  if (value === null) return null;
  const number = requireFinite(value, field, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  if (number < 0) fail(`${field} must not be negative.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  return number;
}

function requireNullableFinite(value, field) {
  if (value === null) return null;
  return requireFinite(value, field, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
}

function validateSource(value, field) {
  requireExactKeys(value, SUPPLEMENTARY_SOURCE_KEYS, field, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requireText(value.sourceId, `${field}.sourceId`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requireText(value.sourceRevision, `${field}.sourceRevision`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requireHash(value.sourceSemanticHash, `${field}.sourceSemanticHash`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
}

function validateGeometry(entry, field) {
  if (entry.componentType === 'BEND') {
    requireExactKeys(entry.geometry, BEND_GEOMETRY_KEYS, `${field}.geometry`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
    requireNullablePositive(entry.geometry.outerDiameter, `${field}.geometry.outerDiameter`);
    requireNullablePositive(entry.geometry.wallThickness, `${field}.geometry.wallThickness`);
    requireNullablePositive(entry.geometry.bendRadius, `${field}.geometry.bendRadius`);
    requireNullableFinite(entry.geometry.bendAngleDegrees, `${field}.geometry.bendAngleDegrees`);
    if (typeof entry.geometry.smooth90FlexibilityCorrection !== 'boolean') {
      fail(`${field}.geometry.smooth90FlexibilityCorrection must be boolean.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
    }
    requireNullableNonnegative(entry.geometry.pressure, `${field}.geometry.pressure`);
    requireNullablePositive(entry.geometry.elasticModulus, `${field}.geometry.elasticModulus`);
    return;
  }
  if (entry.componentType === 'WELDING_TEE') {
    requireExactKeys(entry.geometry, TEE_GEOMETRY_KEYS, `${field}.geometry`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
    requireNullablePositive(entry.geometry.runOuterDiameter, `${field}.geometry.runOuterDiameter`);
    requireNullablePositive(entry.geometry.runWallThickness, `${field}.geometry.runWallThickness`);
    requirePositive(entry.geometry.branchOuterDiameter, `${field}.geometry.branchOuterDiameter`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
    requirePositive(entry.geometry.branchWallThickness, `${field}.geometry.branchWallThickness`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
    requireMember(entry.geometry.fittingQuality, ['UNVERIFIED', 'VERIFIED_B16_9'], `${field}.geometry.fittingQuality`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
    return;
  }
  requireExactKeys(entry.geometry, REDUCER_GEOMETRY_KEYS, `${field}.geometry`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requireNullablePositive(entry.geometry.largeEndOuterDiameter, `${field}.geometry.largeEndOuterDiameter`);
  requireNullablePositive(entry.geometry.largeEndWallThickness, `${field}.geometry.largeEndWallThickness`);
  requirePositive(entry.geometry.smallEndOuterDiameter, `${field}.geometry.smallEndOuterDiameter`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requirePositive(entry.geometry.smallEndWallThickness, `${field}.geometry.smallEndWallThickness`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requirePositive(entry.geometry.coneAngleDegrees, `${field}.geometry.coneAngleDegrees`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requirePositive(entry.geometry.smallEndTransitionRadius, `${field}.geometry.smallEndTransitionRadius`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  if (entry.geometry.smallEndCylinderLength === null) fail(`${field}.geometry.smallEndCylinderLength must be declared.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  requireNullableNonnegative(entry.geometry.smallEndCylinderLength, `${field}.geometry.smallEndCylinderLength`);
  requirePositive(entry.geometry.bodyMinimumWallThickness, `${field}.geometry.bodyMinimumWallThickness`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
}

function validateEntry(entry, position) {
  const field = `supplementaryGeometrySet.entries[${position}]`;
  requireExactKeys(entry, SUPPLEMENTARY_GEOMETRY_ENTRY_KEYS, field, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  if (entry.schema !== SUPPLEMENTARY_GEOMETRY_SCHEMA) {
    fail(`${field}.schema must be ${SUPPLEMENTARY_GEOMETRY_SCHEMA}.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  }
  requireCanonicalIdentity(entry.segmentId, `${field}.segmentId`);
  requireMember(entry.componentType, ['BEND', 'WELDING_TEE', 'REDUCER'], `${field}.componentType`, 'B31_FACTOR_SUPPLEMENTARY_COMPONENT_TYPE_INVALID');
  requireText(entry.lengthUnit, `${field}.lengthUnit`, 'B31_FACTOR_SUPPLEMENTARY_LENGTH_UNIT_REQUIRED');
  requireRecord(entry.geometry, `${field}.geometry`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  validateGeometry(entry, field);
  validateSource(entry.sourceEvidence, `${field}.sourceEvidence`);
}

function projection(set) {
  return {
    schema: set.schema,
    geometrySetId: set.geometrySetId,
    sourceIdentity: set.sourceIdentity,
    entries: set.entries,
  };
}

export function computeSupplementaryGeometrySetSemanticHash(set) {
  return semanticHash(projection(set));
}

export function sealSupplementaryGeometrySet(set) {
  requireExactKeys(set, SUPPLEMENTARY_GEOMETRY_SET_KEYS, 'supplementaryGeometrySet', 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  if (set.schema !== SUPPLEMENTARY_GEOMETRY_SET_SCHEMA) {
    fail(`supplementaryGeometrySet.schema must be ${SUPPLEMENTARY_GEOMETRY_SET_SCHEMA}.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  }
  requireCanonicalIdentity(set.geometrySetId, 'supplementaryGeometrySet.geometrySetId');
  validateSource(set.sourceIdentity, 'supplementaryGeometrySet.sourceIdentity');
  if (!Array.isArray(set.entries)) fail('supplementaryGeometrySet.entries must be an array.', 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  const sorted = [...set.entries].sort((left, right) => (left.segmentId < right.segmentId ? -1 : left.segmentId > right.segmentId ? 1 : 0));
  const seen = new Set();
  sorted.forEach((entry, position) => {
    validateEntry(entry, position);
    if (seen.has(entry.segmentId)) {
      fail(`supplementaryGeometrySet declares ${entry.segmentId} more than once.`, 'B31_FACTOR_SUPPLEMENTARY_SEGMENT_DUPLICATE');
    }
    seen.add(entry.segmentId);
  });
  const draft = {
    schema: set.schema,
    geometrySetId: set.geometrySetId,
    sourceIdentity: { ...set.sourceIdentity },
    entries: sorted.map((entry) => ({
      ...entry,
      geometry: { ...entry.geometry },
      sourceEvidence: { ...entry.sourceEvidence },
    })),
    semanticHash: '',
  };
  draft.semanticHash = computeSupplementaryGeometrySetSemanticHash(draft);
  return requireSupplementaryGeometrySet(draft);
}

export function requireSupplementaryGeometrySet(set) {
  requireExactKeys(set, SUPPLEMENTARY_GEOMETRY_SET_KEYS, 'supplementaryGeometrySet', 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  if (set.schema !== SUPPLEMENTARY_GEOMETRY_SET_SCHEMA) {
    fail(`supplementaryGeometrySet.schema must be ${SUPPLEMENTARY_GEOMETRY_SET_SCHEMA}.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  }
  requireHash(set.semanticHash, 'supplementaryGeometrySet.semanticHash', 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  set.entries.forEach(validateEntry);
  if (set.semanticHash !== computeSupplementaryGeometrySetSemanticHash(set)) {
    fail('supplementaryGeometrySet.semanticHash is stale.', 'B31_FACTOR_HASH_MISMATCH');
  }
  return deepFreeze({
    ...projection(set),
    entries: set.entries.map((entry) => deepFreeze({
      ...entry,
      geometry: deepFreeze({ ...entry.geometry }),
      sourceEvidence: deepFreeze({ ...entry.sourceEvidence }),
    })),
    semanticHash: set.semanticHash,
  });
}

export function indexSupplementaryGeometrySet(set) {
  if (set === null) return new Map();
  const accepted = requireSupplementaryGeometrySet(set);
  return new Map(accepted.entries.map((entry) => [entry.segmentId, entry]));
}
