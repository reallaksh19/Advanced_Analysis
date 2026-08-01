import {
  LOAD_FOUNDATION_LIMITATIONS,
  LOAD_FOUNDATION_METHODS,
  LOAD_FOUNDATION_SCHEMA,
} from './constants.js';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const METHOD_MINIMUM_STATIONS = Object.freeze({
  POINT: 1,
  LINE: 2,
  RECTANGULAR_PATCH: 4,
  CIRCULAR_PATCH: 4,
  WELD_LINE: 2,
  RIGID_SPIDER: 3,
});

export class LoadFoundationError extends TypeError {
  constructor(code, path, message) {
    super(message);
    this.name = 'LoadFoundationError';
    this.code = code;
    this.path = path;
  }
}

export function normalizeLoadFoundationInput(input) {
  const source = exactRecord(input, [
    'schema', 'foundationIdentity', 'foundationVersion', 'sourceAncestry',
    'referencePoint', 'declaredResultant', 'footprint',
    'qualificationProfile', 'limitations',
  ], 'foundation');
  if (source.schema !== LOAD_FOUNDATION_SCHEMA) {
    fail('LOAD_FOUNDATION_SCHEMA_MISMATCH', 'schema',
      `schema must be ${LOAD_FOUNDATION_SCHEMA}.`);
  }
  const result = {
    schema: LOAD_FOUNDATION_SCHEMA,
    foundationIdentity: text(source.foundationIdentity, 'foundationIdentity'),
    foundationVersion: text(source.foundationVersion, 'foundationVersion'),
    sourceAncestry: ancestry(source.sourceAncestry),
    referencePoint: vector(source.referencePoint, 'referencePoint'),
    declaredResultant: resultant(source.declaredResultant),
    footprint: footprint(source.footprint),
    qualificationProfile: profile(source.qualificationProfile),
    limitations: limitations(source.limitations),
  };
  return deepFreeze(result);
}

function ancestry(value) {
  const source = exactRecord(value, [
    'stageId', 'sourceHash', 'canonicalModelHash',
    'executionHash', 'resultEvidenceHash',
  ], 'sourceAncestry');
  if (source.stageId !== 'LAFEA.1') {
    fail('LOAD_FOUNDATION_SOURCE_STAGE_MISMATCH', 'sourceAncestry.stageId',
      'Finite foundation evidence must descend from LAFEA.1.');
  }
  return {
    stageId: source.stageId,
    sourceHash: hash(source.sourceHash, 'sourceAncestry.sourceHash'),
    canonicalModelHash: hash(source.canonicalModelHash,
      'sourceAncestry.canonicalModelHash'),
    executionHash: hash(source.executionHash, 'sourceAncestry.executionHash'),
    resultEvidenceHash: hash(source.resultEvidenceHash,
      'sourceAncestry.resultEvidenceHash'),
  };
}

function resultant(value) {
  const source = exactRecord(value, ['force', 'moment', 'sourceReference'],
    'declaredResultant');
  return {
    force: vector(source.force, 'declaredResultant.force'),
    moment: vector(source.moment, 'declaredResultant.moment'),
    sourceReference: text(source.sourceReference,
      'declaredResultant.sourceReference'),
  };
}

function footprint(value) {
  const source = exactRecord(value, ['method', 'stations', 'sourceReference'],
    'footprint');
  if (!LOAD_FOUNDATION_METHODS.includes(source.method)) {
    fail('LOAD_FOUNDATION_METHOD_UNSUPPORTED', 'footprint.method',
      `Unsupported finite foundation method ${source.method}.`);
  }
  if (!Array.isArray(source.stations)) {
    fail('LOAD_FOUNDATION_STATIONS_REQUIRED', 'footprint.stations',
      'footprint.stations must be an array.');
  }
  const stations = source.stations.map((row, index) => station(row, index))
    .sort((left, right) => left.stationId.localeCompare(right.stationId));
  unique(stations.map((row) => row.stationId), 'footprint.stations');
  const minimum = METHOD_MINIMUM_STATIONS[source.method];
  if (stations.length < minimum || (source.method === 'POINT' && stations.length !== 1)) {
    fail('LOAD_FOUNDATION_STATION_COUNT_INVALID', 'footprint.stations',
      `${source.method} requires ${source.method === 'POINT' ? 'exactly' : 'at least'} ${minimum} station(s).`);
  }
  if (source.method === 'RIGID_SPIDER') requireSpatialRank(stations);
  return {
    method: source.method,
    stations,
    sourceReference: text(source.sourceReference, 'footprint.sourceReference'),
  };
}

