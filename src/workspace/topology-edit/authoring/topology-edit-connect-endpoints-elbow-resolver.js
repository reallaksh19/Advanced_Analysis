import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditSpecificationCatalogue } from '../professional/topology-edit-spec-catalog.js';
import { assertPipeSegmentCatalogueBinding } from '../topology-edit-pipe-segment-contract.js';

export const CONNECT_ENDPOINTS_ELBOW_BINDING_SCHEMA = 'TopologyEditConnectEndpointsElbowBinding.v1';
const TOLERANCE = 1e-8;

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditConnectEndpointsElbowResolver: ${message}`);
}
function close(left, right) {
  const a = Number(left); const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOLERANCE;
}
function exactText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`, TypeError);
  return text;
}
function connectionPair(value) {
  return [value?.endConnectionFrom, value?.endConnectionTo]
    .map((row) => String(row ?? '').trim().toUpperCase())
    .sort();
}
function compatible(record, pipe, turn) {
  const pipePair = connectionPair(pipe);
  const recordPair = connectionPair(record);
  const connectionsMatch = pipePair.length === 2
    && recordPair.length === 2
    && pipePair.every((value, index) => value && value === recordPair[index]);
  return record.componentType === 'ELBOW'
    && close(record.nominalSizeMm, pipe.nominalSizeMm)
    && close(record.outsideDiameterMm, pipe.outsideDiameterMm)
    && String(record.pipingClass ?? '').trim().toUpperCase() === String(pipe.pipingClass ?? '').trim().toUpperCase()
    && String(record.pressureClass ?? '').trim().toUpperCase() === String(pipe.pressureClass ?? '').trim().toUpperCase()
    && close(record.elbowAngleDeg, turn.angleDeg)
    && connectionsMatch;
}
function binding(catalogue, record, turn) {
  const material = {
    schema: CONNECT_ENDPOINTS_ELBOW_BINDING_SCHEMA,
    turnHash: exactText(turn.turnHash, 'turn.turnHash'),
    turnLocation: exactText(turn.location, 'turn.location'),
    vertexIndex: Number.isInteger(turn.vertexIndex) ? turn.vertexIndex : null,
    catalogueId: catalogue.catalogueId,
    catalogueVersion: catalogue.catalogueVersion,
    catalogueHash: catalogue.catalogueHash,
    catalogueSourceHash: catalogue.authority.sourceHash,
    recordId: record.recordId,
    recordHash: record.recordHash,
    sourceReference: { ...record.sourceReference },
    nominalSizeMm: record.nominalSizeMm,
    outsideDiameterMm: record.outsideDiameterMm,
    pressureClass: record.pressureClass,
    materialSpecification: record.materialSpecification,
    pipingClass: record.pipingClass,
    endConnectionFrom: record.endConnectionFrom,
    endConnectionTo: record.endConnectionTo,
    elbowRadiusMm: record.elbowRadiusMm,
    elbowAngleDeg: record.elbowAngleDeg,
    componentMassKg: record.componentMassKg,
    radiusAuthority: `CATALOGUE:${catalogue.catalogueHash}:${record.recordId}:${record.recordHash}`,
  };
  return deepFreeze({ ...material, bindingHash: semanticHash(material) });
}

export function resolveConnectEndpointsElbow({ turn, pipeBinding, catalogue: catalogueInput, selectedRecordId = null } = {}) {
  const pipe = assertPipeSegmentCatalogueBinding(pipeBinding);
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  const angleDeg = Number(turn?.angleDeg);
  if (!Number.isFinite(angleDeg) || angleDeg <= TOLERANCE || angleDeg >= 180 - TOLERANCE) {
    fail('turn angle must be strictly between 0 and 180 degrees.');
  }
  if (pipe.catalogueHash !== catalogue.catalogueHash) fail('pipe binding and elbow catalogue differ.');
  const matches = catalogue.records.filter((record) => compatible(record, pipe, { ...turn, angleDeg }));
  if (!matches.length) fail(`NO_COMPATIBLE_ELBOW at ${turn.location}.`);
  const selected = String(selectedRecordId ?? '').trim();
  let record;
  if (selected) {
    record = matches.find((row) => row.recordId === selected);
    if (!record) fail(`selected elbow ${selected} is incompatible at ${turn.location}.`);
  } else if (matches.length === 1) {
    [record] = matches;
  } else {
    fail(`ELBOW_SELECTION_REQUIRED at ${turn.location}; ${matches.length} compatible records.`);
  }
  return binding(catalogue, record, { ...turn, angleDeg });
}

export function assertConnectEndpointsElbowBinding(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_ELBOW_BINDING_SCHEMA) {
    fail(`binding must use ${CONNECT_ENDPOINTS_ELBOW_BINDING_SCHEMA}.`, TypeError);
  }
  const material = { ...value }; delete material.bindingHash;
  if (semanticHash(material) !== value.bindingHash) fail('elbow binding hash mismatch.');
  return value;
}
