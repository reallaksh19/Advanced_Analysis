import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SPEC_CATALOGUE_SCHEMA =
  'TopologyEditSpecificationCatalogue.v1';
export const TOPOLOGY_EDIT_SPEC_RECORD_SCHEMA =
  'TopologyEditSpecificationRecord.v1';

const COMPONENT_TYPES = new Set([
  'PIPE', 'ELBOW', 'REDUCER', 'VALVE', 'FLANGE', 'TEE', 'OLET',
]);
const REDUCER_TYPES = new Set(['CONCENTRIC', 'ECCENTRIC']);
const REDUCER_ORIENTATIONS = new Set([
  'CONCENTRIC', 'FLAT_TOP', 'FLAT_BOTTOM', 'FLAT_LEFT', 'FLAT_RIGHT',
]);
const FIELDS = Object.freeze([
  'nominalSizeMm',
  'outsideDiameterMm',
  'secondaryNominalSizeMm',
  'secondaryOutsideDiameterMm',
  'schedule',
  'wallThicknessMm',
  'elbowRadiusMm',
  'elbowAngleDeg',
  'reducerType',
  'reducerOrientation',
  'valveFaceToFaceMm',
  'flangeClass',
  'flangeFacing',
  'endConnectionFrom',
  'endConnectionTo',
  'pipingClass',
]);

export function createTopologyEditSpecificationCatalogue(input = {}) {
  const records = normalizeRecords(input.records);
  const material = {
    schema: TOPOLOGY_EDIT_SPEC_CATALOGUE_SCHEMA,
    catalogueId: requiredText(input.catalogueId, 'catalogueId'),
    catalogueVersion: requiredText(input.catalogueVersion, 'catalogueVersion'),
    authority: normalizeAuthority(input.authority),
    records,
  };
  return deepFreeze({ ...material, catalogueHash: semanticHash(material) });
}

export function assertTopologyEditSpecificationCatalogue(value) {
  if (!isPlainRecord(value)) fail('catalogue must be an object.');
  const rebuilt = createTopologyEditSpecificationCatalogue(value);
  const supplied = { ...value };
  delete supplied.catalogueHash;
  if (
    value.schema !== TOPOLOGY_EDIT_SPEC_CATALOGUE_SCHEMA
    || value.catalogueHash !== semanticHash(supplied)
    || value.catalogueHash !== rebuilt.catalogueHash
  ) fail('catalogue differs from its immutable content authority.', RangeError);
  return rebuilt;
}

export function createTopologyEditSpecificationRecord(input = {}) {
  const componentType = enumText(input.componentType, COMPONENT_TYPES, 'componentType');
  const material = {
    schema: TOPOLOGY_EDIT_SPEC_RECORD_SCHEMA,
    recordId: requiredText(input.recordId, 'recordId'),
    componentType,
    nominalSizeMm: positiveNumber(input.nominalSizeMm, 'nominalSizeMm'),
    outsideDiameterMm: positiveNumber(input.outsideDiameterMm, 'outsideDiameterMm'),
    secondaryNominalSizeMm: optionalPositiveNumber(
      input.secondaryNominalSizeMm,
      'secondaryNominalSizeMm',
    ),
    secondaryOutsideDiameterMm: optionalPositiveNumber(
      input.secondaryOutsideDiameterMm,
      'secondaryOutsideDiameterMm',
    ),
    schedule: optionalText(input.schedule, true),
    wallThicknessMm: optionalPositiveNumber(input.wallThicknessMm, 'wallThicknessMm'),
    elbowRadiusMm: optionalPositiveNumber(input.elbowRadiusMm, 'elbowRadiusMm'),
    elbowAngleDeg: optionalAngle(input.elbowAngleDeg),
    reducerType: optionalEnum(input.reducerType, REDUCER_TYPES, 'reducerType'),
    reducerOrientation: optionalEnum(
      input.reducerOrientation,
      REDUCER_ORIENTATIONS,
      'reducerOrientation',
    ),
    valveFaceToFaceMm: optionalPositiveNumber(
      input.valveFaceToFaceMm,
      'valveFaceToFaceMm',
    ),
    flangeClass: optionalText(input.flangeClass, true),
    flangeFacing: optionalText(input.flangeFacing, true),
    endConnectionFrom: requiredText(input.endConnectionFrom, 'endConnectionFrom').toUpperCase(),
    endConnectionTo: requiredText(input.endConnectionTo, 'endConnectionTo').toUpperCase(),
    pipingClass: requiredText(input.pipingClass, 'pipingClass').toUpperCase(),
    sourceReference: normalizeSourceReference(input.sourceReference),
  };
  assertComponentEvidence(material);
  return deepFreeze({ ...material, recordHash: semanticHash(material) });
}

