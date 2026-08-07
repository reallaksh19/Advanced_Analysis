import { deepFreeze, semanticHash, stringValue } from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_INTENT_SCHEMA = 'TopologyEditTableIntent.v1';
export const TOPOLOGY_EDIT_TABLE_AUTHORITY_SCHEMA = 'TopologyEditTableEditAuthority.v1';

const INTENT_KINDS = new Set(['PIPE_LENGTH']);
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
  const payload = normalizeIntentPayload(kind, requestedValue, geometryPolicy, row);
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

function normalizeIntentPayload(kind, requestedValue, geometryPolicy, row) {
  if (kind === 'PIPE_LENGTH') {
    if (row.elementType !== 'PIPE' || row.identity.canonicalKind !== 'EDGE') {
      throw new RangeError('TopologyEditTableIntent: PIPE_LENGTH requires an exact canonical PIPE edge row.');
    }
    const lengthMm = Number(requestedValue?.lengthMm ?? requestedValue);
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      throw new RangeError('TopologyEditTableIntent: PIPE_LENGTH lengthMm must be positive and finite.');
    }
    const anchor = requiredEnum(geometryPolicy?.anchor, ANCHORS, 'geometryPolicy.anchor');
    const propagation = requiredEnum(
      geometryPolicy?.propagation,
      PROPAGATION,
      'geometryPolicy.propagation',
    );
    return {
      requestedValue: { lengthMm },
      geometryPolicy: { anchor, propagation },
    };
  }
  throw new RangeError(`TopologyEditTableIntent: unsupported intent kind ${kind}.`);
}

function priorValue(kind, row) {
  if (kind === 'PIPE_LENGTH') return deepFreeze({ lengthMm: row.fields.lengthMm });
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
