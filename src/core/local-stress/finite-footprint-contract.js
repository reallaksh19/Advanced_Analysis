import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { RESULT_SCHEMA } from './constants.js';
import { finiteNumber, positiveNumber } from './numeric.js';
import { reconstructResultHashes } from './result-hashes.js';
import { cross, norm, normalize, subtract, vector3 } from './vector-math.js';

export const FINITE_FOOTPRINT_REQUEST_SCHEMA = 'lafea-load-foundation-footprint-request/v2';
export const FINITE_FOOTPRINT_RESULT_SCHEMA = 'lafea-load-foundation-footprint-result/v2';
export const FINITE_FOOTPRINT_TYPES = Object.freeze([
  'POINT', 'LINE', 'RECTANGULAR_PATCH', 'CIRCULAR_PATCH', 'WELD_LINE', 'RIGID_SPIDER',
]);
export const FINITE_FOOTPRINT_DISTRIBUTION_RULE =
  'WEIGHTED_FORCE_WITH_EXPLICIT_BALANCING_STATION_COUPLES_V1';
export const FINITE_FOOTPRINT_LIMITATIONS = Object.freeze([
  'NO_LOCAL_ATTACHMENT_STRESS',
  'NO_FEA',
  'NO_CONTACT',
  'NO_WELD_STRESS',
  'NO_CODE_COMPLIANCE',
  'STATION_FORCE_AND_COUPLE_RESULTANTS_ONLY',
]);

export function normalizeFiniteFootprintRequest(input) {
  const row = exactRecord(input, [
    'schema', 'requestIdentity', 'requestVersion', 'foundationResult',
    'loadCaseIdentity', 'referencePoint', 'footprint', 'pressureThrusts',
    'qualificationProfile', 'limitations',
  ], 'request');
  if (row.schema !== FINITE_FOOTPRINT_REQUEST_SCHEMA) {
    throw footprintError('FOOTPRINT_REQUEST_SCHEMA_MISMATCH', 'schema');
  }
  return deepFreeze({
    schema: row.schema,
    requestIdentity: text(row.requestIdentity, 'requestIdentity'),
    requestVersion: text(row.requestVersion, 'requestVersion'),
    foundationResult: validateFoundationResult(row.foundationResult),
    loadCaseIdentity: text(row.loadCaseIdentity, 'loadCaseIdentity'),
    referencePoint: vector3(row.referencePoint, 'referencePoint'),
    footprint: normalizeFootprint(row.footprint),
    pressureThrusts: normalizePressureThrusts(row.pressureThrusts),
    qualificationProfile: normalizeProfile(row.qualificationProfile),
    limitations: stringArray(row.limitations, 'limitations'),
  });
}

export function validateFiniteFootprintDistribution(result) {
  if (!isRecord(result) || result.schema !== FINITE_FOOTPRINT_RESULT_SCHEMA) {
    throw footprintError('FOOTPRINT_RESULT_SCHEMA_MISMATCH', 'schema');
  }
  const copy = structuredClone(result);
  const hash = copy.semanticHash;
  delete copy.semanticHash;
  if (hash !== semanticHash(copy)) {
    throw footprintError('FOOTPRINT_RESULT_HASH_MISMATCH', 'semanticHash');
  }
  if (result.qualification?.state !== 'ACCEPTED' || result.equilibrium?.accepted !== true) {
    throw footprintError('FOOTPRINT_RESULT_NOT_ACCEPTED', 'qualification.state');
  }
  assertResidual(result.equilibrium.forceResidual,
    result.equilibrium.tolerances.force, 'FOOTPRINT_FORCE_CLOSURE_FAILED');
  assertResidual(result.equilibrium.momentResidual,
    result.equilibrium.tolerances.moment, 'FOOTPRINT_MOMENT_CLOSURE_FAILED');
  return deepFreeze({ ...copy, semanticHash: hash });
}

export function requireFiniteFootprintFoundationLoad(result, identity) {
  const load = result.transformedLoadCases?.find((row) => row.identity === identity);
  if (!load) throw footprintError('FOUNDATION_LOAD_CASE_MISSING', 'loadCaseIdentity');
  return load;
}

export function mergedFiniteFootprintLimitations(values) {
  return [...new Set([...FINITE_FOOTPRINT_LIMITATIONS, ...values])].sort();
}

export function assertFiniteFootprintResidual(values, toleranceValue, code) {
  assertResidual(values, toleranceValue, code);
}

function validateFoundationResult(result) {
  if (!isRecord(result) || result.schema !== RESULT_SCHEMA
    || result.qualification?.state !== 'ACCEPTED') {
    throw footprintError('FOUNDATION_RESULT_NOT_ACCEPTED', 'foundationResult');
  }
  const reconstructed = reconstructResultHashes(result);
  for (const [key, value] of Object.entries(reconstructed)) {
    if (result.semanticHashes?.[key] !== value) {
      throw footprintError('FOUNDATION_RESULT_HASH_MISMATCH', `foundationResult.semanticHashes.${key}`);
    }
  }
  return deepFreeze(structuredClone(result));
}

