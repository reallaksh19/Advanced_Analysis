import { deepFreeze, semanticHash, stringValue } from '../../../core/shared-piping-model/index.js';
import {
  normalizeTopologyEditInlineReplacementPayload,
} from '../topology-edit-inline-component-replacement.js';
import {
  normalizeTopologyEditJunctionRelationPayload,
} from '../topology-edit-junction-relation-command.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_INTENT_SCHEMA = 'TopologyEditTableIntent.v1';
export const TOPOLOGY_EDIT_TABLE_AUTHORITY_SCHEMA = 'TopologyEditTableEditAuthority.v1';

const INTENT_KINDS = new Set([
  'PIPE_LENGTH',
  'VALVE_REPLACEMENT',
  'TEE_REDUCER_RELATION',
]);
const ANCHORS = new Set(['FROM', 'TO', 'BOTH']);
const PROPAGATION = new Set(['DOWNSTREAM', 'UPSTREAM', 'FIT_BETWEEN_FIXED']);

export function createTopologyEditTableIntent({
  projection: projectionInput,
  sessionSnapshot,
  canonicalId,
  intentKind,
  requestedValue,
  geometryPolicy,
} = {}) {
  const projection = assertTopologyEditTableProjection(projectionInput);
  const authority = editAuthority(projection, sessionSnapshot);
  const row = exactRow(projection, canonicalId);
  const kind = requiredEnum(intentKind, INTENT_KINDS, 'intentKind');
  const payload = normalizeIntentPayload(
    kind,
    requestedValue,
    geometryPolicy,
    row,
    projection,
  );
  const target = {
    rowId: row.rowId,
    canonicalKind: row.identity.canonicalKind,
    canonicalId: row.identity.canonicalId,
    targetRevision: row.targetRevision,
  };
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_INTENT_SCHEMA,
    intentKind: kind,
    authority,
    target,
    priorValue: priorValue(kind, row),
    requestedValue: payload.requestedValue,
    geometryPolicy: payload.geometryPolicy,
  };
  return deepFreeze({ ...material, intentHash: semanticHash(material) });
}

