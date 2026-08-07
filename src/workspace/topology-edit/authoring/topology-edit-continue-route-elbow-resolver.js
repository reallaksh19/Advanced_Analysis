import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditSpecificationCatalogue } from '../professional/topology-edit-spec-catalog.js';
import { assertContinueRoutePlan } from './topology-edit-continue-route-plan.js';

export const CONTINUE_ROUTE_ELBOW_BINDING_SCHEMA = 'TopologyEditContinueRouteElbowBinding.v1';
const TOLERANCE = 1e-8;

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditContinueRouteElbowResolver: ${message}`);
}
function close(left, right) { return Math.abs(Number(left) - Number(right)) <= TOLERANCE; }
function sourceReference(value) {
  return {
    documentId: String(value?.documentId ?? '').trim(),
    revision: String(value?.revision ?? '').trim(),
    path: String(value?.path ?? '').trim(),
  };
}
function connectionCompatible(pipe, elbow) {
  const pipeConnections = new Set([
    String(pipe.endConnectionFrom ?? '').toUpperCase(),
    String(pipe.endConnectionTo ?? '').toUpperCase(),
  ]);
  return pipeConnections.has(String(elbow.endConnectionFrom ?? '').toUpperCase())
    && pipeConnections.has(String(elbow.endConnectionTo ?? '').toUpperCase());
}
function compatibleRecord(record, pipe, turn) {
  return record.componentType === 'ELBOW'
    && close(record.nominalSizeMm, pipe.nominalSizeMm)
    && close(record.outsideDiameterMm, pipe.outsideDiameterMm)
    && String(record.pipingClass).toUpperCase() === String(pipe.pipingClass).toUpperCase()
    && String(record.pressureClass).toUpperCase() === String(pipe.pressureClass).toUpperCase()
    && close(record.elbowAngleDeg, turn.angleDeg)
    && connectionCompatible(pipe, record);
}
function bindingMaterial(catalogue, record, turn) {
  const material = {
    schema: CONTINUE_ROUTE_ELBOW_BINDING_SCHEMA,
    turnHash: turn.turnHash,
    vertexIndex: turn.vertexIndex,
    catalogueId: catalogue.catalogueId,
    catalogueVersion: catalogue.catalogueVersion,
    catalogueHash: catalogue.catalogueHash,
    catalogueSourceHash: catalogue.authority.sourceHash,
    recordId: record.recordId,
    recordHash: record.recordHash,
    sourceReference: sourceReference(record.sourceReference),
    componentType: record.componentType,
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
function selectionFor(selections, turn) {
  if (!selections) return null;
  if (Array.isArray(selections)) {
    const row = selections.find((item) => Number(item?.vertexIndex) === turn.vertexIndex);
    return row?.recordId ? String(row.recordId) : null;
  }
  const direct = selections[turn.vertexIndex] ?? selections[String(turn.vertexIndex)];
  return direct ? String(direct) : null;
}

export function resolveContinueRouteElbows({ plan: input, catalogue: catalogueInput, selections = null } = {}) {
  const plan = assertContinueRoutePlan(input);
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  if (catalogue.catalogueHash !== plan.basis.catalogueHash) {
    fail('catalogue differs from the Continue Route plan authority.');
  }
  const pipe = plan.intent.catalogueBinding;
  const bindings = plan.geometry.turns.map((turn) => {
    const compatible = catalogue.records.filter((record) => compatibleRecord(record, pipe, turn));
    const selectedRecordId = selectionFor(selections, turn);
    if (!compatible.length) {
      fail(`NO_COMPATIBLE_ELBOW at route vertex ${turn.vertexIndex}.`);
    }
    let record;
    if (selectedRecordId) {
      record = compatible.find((row) => row.recordId === selectedRecordId);
      if (!record) fail(`selected elbow ${selectedRecordId} is not compatible at route vertex ${turn.vertexIndex}.`);
    } else if (compatible.length === 1) {
      [record] = compatible;
    } else {
      fail(`ELBOW_SELECTION_REQUIRED at route vertex ${turn.vertexIndex}; ${compatible.length} compatible records.`);
    }
    return bindingMaterial(catalogue, record, turn);
  });
  const material = {
    schema: 'TopologyEditContinueRouteElbowResolution.v1',
    planHash: plan.planHash,
    catalogueHash: catalogue.catalogueHash,
    turnCount: plan.turnCount,
    bindingHashes: bindings.map((row) => row.bindingHash),
  };
  return deepFreeze({ ...material, resolutionHash: semanticHash(material), bindings });
}

export function assertContinueRouteElbowBinding(value) {
  if (value?.schema !== CONTINUE_ROUTE_ELBOW_BINDING_SCHEMA) {
    fail(`binding must use ${CONTINUE_ROUTE_ELBOW_BINDING_SCHEMA}.`, TypeError);
  }
  const material = { ...value }; delete material.bindingHash;
  if (semanticHash(material) !== value.bindingHash || value.componentType !== 'ELBOW') {
    fail('elbow binding differs from immutable catalogue authority.');
  }
  return value;
}
