import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditSpecificationCatalogue } from './professional/topology-edit-spec-catalog.js';

export const INSERT_PIPE_SEGMENT = 'INSERT_PIPE_SEGMENT';
export const PIPE_SEGMENT_BINDING_SCHEMA = 'TopologyEditPipeSegmentBinding.v1';
export const PIPE_SEGMENT_REQUEST_SCHEMA = 'TopologyEditPipeSegmentRequest.v1';
export const PIPE_SEGMENT_RESOLVED_SCHEMA = 'TopologyEditPipeSegmentResolved.v1';

const PIPE_FIELDS = Object.freeze([
  'nominalSizeMm', 'outsideDiameterMm', 'schedule', 'wallThicknessMm',
  'materialSpecification', 'pipingClass', 'pressureClass',
  'endConnectionFrom', 'endConnectionTo',
]);

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditPipeSegmentContract: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    fail(`${label} must be a positive finite number.`, RangeError);
  }
  return number;
}
function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    fail(`${label} must be a non-negative finite number.`, RangeError);
  }
  return number;
}
function sourceReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('sourceReference must be an object.');
  }
  return {
    documentId: requiredText(value.documentId, 'sourceReference.documentId'),
    revision: requiredText(value.revision, 'sourceReference.revision'),
    path: requiredText(value.path, 'sourceReference.path'),
  };
}
function bindingMaterial(input) {
  const material = {
    schema: PIPE_SEGMENT_BINDING_SCHEMA,
    catalogueId: requiredText(input.catalogueId, 'catalogueId'),
    catalogueVersion: requiredText(input.catalogueVersion, 'catalogueVersion'),
    catalogueHash: requiredText(input.catalogueHash, 'catalogueHash'),
    catalogueSourceHash: requiredText(input.catalogueSourceHash, 'catalogueSourceHash'),
    recordId: requiredText(input.recordId, 'recordId'),
    recordHash: requiredText(input.recordHash, 'recordHash'),
    sourceReference: sourceReference(input.sourceReference),
    componentType: requiredText(input.componentType, 'componentType').toUpperCase(),
    nominalSizeMm: positive(input.nominalSizeMm, 'nominalSizeMm'),
    outsideDiameterMm: positive(input.outsideDiameterMm, 'outsideDiameterMm'),
    schedule: requiredText(input.schedule, 'schedule').toUpperCase(),
    wallThicknessMm: positive(input.wallThicknessMm, 'wallThicknessMm'),
    materialSpecification: requiredText(
      input.materialSpecification,
      'materialSpecification',
    ).toUpperCase(),
    pipingClass: requiredText(input.pipingClass, 'pipingClass').toUpperCase(),
    pressureClass: requiredText(input.pressureClass, 'pressureClass').toUpperCase(),
    endConnectionFrom: requiredText(
      input.endConnectionFrom,
      'endConnectionFrom',
    ).toUpperCase(),
    endConnectionTo: requiredText(input.endConnectionTo, 'endConnectionTo').toUpperCase(),
  };
  if (material.componentType !== 'PIPE') fail('componentType must be PIPE.', RangeError);
  if (material.outsideDiameterMm <= 2 * material.wallThicknessMm) {
    fail('outsideDiameterMm must exceed twice wallThicknessMm.', RangeError);
  }
  return material;
}

export function createPipeSegmentCatalogueBinding({ catalogue: input, recordId } = {}) {
  const catalogue = assertTopologyEditSpecificationCatalogue(input);
  const matches = catalogue.records.filter((record) => record.recordId === recordId);
  if (matches.length !== 1) {
    fail(`recordId ${recordId} resolved ${matches.length} records.`, RangeError);
  }
  const record = matches[0];
  return assertPipeSegmentCatalogueBinding({
    schema: PIPE_SEGMENT_BINDING_SCHEMA,
    catalogueId: catalogue.catalogueId,
    catalogueVersion: catalogue.catalogueVersion,
    catalogueHash: catalogue.catalogueHash,
    catalogueSourceHash: catalogue.authority.sourceHash,
    recordId: record.recordId,
    recordHash: record.recordHash,
    sourceReference: record.sourceReference,
    componentType: record.componentType,
    ...Object.fromEntries(PIPE_FIELDS.map((field) => [field, record[field]])),
    bindingHash: null,
  });
}