function normalizeFootprint(value) {
  const row = exactRecord(value,
    ['footprintIdentity', 'type', 'stations', 'sourceReference'], 'footprint');
  if (!FINITE_FOOTPRINT_TYPES.includes(row.type)) {
    throw footprintError('FOOTPRINT_TYPE_UNSUPPORTED', 'footprint.type');
  }
  if (!Array.isArray(row.stations) || row.stations.length === 0) {
    throw footprintError('FOOTPRINT_STATIONS_REQUIRED', 'footprint.stations');
  }
  const stations = row.stations.map((station, index) => {
    const path = `footprint.stations[${index}]`;
    const source = exactRecord(station,
      ['stationId', 'position', 'weight', 'sourceReference'], path);
    return {
      stationId: text(source.stationId, `${path}.stationId`),
      position: vector3(source.position, `${path}.position`),
      weight: positiveNumber(source.weight, `${path}.weight`),
      sourceReference: text(source.sourceReference, `${path}.sourceReference`),
    };
  }).sort((left, right) => left.stationId.localeCompare(right.stationId));
  if (new Set(stations.map((station) => station.stationId)).size !== stations.length) {
    throw footprintError('DUPLICATE_FOOTPRINT_STATION', 'footprint.stations');
  }
  qualifyGeometry(row.type, stations);
  return {
    footprintIdentity: text(row.footprintIdentity, 'footprint.footprintIdentity'),
    type: row.type,
    stations,
    sourceReference: text(row.sourceReference, 'footprint.sourceReference'),
  };
}

function qualifyGeometry(type, stations) {
  const minimumCounts = {
    POINT: 1, LINE: 2, RECTANGULAR_PATCH: 4,
    CIRCULAR_PATCH: 4, WELD_LINE: 2, RIGID_SPIDER: 3,
  };
  if (stations.length < minimumCounts[type] || (type === 'POINT' && stations.length !== 1)) {
    throw footprintError('FOOTPRINT_STATION_COUNT_INVALID', 'footprint.stations');
  }
  if (type === 'POINT') return;
  const origin = stations[0].position;
  const vectors = stations.slice(1).map((station) => subtract(station.position, origin));
  const scaleLength = Math.max(1, ...vectors.map(norm));
  const lengthTolerance = 1e-12 * scaleLength;
  if (!vectors.some((vector) => norm(vector) > lengthTolerance)) {
    throw footprintError('FOOTPRINT_GEOMETRY_RANK_DEFICIENT', 'footprint.stations');
  }
  if (['RECTANGULAR_PATCH', 'CIRCULAR_PATCH', 'RIGID_SPIDER'].includes(type)) {
    const areaTolerance = 1e-12 * scaleLength * scaleLength;
    const nonCollinear = vectors.some((left, leftIndex) => vectors
      .some((right, rightIndex) => rightIndex > leftIndex
        && norm(cross(left, right)) > areaTolerance));
    if (!nonCollinear) {
      throw footprintError('FOOTPRINT_GEOMETRY_RANK_DEFICIENT', 'footprint.stations');
    }
  }
}

function normalizePressureThrusts(values) {
  if (!Array.isArray(values)) {
    throw footprintError('PRESSURE_THRUST_ARRAY_REQUIRED', 'pressureThrusts');
  }
  const rows = values.map((value, index) => {
    const path = `pressureThrusts[${index}]`;
    const row = exactRecord(value, [
      'thrustId', 'pressure', 'area', 'normal', 'applicationPoint', 'sourceReference',
    ], path);
    return {
      thrustId: text(row.thrustId, `${path}.thrustId`),
      pressure: finiteNumber(row.pressure, `${path}.pressure`),
      area: positiveNumber(row.area, `${path}.area`),
      normal: normalize(vector3(row.normal, `${path}.normal`), `${path}.normal`),
      applicationPoint: vector3(row.applicationPoint, `${path}.applicationPoint`),
      sourceReference: text(row.sourceReference, `${path}.sourceReference`),
    };
  }).sort((left, right) => left.thrustId.localeCompare(right.thrustId));
  if (new Set(rows.map((row) => row.thrustId)).size !== rows.length) {
    throw footprintError('DUPLICATE_PRESSURE_THRUST', 'pressureThrusts');
  }
  return rows;
}

function normalizeProfile(value) {
  const row = exactRecord(value, ['identity', 'forceTolerance', 'momentTolerance'],
    'qualificationProfile');
  return {
    identity: text(row.identity, 'qualificationProfile.identity'),
    forceTolerance: toleranceRule(row.forceTolerance, 'qualificationProfile.forceTolerance'),
    momentTolerance: toleranceRule(row.momentTolerance, 'qualificationProfile.momentTolerance'),
  };
}

function toleranceRule(value, path) {
  const row = exactRecord(value, ['absolute', 'relative'], path);
  const absolute = finiteNumber(row.absolute, `${path}.absolute`);
  const relative = finiteNumber(row.relative, `${path}.relative`);
  if (absolute < 0 || relative < 0) throw footprintError('NEGATIVE_TOLERANCE', path);
  return { absolute, relative };
}

function assertResidual(values, toleranceValue, code) {
  if (!Array.isArray(values) || values.length !== 3
    || values.some((value) => !Number.isFinite(value) || Math.abs(value) > toleranceValue)) {
    throw footprintError(code, 'equilibrium');
  }
}

function exactRecord(value, keys, path) {
  if (!isRecord(value)) throw footprintError('OBJECT_REQUIRED', path);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw footprintError('EXACT_KEYS_REQUIRED', path);
  }
  return value;
}

function stringArray(value, path) {
  if (!Array.isArray(value)) throw footprintError('STRING_ARRAY_REQUIRED', path);
  return [...new Set(value.map((row, index) => text(row, `${path}[${index}]`)))].sort();
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw footprintError('TEXT_REQUIRED', path);
  return value.trim();
}

function footprintError(code, path) {
  const error = new TypeError(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  return error;
}

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
