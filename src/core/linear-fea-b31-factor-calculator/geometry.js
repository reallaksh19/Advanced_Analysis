import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  fail,
  requireExactKeys,
  requireMember,
  requireNonnegative,
  requirePositive,
  requireRecord,
  requireText,
} from './contract.js';

const SOURCE_KEYS = Object.freeze(['sourceId', 'sourceRevision']);
const BEND_KEYS = Object.freeze([
  'schema', 'componentType', 'lengthUnit', 'outerDiameter', 'wallThickness', 'bendRadius',
  'pressure', 'elasticModulus', 'sourceEvidence',
]);
const TEE_KEYS = Object.freeze([
  'schema', 'componentType', 'lengthUnit', 'runOuterDiameter', 'runWallThickness',
  'branchOuterDiameter', 'branchWallThickness', 'fittingQuality', 'sourceEvidence',
]);
const REDUCER_KEYS = Object.freeze([
  'schema', 'componentType', 'lengthUnit', 'largeEndOuterDiameter', 'largeEndWallThickness',
  'smallEndOuterDiameter', 'smallEndWallThickness', 'coneAngleDegrees',
  'smallEndTransitionRadius', 'smallEndCylinderLength', 'bodyMinimumWallThickness',
  'sourceEvidence',
]);

function requireSourceEvidence(sourceEvidence) {
  requireExactKeys(sourceEvidence, SOURCE_KEYS, 'geometry.sourceEvidence', 'B31_FACTOR_GEOMETRY_SOURCE_INVALID');
  requireText(sourceEvidence.sourceId, 'geometry.sourceEvidence.sourceId', 'B31_FACTOR_GEOMETRY_SOURCE_INVALID');
  requireText(sourceEvidence.sourceRevision, 'geometry.sourceEvidence.sourceRevision', 'B31_FACTOR_GEOMETRY_SOURCE_INVALID');
  return sourceEvidence;
}

function requireMetreGeometry(geometry) {
  if (geometry.lengthUnit !== 'm') {
    fail('geometry.lengthUnit must be m; source-unit geometry must be normalized before factor calculation.', 'B31_FACTOR_LENGTH_UNIT_NOT_NORMALIZED');
  }
  return geometry.lengthUnit;
}

function normalizeBendGeometry(geometry) {
  requireExactKeys(geometry, BEND_KEYS, 'geometry', 'B31_FACTOR_GEOMETRY_INVALID');
  requireMetreGeometry(geometry);
  const outerDiameter = requirePositive(geometry.outerDiameter, 'geometry.outerDiameter');
  const wallThickness = requirePositive(geometry.wallThickness, 'geometry.wallThickness');
  if (!(2 * wallThickness < outerDiameter)) {
    fail('geometry.wallThickness must leave a positive bore.', 'B31_FACTOR_GEOMETRY_INVALID');
  }
  return {
    ...geometry,
    outerDiameter,
    wallThickness,
    bendRadius: requirePositive(geometry.bendRadius, 'geometry.bendRadius'),
    pressure: requireNonnegative(geometry.pressure, 'geometry.pressure'),
    elasticModulus: requirePositive(geometry.elasticModulus, 'geometry.elasticModulus'),
    sourceEvidence: { ...requireSourceEvidence(geometry.sourceEvidence) },
  };
}

function normalizeTeeGeometry(geometry) {
  requireExactKeys(geometry, TEE_KEYS, 'geometry', 'B31_FACTOR_GEOMETRY_INVALID');
  requireMetreGeometry(geometry);
  const runOuterDiameter = requirePositive(geometry.runOuterDiameter, 'geometry.runOuterDiameter');
  const runWallThickness = requirePositive(geometry.runWallThickness, 'geometry.runWallThickness');
  const branchOuterDiameter = requirePositive(geometry.branchOuterDiameter, 'geometry.branchOuterDiameter');
  const branchWallThickness = requirePositive(geometry.branchWallThickness, 'geometry.branchWallThickness');
  if (!(2 * runWallThickness < runOuterDiameter) || !(2 * branchWallThickness < branchOuterDiameter)) {
    fail('Tee wall thicknesses must leave positive bores.', 'B31_FACTOR_GEOMETRY_INVALID');
  }
  requireMember(
    geometry.fittingQuality,
    ['VERIFIED_B16_9', 'IMPERFECT_OR_DAMAGED', 'UNVERIFIED'],
    'geometry.fittingQuality',
    'B31_FACTOR_TEE_QUALITY_INVALID',
  );
  return {
    ...geometry,
    runOuterDiameter,
    runWallThickness,
    branchOuterDiameter,
    branchWallThickness,
    sourceEvidence: { ...requireSourceEvidence(geometry.sourceEvidence) },
  };
}