export function assertPipeSegmentCatalogueBinding(value) {
  if (value?.schema !== PIPE_SEGMENT_BINDING_SCHEMA) {
    fail(`catalogue binding must use ${PIPE_SEGMENT_BINDING_SCHEMA}.`);
  }
  const material = bindingMaterial(value);
  const rebuilt = deepFreeze({ ...material, bindingHash: semanticHash(material) });
  if (value.bindingHash !== null && value.bindingHash !== undefined
    && value.bindingHash !== rebuilt.bindingHash) {
    fail('catalogue binding differs from immutable authority.', RangeError);
  }
  return rebuilt;
}

function policy(value = {}) {
  const material = {
    minimumLengthMm: positive(value.minimumLengthMm, 'minimumLengthMm'),
    overlapToleranceMm: nonNegative(value.overlapToleranceMm, 'overlapToleranceMm'),
  };
  const rebuilt = deepFreeze({ ...material, policyHash: semanticHash(material) });
  if (value.policyHash !== undefined && value.policyHash !== rebuilt.policyHash) {
    fail('segment policy differs from immutable authority.', RangeError);
  }
  return rebuilt;
}

export function normalizePipeSegmentCommandPayload(input = {}) {
  const fromNodeId = requiredText(input.fromNodeId, 'fromNodeId');
  const toNodeId = requiredText(input.toNodeId, 'toNodeId');
  if (fromNodeId === toNodeId) fail('endpoints must be different.', RangeError);
  return deepFreeze({
    fromNodeId,
    toNodeId,
    catalogueBinding: assertPipeSegmentCatalogueBinding(input.catalogueBinding),
    segmentPolicy: policy(input.segmentPolicy),
  });
}

function revisionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('expectedTargetRevisions must be an object.');
  }
  return Object.fromEntries(Object.entries(value).map(([id, revision]) => [
    requiredText(id, 'expected target id'),
    requiredText(revision, `expectedTargetRevisions.${id}`),
  ]).sort(([left], [right]) => left.localeCompare(right)));
}
function requestMaterial(input) {
  const payload = normalizePipeSegmentCommandPayload(input);
  const expectedTargetRevisions = revisionMap(input.expectedTargetRevisions);
  const expectedIds = [payload.fromNodeId, payload.toNodeId].sort();
  const suppliedIds = Object.keys(expectedTargetRevisions).sort();
  if (suppliedIds.length !== 2
    || suppliedIds.some((id, index) => id !== expectedIds[index])) {
    fail('expectedTargetRevisions must contain exactly both endpoint IDs.', RangeError);
  }
  return {
    schema: PIPE_SEGMENT_REQUEST_SCHEMA,
    commandType: INSERT_PIPE_SEGMENT,
    ...payload,
    expectedTargetRevisions,
  };
}

export function createPipeSegmentRequest(input = {}) {
  const material = requestMaterial(input);
  return deepFreeze({ ...material, requestHash: semanticHash(material) });
}

export function assertPipeSegmentRequest(value) {
  const rebuilt = createPipeSegmentRequest(value);
  if (value?.schema !== PIPE_SEGMENT_REQUEST_SCHEMA
    || value?.requestHash !== rebuilt.requestHash) {
    fail('request differs from immutable normalized authority.', RangeError);
  }
  return rebuilt;
}

export function assertResolvedPipeSegment(value) {
  if (value?.schema !== PIPE_SEGMENT_RESOLVED_SCHEMA) {
    fail(`resolved command must use ${PIPE_SEGMENT_RESOLVED_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.resolutionHash;
  if (semanticHash(material) !== value.resolutionHash) {
    fail('resolved command hash mismatch.', RangeError);
  }
  return value;
}
