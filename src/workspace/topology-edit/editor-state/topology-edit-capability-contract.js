import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_CAPABILITY_SCHEMA = 'TopologyEditCapabilityReceipt.v1';
export const TOPOLOGY_EDIT_CAPABILITY_STATUSES = Object.freeze([
  'AVAILABLE',
  'NEEDS_INPUT',
  'BLOCKED',
  'UNREPRESENTABLE',
]);

export const TOPOLOGY_EDIT_CAPABILITY_REASONS = Object.freeze({
  READY: 'READY',
  SELECTION_REQUIRED: 'SELECTION_REQUIRED',
  EXACT_NODE_REQUIRED: 'EXACT_NODE_REQUIRED',
  EXACT_EDGE_REQUIRED: 'EXACT_EDGE_REQUIRED',
  TWO_NODES_REQUIRED: 'TWO_NODES_REQUIRED',
  EXACT_GAP_CONTEXT_INVALID: 'EXACT_GAP_CONTEXT_INVALID',
  ENDPOINT_NOT_GRAPH_OPEN: 'ENDPOINT_NOT_GRAPH_OPEN',
  REQUIRED_ENGINEERING_INPUT_MISSING: 'REQUIRED_ENGINEERING_INPUT_MISSING',
  EXACT_CATALOGUE_RECORD_REQUIRED: 'EXACT_CATALOGUE_RECORD_REQUIRED',
  EXACT_CATALOGUE_RECORD_INCOMPATIBLE: 'EXACT_CATALOGUE_RECORD_INCOMPATIBLE',
  CATALOGUE_UNAVAILABLE: 'CATALOGUE_UNAVAILABLE',
  TABLE_INTENT_NOT_CERTIFIED: 'TABLE_INTENT_NOT_CERTIFIED',
  SUPPORT_EDIT_NOT_CERTIFIED: 'SUPPORT_EDIT_NOT_CERTIFIED',
  STALE_CAPABILITY_BASIS: 'STALE_CAPABILITY_BASIS',
  PLANNER_BLOCKED: 'PLANNER_BLOCKED',
});

const STATUS_SET = new Set(TOPOLOGY_EDIT_CAPABILITY_STATUSES);

export function createTopologyEditCapabilityReceipt(input = {}) {
  const status = requiredEnum(input.status, STATUS_SET, 'status');
  const material = {
    schema: TOPOLOGY_EDIT_CAPABILITY_SCHEMA,
    surfaceId: requiredText(input.surfaceId, 'surfaceId'),
    actionId: requiredText(input.actionId, 'actionId'),
    status,
    reasonCode: requiredText(input.reasonCode, 'reasonCode').toUpperCase(),
    reason: requiredText(input.reason, 'reason'),
    basisCanonicalHash: optionalText(input.basisCanonicalHash),
    selectionHash: optionalText(input.selectionHash),
    selectionRevision: optionalInteger(input.selectionRevision, 'selectionRevision'),
    requiredEvidence: normalizeStringList(input.requiredEvidence),
    missingEvidence: normalizeStringList(input.missingEvidence),
    details: normalizeDetails(input.details),
  };
  return deepFreeze({ ...material, capabilityHash: semanticHash(material) });
}

export function assertTopologyEditCapabilityReceipt(value) {
  if (!isPlainRecord(value) || value.schema !== TOPOLOGY_EDIT_CAPABILITY_SCHEMA) {
    throw new TypeError(`TopologyEditCapability: receipt must use ${TOPOLOGY_EDIT_CAPABILITY_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.capabilityHash;
  if (value.capabilityHash !== semanticHash(material)) {
    throw new RangeError('TopologyEditCapability: capability hash mismatch.');
  }
  createTopologyEditCapabilityReceipt(material);
  return value;
}

export function topologyEditCapabilityIsCurrent(receiptInput, context = {}) {
  const receipt = assertTopologyEditCapabilityReceipt(receiptInput);
  const canonicalHash = optionalText(context.canonicalHash);
  const selectionHash = optionalText(context.selectionHash);
  const selectionRevision = context.selectionRevision;
  if (receipt.basisCanonicalHash && canonicalHash !== receipt.basisCanonicalHash) return false;
  if (receipt.selectionHash && selectionHash !== receipt.selectionHash) return false;
  if (receipt.selectionRevision !== null
    && Number(selectionRevision) !== receipt.selectionRevision) return false;
  return true;
}

export function topologyEditCapabilityAllowsApply(receiptInput, context = {}) {
  const receipt = assertTopologyEditCapabilityReceipt(receiptInput);
  return receipt.status === 'AVAILABLE' && topologyEditCapabilityIsCurrent(receipt, context);
}

function normalizeDetails(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainRecord(value)) throw new TypeError('TopologyEditCapability: details must be an object.');
  return Object.fromEntries(Object.keys(value).sort().map((key) => {
    const entry = value[key];
    if (entry === undefined) throw new TypeError(`TopologyEditCapability: details.${key} must not be undefined.`);
    if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) {
      if (typeof entry === 'number' && !Number.isFinite(entry)) {
        throw new RangeError(`TopologyEditCapability: details.${key} must be finite.`);
      }
      return [key, entry];
    }
    if (Array.isArray(entry)) return [key, entry.map((row) => String(row))];
    throw new TypeError(`TopologyEditCapability: details.${key} must be scalar or string array.`);
  }));
}

function normalizeStringList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError('TopologyEditCapability: evidence lists must be arrays.');
  return [...new Set(value.map((row) => requiredText(row, 'evidence')))].sort();
}
function optionalInteger(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) {
    throw new RangeError(`TopologyEditCapability: ${label} must be a non-negative integer.`);
  }
  return result;
}
function requiredEnum(value, allowed, label) {
  const text = requiredText(value, label).toUpperCase();
  if (!allowed.has(text)) throw new RangeError(`TopologyEditCapability: unsupported ${label} ${text}.`);
  return text;
}
function optionalText(value) {
  const text = stringValue(value);
  return text || null;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) throw new TypeError(`TopologyEditCapability: ${label} is required.`);
  return text;
}