export function assertTopologyEditSpecificationRecord(value) {
  if (!isPlainRecord(value)) fail('record must be an object.');
  const rebuilt = createTopologyEditSpecificationRecord(value);
  const supplied = { ...value };
  delete supplied.recordHash;
  if (
    value.schema !== TOPOLOGY_EDIT_SPEC_RECORD_SCHEMA
    || value.recordHash !== semanticHash(supplied)
    || value.recordHash !== rebuilt.recordHash
  ) fail('record differs from its immutable content authority.', RangeError);
  return rebuilt;
}

export function topologyEditSpecificationRecordKey(recordInput) {
  const record = assertTopologyEditSpecificationRecord(recordInput);
  return deepFreeze(FIELDS.reduce((result, field) => {
    result[field] = record[field];
    return result;
  }, { componentType: record.componentType }));
}

function normalizeRecords(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('records must be a non-empty array.');
  }
  const records = value.map((row) => createTopologyEditSpecificationRecord(row))
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  const ids = records.map((record) => record.recordId);
  if (new Set(ids).size !== ids.length) fail('recordId values must be unique.', RangeError);
  return records;
}

function normalizeAuthority(value) {
  if (!isPlainRecord(value)) fail('authority must be an object.');
  return {
    sourceId: requiredText(value.sourceId, 'authority.sourceId'),
    sourceVersion: requiredText(value.sourceVersion, 'authority.sourceVersion'),
    sourceHash: requiredText(value.sourceHash, 'authority.sourceHash'),
  };
}

function normalizeSourceReference(value) {
  if (!isPlainRecord(value)) fail('sourceReference must be an object.');
  return {
    documentId: requiredText(value.documentId, 'sourceReference.documentId'),
    revision: requiredText(value.revision, 'sourceReference.revision'),
    path: requiredText(value.path, 'sourceReference.path'),
  };
}

function assertComponentEvidence(record) {
  const requiredByType = {
    PIPE: ['schedule', 'wallThicknessMm'],
    ELBOW: ['elbowRadiusMm', 'elbowAngleDeg'],
    REDUCER: [
      'secondaryNominalSizeMm', 'secondaryOutsideDiameterMm',
      'reducerType', 'reducerOrientation',
    ],
    VALVE: ['valveFaceToFaceMm'],
    FLANGE: ['flangeClass', 'flangeFacing'],
  };
  (requiredByType[record.componentType] || []).forEach((field) => {
    if (record[field] === null) fail(`${record.componentType}.${field} is required.`, RangeError);
  });
  if (record.componentType !== 'REDUCER' && (
    record.secondaryNominalSizeMm !== null
    || record.secondaryOutsideDiameterMm !== null
    || record.reducerType !== null
    || record.reducerOrientation !== null
  )) fail('reducer-only fields require componentType REDUCER.', RangeError);
}

function optionalAngle(value) {
  if (empty(value)) return null;
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle <= 0 || angle >= 180) {
    fail('elbowAngleDeg must be strictly between 0 and 180.', RangeError);
  }
  return angle;
}
function optionalPositiveNumber(value, label) {
  return empty(value) ? null : positiveNumber(value, label);
}
function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    fail(`${label} must be a positive finite number.`, RangeError);
  }
  return Object.is(number, -0) ? 0 : number;
}
function optionalEnum(value, allowed, label) {
  return empty(value) ? null : enumText(value, allowed, label);
}
function enumText(value, allowed, label) {
  const text = requiredText(value, label).toUpperCase();
  if (!allowed.has(text)) fail(`${label} has unsupported value ${text}.`, RangeError);
  return text;
}
function optionalText(value, uppercase = false) {
  const text = stringValue(value);
  return text ? (uppercase ? text.toUpperCase() : text) : null;
}
function empty(value) {
  return value === undefined || value === null || value === '';
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditSpecificationCatalogue: ${message}`);
}