export function assertTopologyEditTableIntent(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_INTENT_SCHEMA) {
    throw new TypeError(`Table intent must use ${TOPOLOGY_EDIT_TABLE_INTENT_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.intentHash;
  if (semanticHash(material) !== value.intentHash) {
    throw new Error('TopologyEditTableIntent: intent hash mismatch.');
  }
  assertEditAuthority(value.authority);
  requiredEnum(value.intentKind, INTENT_KINDS, 'intentKind');
  return value;
}

export function rebaseTopologyEditTableIntent(intentInput, projectionInput, sessionSnapshot) {
  const intent = assertTopologyEditTableIntent(intentInput);
  const projection = assertTopologyEditTableProjection(projectionInput);
  const row = exactRow(projection, intent.target.canonicalId);
  if (row.targetRevision !== intent.target.targetRevision) {
    throw new Error(`TopologyEditTableIntent: target ${intent.target.canonicalId} changed before rebase.`);
  }
  return createTopologyEditTableIntent({
    projection,
    sessionSnapshot,
    canonicalId: intent.target.canonicalId,
    intentKind: intent.intentKind,
    requestedValue: intent.requestedValue,
    geometryPolicy: intent.geometryPolicy,
  });
}

export function assertTopologyEditTableEditAuthority(value) {
  return assertEditAuthority(value);
}

function editAuthority(projection, snapshot) {
  if (!snapshot?.baseAuthority || !Number.isInteger(snapshot.sessionVersion)) {
    throw new TypeError('TopologyEditTableIntent: certified session snapshot is required.');
  }
  if (snapshot.activeCanonicalTopologyHash !== projection.authority.canonicalTopologyHash) {
    throw new Error('TopologyEditTableIntent: session canonical hash differs from table projection.');
  }
  if (snapshot.baseAuthority.datasetId !== projection.authority.datasetId
    || snapshot.baseAuthority.sourceHash !== projection.authority.sourceHash) {
    throw new Error('TopologyEditTableIntent: session source authority differs from table projection.');
  }
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_AUTHORITY_SCHEMA,
    datasetId: projection.authority.datasetId,
    datasetVersion: projection.authority.datasetVersion,
    sourceHash: projection.authority.sourceHash,
    baseCanonicalHash: snapshot.baseAuthority.baseCanonicalHash,
    priorDraftHash: projection.authority.canonicalTopologyHash,
    projectionHash: projection.projectionHash,
    sessionVersion: snapshot.sessionVersion,
    journalHash: requiredText(snapshot.journalHash, 'sessionSnapshot.journalHash'),
    activeLedgerHash: requiredText(snapshot.activeLedgerHash, 'sessionSnapshot.activeLedgerHash'),
  };
  return deepFreeze({ ...material, authorityHash: semanticHash(material) });
}

function assertEditAuthority(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_AUTHORITY_SCHEMA) {
    throw new TypeError(`Edit authority must use ${TOPOLOGY_EDIT_TABLE_AUTHORITY_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.authorityHash;
  if (semanticHash(material) !== value.authorityHash) {
    throw new Error('TopologyEditTableIntent: authority hash mismatch.');
  }
  return value;
}

function normalizeIntentPayload(kind, requestedValue, geometryPolicy, row, projection) {
  if (kind === 'PIPE_LENGTH') return normalizePipeLength(requestedValue, geometryPolicy, row);
  if (kind === 'VALVE_REPLACEMENT') {
    return normalizeValveReplacement(requestedValue, geometryPolicy, row);
  }
  if (kind === 'TEE_REDUCER_RELATION') {
    return normalizeTeeReducerRelation(requestedValue, row, projection);
  }
  throw new RangeError(`TopologyEditTableIntent: unsupported intent kind ${kind}.`);
}

function normalizePipeLength(requestedValue, geometryPolicy, row) {
  if (row.elementType !== 'PIPE' || row.identity.canonicalKind !== 'EDGE') {
    throw new RangeError('TopologyEditTableIntent: PIPE_LENGTH requires an exact canonical PIPE edge row.');
  }
  const lengthMm = Number(requestedValue?.lengthMm ?? requestedValue);
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
    throw new RangeError('TopologyEditTableIntent: PIPE_LENGTH lengthMm must be positive and finite.');
  }
  return {
    requestedValue: { lengthMm },
    geometryPolicy: normalizeGeometryPolicy(geometryPolicy),
  };
}

function normalizeValveReplacement(requestedValue, geometryPolicy, row) {
  if (row.elementType !== 'VALVE' || row.identity.canonicalKind !== 'EDGE') {
    throw new RangeError('TopologyEditTableIntent: VALVE_REPLACEMENT requires an exact canonical VALVE edge row.');
  }
  if (token(row.fields.valveType) !== 'GATE') {
    throw new RangeError('TopologyEditTableIntent: M06 qualification requires an observed GATE valve target.');
  }
  const normalized = normalizeTopologyEditInlineReplacementPayload({
    edgeId: row.identity.canonicalId,
    direction: requestedValue?.direction ?? 'FROM_TO',
    catalogueBinding: requestedValue?.catalogueBinding,
  });
  if (normalized.catalogueBinding.valveType !== 'BALL') {
    throw new RangeError('TopologyEditTableIntent: M06 replacement catalogue record must be a BALL valve.');
  }
  const observedDn = finitePositive(row.fields.dnInMm);
  if (observedDn !== null
    && Math.abs(observedDn - normalized.catalogueBinding.nominalSizeMm) > 1e-9) {
    throw new RangeError('TopologyEditTableIntent: replacement valve nominal size differs from the target row.');
  }
  return {
    requestedValue: {
      direction: normalized.direction,
      catalogueBinding: normalized.catalogueBinding,
    },
    geometryPolicy: normalizeGeometryPolicy(geometryPolicy),
  };
}

function normalizeTeeReducerRelation(requestedValue, row, projection) {
  if (row.elementType !== 'TEE' || row.identity.canonicalKind !== 'JUNCTION') {
    throw new RangeError('TopologyEditTableIntent: TEE_REDUCER_RELATION requires an exact TEE junction row.');
  }
  const branchNodeId = requiredText(requestedValue?.branchNodeId, 'requestedValue.branchNodeId');
  const branchPortKey = requiredText(requestedValue?.branchPortKey, 'requestedValue.branchPortKey');
  const runNodeIds = [...(requestedValue?.runNodeIds ?? [])].sort();
  const binding = row.identity.portBindings.find((item) => (
    item.nodeId === branchNodeId && item.portKey === branchPortKey
  ));
  if (!binding) {
    throw new RangeError('TopologyEditTableIntent: branch node/port is not an exact TEE row binding.');
  }
  const expectedRuns = row.identity.nodeIds.filter((id) => id !== branchNodeId).sort();
  if (runNodeIds.length !== 2 || semanticHash(runNodeIds) !== semanticHash(expectedRuns)) {
    throw new RangeError('TopologyEditTableIntent: runNodeIds must be the exact two non-branch TEE nodes.');
  }
  const reducerRow = exactRow(
    projection,
    requestedValue?.reducerCanonicalId ?? requestedValue?.reducerEdgeId,
  );
  if (reducerRow.elementType !== 'REDUCER' || reducerRow.identity.canonicalKind !== 'EDGE') {
    throw new RangeError('TopologyEditTableIntent: M10 requires an exact REDUCER edge row.');
  }
  if (reducerRow.custody.catalogueAuthority !== 'EXACT' || !reducerRow.custody.catalogue) {
    throw new RangeError('TopologyEditTableIntent: M10 reducer catalogue authority must be exact.');
  }
  const catalogue = reducerRow.custody.catalogue;
  const suppliedHash = requestedValue?.reducerCatalogueBinding?.recordHash;
  if (suppliedHash && suppliedHash !== catalogue.recordHash) {
    throw new Error('TopologyEditTableIntent: reducer catalogue record changed before intent rebase.');
  }
  const normalized = normalizeTopologyEditJunctionRelationPayload({
    junctionId: row.identity.canonicalId,
    branchNodeId,
    branchPortKey,
    runNodeIds,
    reducerEdgeId: reducerRow.identity.canonicalId,
    reducerCatalogueBinding: {
      catalogueHash: catalogue.catalogueHash,
      sourceHash: catalogue.sourceHash,
      recordId: catalogue.recordId,
      recordHash: catalogue.recordHash,
      componentType: 'REDUCER',
      fromNominalSizeMm: reducerRow.fields.dnInMm,
      toNominalSizeMm: reducerRow.fields.dnOutMm,
    },
    runNominalSizeMm: requestedValue?.runNominalSizeMm,
    teeBranchNominalSizeMm: requestedValue?.teeBranchNominalSizeMm,
    downstreamNominalSizeMm: requestedValue?.downstreamNominalSizeMm,
    relationPolicy: requestedValue?.relationPolicy ?? 'EXPLICIT_REDUCER',
  });
  return { requestedValue: normalized, geometryPolicy: null };
}

function normalizeGeometryPolicy(value) {
  return {
    anchor: requiredEnum(value?.anchor, ANCHORS, 'geometryPolicy.anchor'),
    propagation: requiredEnum(
      value?.propagation,
      PROPAGATION,
      'geometryPolicy.propagation',
    ),
  };
}
function priorValue(kind, row) {
  if (kind === 'PIPE_LENGTH') return deepFreeze({ lengthMm: row.fields.lengthMm });
  if (kind === 'VALVE_REPLACEMENT') return deepFreeze({
    valveType: row.fields.valveType,
    lengthMm: row.fields.lengthMm,
    componentLengthMm: row.fields.componentLengthMm,
    catalogueRecordHash: row.custody.catalogue?.recordHash ?? null,
  });
  if (kind === 'TEE_REDUCER_RELATION') return deepFreeze({
    runDnMm: row.fields.runDnMm,
    branchDnMm: row.fields.branchDnMm,
    branchAngleDeg: row.fields.branchAngleDeg,
  });
  return null;
}
function exactRow(projection, canonicalIdInput) {
  const canonicalId = requiredText(canonicalIdInput, 'canonicalId');
  const matches = projection.rows.filter((row) => row.identity.canonicalId === canonicalId);
  if (matches.length !== 1) {
    throw new RangeError(`TopologyEditTableIntent: canonicalId ${canonicalId} resolved ${matches.length} rows.`);
  }
  return matches[0];
}
function requiredEnum(value, allowed, label) {
  const text = requiredText(value, label).toUpperCase();
  if (!allowed.has(text)) throw new RangeError(`TopologyEditTableIntent: ${label} has unsupported value ${text}.`);
  return text;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) throw new TypeError(`TopologyEditTableIntent: ${label} is required.`);
  return text;
}
function token(value) { return stringValue(value).toUpperCase(); }
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