function normalizeReducerGeometry(geometry) {
  requireExactKeys(geometry, REDUCER_KEYS, 'geometry', 'B31_FACTOR_GEOMETRY_INVALID');
  requireMetreGeometry(geometry);
  const values = {
    largeEndOuterDiameter: requirePositive(geometry.largeEndOuterDiameter, 'geometry.largeEndOuterDiameter'),
    largeEndWallThickness: requirePositive(geometry.largeEndWallThickness, 'geometry.largeEndWallThickness'),
    smallEndOuterDiameter: requirePositive(geometry.smallEndOuterDiameter, 'geometry.smallEndOuterDiameter'),
    smallEndWallThickness: requirePositive(geometry.smallEndWallThickness, 'geometry.smallEndWallThickness'),
    coneAngleDegrees: requirePositive(geometry.coneAngleDegrees, 'geometry.coneAngleDegrees'),
    smallEndTransitionRadius: requirePositive(geometry.smallEndTransitionRadius, 'geometry.smallEndTransitionRadius'),
    smallEndCylinderLength: requireNonnegative(geometry.smallEndCylinderLength, 'geometry.smallEndCylinderLength'),
    bodyMinimumWallThickness: requirePositive(geometry.bodyMinimumWallThickness, 'geometry.bodyMinimumWallThickness'),
  };
  if (!(values.smallEndOuterDiameter < values.largeEndOuterDiameter)) {
    fail('Reducer small-end diameter must be less than the large-end diameter.', 'B31_FACTOR_GEOMETRY_INVALID');
  }
  if (!(2 * values.largeEndWallThickness < values.largeEndOuterDiameter)
      || !(2 * values.smallEndWallThickness < values.smallEndOuterDiameter)) {
    fail('Reducer wall thicknesses must leave positive bores.', 'B31_FACTOR_GEOMETRY_INVALID');
  }
  return {
    ...geometry,
    ...values,
    sourceEvidence: { ...requireSourceEvidence(geometry.sourceEvidence) },
  };
}

export function normalizeComponentGeometry(geometry) {
  requireRecord(geometry, 'geometry', 'B31_FACTOR_GEOMETRY_INVALID');
  if (geometry.schema !== COMPONENT_GEOMETRY_SCHEMA) {
    fail(`geometry.schema must be ${COMPONENT_GEOMETRY_SCHEMA}.`, 'B31_FACTOR_GEOMETRY_INVALID');
  }
  let normalized;
  if (geometry.componentType === 'BEND') normalized = normalizeBendGeometry(geometry);
  else if (geometry.componentType === 'WELDING_TEE') normalized = normalizeTeeGeometry(geometry);
  else if (geometry.componentType === 'REDUCER') normalized = normalizeReducerGeometry(geometry);
  else fail('geometry.componentType is unsupported.', 'B31_FACTOR_COMPONENT_NOT_IMPLEMENTED');
  return deepFreeze(normalized);
}

export function bendGeometry(input) {
  return normalizeComponentGeometry({ schema: COMPONENT_GEOMETRY_SCHEMA, componentType: 'BEND', ...input });
}

export function weldingTeeGeometry(input) {
  return normalizeComponentGeometry({ schema: COMPONENT_GEOMETRY_SCHEMA, componentType: 'WELDING_TEE', ...input });
}

export function reducerGeometry(input) {
  return normalizeComponentGeometry({ schema: COMPONENT_GEOMETRY_SCHEMA, componentType: 'REDUCER', ...input });
}