function station(value, index) {
  const path = `footprint.stations[${index}]`;
  const source = exactRecord(value,
    ['stationId', 'position', 'measure', 'sourceReference'], path);
  const measure = number(source.measure, `${path}.measure`);
  if (measure <= 0) {
    fail('LOAD_FOUNDATION_MEASURE_NOT_POSITIVE', `${path}.measure`,
      'Station measure must be positive.');
  }
  return {
    stationId: text(source.stationId, `${path}.stationId`),
    position: vector(source.position, `${path}.position`),
    measure,
    sourceReference: text(source.sourceReference, `${path}.sourceReference`),
  };
}

function profile(value) {
  const source = exactRecord(value,
    ['identity', 'forceTolerance', 'momentTolerance', 'rankTolerance'],
    'qualificationProfile');
  return {
    identity: text(source.identity, 'qualificationProfile.identity'),
    forceTolerance: tolerance(source.forceTolerance,
      'qualificationProfile.forceTolerance'),
    momentTolerance: tolerance(source.momentTolerance,
      'qualificationProfile.momentTolerance'),
    rankTolerance: positive(source.rankTolerance,
      'qualificationProfile.rankTolerance'),
  };
}

function tolerance(value, path) {
  const source = exactRecord(value, ['absolute', 'relative'], path);
  const absolute = number(source.absolute, `${path}.absolute`);
  const relative = number(source.relative, `${path}.relative`);
  if (absolute < 0 || relative < 0) {
    fail('LOAD_FOUNDATION_TOLERANCE_NEGATIVE', path,
      'Foundation tolerances must be non-negative.');
  }
  return { absolute, relative };
}

function requireSpatialRank(stations) {
  const origin = stations[0].position;
  const directions = stations.slice(1).map((row) => subtract(row.position, origin));
  const first = directions.find((row) => magnitude(row) > 0);
  const second = first && directions.find((row) => magnitude(cross(first, row)) > 0);
  if (!first || !second) {
    fail('LOAD_FOUNDATION_RIGID_SPIDER_RANK_DEFICIENT', 'footprint.stations',
      'Rigid-spider stations must not be coincident or collinear.');
  }
}

function limitations(value) {
  if (!Array.isArray(value)) {
    fail('LOAD_FOUNDATION_LIMITATIONS_REQUIRED', 'limitations',
      'limitations must be an array.');
  }
  return [...new Set([
    ...LOAD_FOUNDATION_LIMITATIONS,
    ...value.map((row, index) => text(row, `limitations[${index}]`)),
  ])].sort();
}

function exactRecord(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('LOAD_FOUNDATION_RECORD_REQUIRED', path, `${path} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    fail('LOAD_FOUNDATION_KEYS_INVALID', path,
      `${path} keys must be exactly ${expected.join(', ')}.`);
  }
  return structuredClone(value);
}

function vector(value, path) {
  if (!Array.isArray(value) || value.length !== 3) {
    fail('LOAD_FOUNDATION_VECTOR_INVALID', path, `${path} must have three values.`);
  }
  return value.map((item, index) => number(item, `${path}[${index}]`));
}

function number(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('LOAD_FOUNDATION_NUMBER_INVALID', path, `${path} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function positive(value, path) {
  const result = number(value, path);
  if (result <= 0) fail('LOAD_FOUNDATION_POSITIVE_REQUIRED', path,
    `${path} must be positive.`);
  return result;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('LOAD_FOUNDATION_TEXT_REQUIRED', path, `${path} is required.`);
  }
  return value.trim();
}

function hash(value, path) {
  const result = text(value, path);
  if (!HASH_PATTERN.test(result)) {
    fail('LOAD_FOUNDATION_SHA256_REQUIRED', path,
      `${path} must be a canonical SHA-256 identity.`);
  }
  return result;
}

function unique(values, path) {
  if (new Set(values).size !== values.length) {
    fail('LOAD_FOUNDATION_DUPLICATE_IDENTITY', path,
      `${path} contains duplicate identities.`);
  }
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}
function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}
function magnitude(value) {
  return Math.hypot(...value);
}
function fail(code, path, message) {
  throw new LoadFoundationError(code, path, message);
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
