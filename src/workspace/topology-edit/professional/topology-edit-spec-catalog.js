import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SPEC_CATALOGUE_SCHEMA =
  'TopologyEditSpecificationCatalogue.v3';
export const TOPOLOGY_EDIT_SPEC_RECORD_SCHEMA =
  'TopologyEditSpecificationRecord.v3';

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMPONENT_TYPES = new Set([
  'PIPE', 'ELBOW', 'REDUCER', 'VALVE', 'FLANGE', 'TEE', 'OLET',
]);
const REDUCER_TYPES = new Set(['CONCENTRIC', 'ECCENTRIC']);
const REDUCER_ORIENTATIONS = new Set([
  'CONCENTRIC', 'FLAT_TOP', 'FLAT_BOTTOM', 'FLAT_LEFT', 'FLAT_RIGHT',
]);
const VALVE_TYPES = new Set([
  'BALL', 'BUTTERFLY', 'CHECK', 'CONTROL', 'GATE', 'GLOBE', 'NEEDLE', 'PLUG',
]);
const FLANGE_TYPES = new Set([
  'WELD_NECK', 'SLIP_ON', 'SOCKET_WELD', 'THREADED', 'LAP_JOINT', 'BLIND',
]);
const OLET_TYPES = new Set([
  'ELBOLET', 'LATROLET', 'NIPOLET', 'SOCKOLET', 'SWEEPOLET', 'THREDOLET', 'WELDOLET',
]);
const HOST_COMPONENT_TYPES = new Set(['PIPE', 'ELBOW', 'TEE']);
const FIELDS = Object.freeze([
  'nominalSizeMm',
  'outsideDiameterMm',
  'secondaryNominalSizeMm',
  'secondaryOutsideDiameterMm',
  'branchNominalSizeMm',
  'branchOutsideDiameterMm',
  'schedule',
  'wallThicknessMm',
  'pressureClass',
  'materialSpecification',
  'componentLengthMm',
  'componentMassKg',
  'elbowRadiusMm',
  'elbowAngleDeg',
  'reducerType',
  'reducerOrientation',
  'valveType',
  'valveFaceToFaceMm',
  'flangeClass',
  'flangeFacing',
  'flangeType',
  'flangeThicknessMm',
  'flangeOutsideDiameterMm',
  'boltCircleDiameterMm',
  'boltHoleCount',
  'boltHoleDiameterMm',
  'branchAngleDeg',
  'centerToRunMm',
  'centerToBranchMm',
  'branchConnection',
  'oletType',
  'hostComponentType',
  'projectionMm',
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
    secondaryNominalSizeMm: optionalPositiveNumber(input.secondaryNominalSizeMm, 'secondaryNominalSizeMm'),
    secondaryOutsideDiameterMm: optionalPositiveNumber(input.secondaryOutsideDiameterMm, 'secondaryOutsideDiameterMm'),
    branchNominalSizeMm: optionalPositiveNumber(input.branchNominalSizeMm, 'branchNominalSizeMm'),
    branchOutsideDiameterMm: optionalPositiveNumber(input.branchOutsideDiameterMm, 'branchOutsideDiameterMm'),
    schedule: optionalText(input.schedule, true),
    wallThicknessMm: optionalPositiveNumber(input.wallThicknessMm, 'wallThicknessMm'),
    pressureClass: optionalText(input.pressureClass, true),
    materialSpecification: optionalText(input.materialSpecification, true),
    componentLengthMm: optionalPositiveNumber(input.componentLengthMm, 'componentLengthMm'),
    componentMassKg: optionalPositiveNumber(input.componentMassKg, 'componentMassKg'),
    elbowRadiusMm: optionalPositiveNumber(input.elbowRadiusMm, 'elbowRadiusMm'),
    elbowAngleDeg: optionalAngle(input.elbowAngleDeg, 'elbowAngleDeg'),
    reducerType: optionalEnum(input.reducerType, REDUCER_TYPES, 'reducerType'),
    reducerOrientation: optionalEnum(input.reducerOrientation, REDUCER_ORIENTATIONS, 'reducerOrientation'),
    valveType: optionalEnum(input.valveType, VALVE_TYPES, 'valveType'),
    valveFaceToFaceMm: optionalPositiveNumber(input.valveFaceToFaceMm, 'valveFaceToFaceMm'),
    flangeClass: optionalText(input.flangeClass, true),
    flangeFacing: optionalText(input.flangeFacing, true),
    flangeType: optionalEnum(input.flangeType, FLANGE_TYPES, 'flangeType'),
    flangeThicknessMm: optionalPositiveNumber(input.flangeThicknessMm, 'flangeThicknessMm'),
    flangeOutsideDiameterMm: optionalPositiveNumber(input.flangeOutsideDiameterMm, 'flangeOutsideDiameterMm'),
    boltCircleDiameterMm: optionalPositiveNumber(input.boltCircleDiameterMm, 'boltCircleDiameterMm'),
    boltHoleCount: optionalPositiveInteger(input.boltHoleCount, 'boltHoleCount'),
    boltHoleDiameterMm: optionalPositiveNumber(input.boltHoleDiameterMm, 'boltHoleDiameterMm'),
    branchAngleDeg: optionalAngle(input.branchAngleDeg, 'branchAngleDeg'),
    centerToRunMm: optionalPositiveNumber(input.centerToRunMm, 'centerToRunMm'),
    centerToBranchMm: optionalPositiveNumber(input.centerToBranchMm, 'centerToBranchMm'),
    branchConnection: optionalText(input.branchConnection, true),
    oletType: optionalEnum(input.oletType, OLET_TYPES, 'oletType'),
    hostComponentType: optionalEnum(input.hostComponentType, HOST_COMPONENT_TYPES, 'hostComponentType'),
    projectionMm: optionalPositiveNumber(input.projectionMm, 'projectionMm'),
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
  if (!Array.isArray(value) || value.length === 0) fail('records must be a non-empty array.');
  const records = value.map((row) => createTopologyEditSpecificationRecord(row))
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  const ids = records.map((record) => record.recordId);
  if (new Set(ids).size !== ids.length) fail('recordId values must be unique.', RangeError);
  return records;
}

function normalizeAuthority(value) {
  if (!isPlainRecord(value)) fail('authority must be an object.');
  const sourceHash = requiredText(value.sourceHash, 'authority.sourceHash').toLowerCase();
  if (!SHA256.test(sourceHash)) {
    fail('authority.sourceHash must be an exact sha256:<64 lowercase hex> digest.', RangeError);
  }
  return {
    sourceId: requiredText(value.sourceId, 'authority.sourceId'),
    sourceVersion: requiredText(value.sourceVersion, 'authority.sourceVersion'),
    sourceHash,
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
    REDUCER: ['secondaryNominalSizeMm', 'secondaryOutsideDiameterMm', 'reducerType', 'reducerOrientation'],
    VALVE: ['valveType', 'valveFaceToFaceMm'],
    FLANGE: ['flangeClass', 'flangeFacing'],
    TEE: [
      'branchNominalSizeMm', 'branchOutsideDiameterMm', 'branchAngleDeg',
      'centerToRunMm', 'centerToBranchMm', 'branchConnection',
    ],
    OLET: [
      'branchNominalSizeMm', 'branchOutsideDiameterMm', 'branchAngleDeg',
      'branchConnection', 'oletType', 'hostComponentType', 'projectionMm',
    ],
  };
  requiredByType[record.componentType].forEach((field) => {
    if (record[field] === null) fail(`${record.componentType}.${field} is required.`, RangeError);
  });
  if (record.componentType === 'VALVE'
    && record.componentLengthMm !== null
    && Math.abs(record.componentLengthMm - record.valveFaceToFaceMm) > 1e-9) {
    fail('VALVE.componentLengthMm must equal valveFaceToFaceMm.', RangeError);
  }
  if (record.componentType === 'FLANGE' && record.flangeType === 'BLIND') {
    const blindFields = [
      'componentLengthMm',
      'componentMassKg',
      'flangeThicknessMm',
      'flangeOutsideDiameterMm',
      'boltCircleDiameterMm',
      'boltHoleCount',
      'boltHoleDiameterMm',
    ];
    blindFields.forEach((field) => {
      if (record[field] === null) fail(`FLANGE.BLIND.${field} is required.`, RangeError);
    });
    if (Math.abs(record.componentLengthMm - record.flangeThicknessMm) > 1e-9) {
      fail('FLANGE.BLIND componentLengthMm must equal flangeThicknessMm.', RangeError);
    }
    if (record.endConnectionFrom !== 'PIPE_TERMINAL') {
      fail('FLANGE.BLIND endConnectionFrom must be PIPE_TERMINAL.', RangeError);
    }
    if (record.endConnectionTo !== `CLOSED_${record.flangeFacing}`) {
      fail('FLANGE.BLIND endConnectionTo must equal CLOSED_<facing>.', RangeError);
    }
  }
  rejectForeignFields(record, 'REDUCER', [
    'secondaryNominalSizeMm', 'secondaryOutsideDiameterMm', 'reducerType', 'reducerOrientation',
  ]);
  rejectForeignFields(record, 'VALVE', ['valveType', 'valveFaceToFaceMm']);
  rejectForeignFields(record, 'FLANGE', [
    'flangeClass', 'flangeFacing', 'flangeType', 'flangeThicknessMm',
    'flangeOutsideDiameterMm', 'boltCircleDiameterMm', 'boltHoleCount', 'boltHoleDiameterMm',
  ]);
  rejectForeignFields(record, ['TEE', 'OLET'], [
    'branchNominalSizeMm', 'branchOutsideDiameterMm', 'branchAngleDeg', 'branchConnection',
  ]);
  rejectForeignFields(record, 'TEE', ['centerToRunMm', 'centerToBranchMm']);
  rejectForeignFields(record, 'OLET', ['oletType', 'hostComponentType', 'projectionMm']);
}

function rejectForeignFields(record, allowedTypes, fields) {
  const allowed = new Set(Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes]);
  if (allowed.has(record.componentType)) return;
  const foreign = fields.find((field) => record[field] !== null);
  if (foreign) fail(`${foreign} is not valid for componentType ${record.componentType}.`, RangeError);
}

function optionalAngle(value, label) {
  if (empty(value)) return null;
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle <= 0 || angle >= 180) {
    fail(`${label} must be strictly between 0 and 180 degrees.`, RangeError);
  }
  return angle;
}
function optionalPositiveNumber(value, label) {
  return empty(value) ? null : positiveNumber(value, label);
}
function optionalPositiveInteger(value, label) {
  if (empty(value)) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(`${label} must be a positive integer.`, RangeError);
  }
  return number;
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
