import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import { TOPOLOGY_EDIT_GOVERNED_COMMANDS } from '../topology-edit-command-contract.js';
import {
  assertTopologyEditChangedScope,
  TOPOLOGY_EDIT_CHANGED_SCOPE_SCHEMA,
} from './topology-edit-change-scope.js';
import {
  normalizeTopologyEditCanonicalIds,
} from './topology-edit-canonical-id.js';

export const TOPOLOGY_EDIT_OPERATION_PLAN_SCHEMA = 'TopologyEditOperationPlan.v1';
export const TOPOLOGY_EDIT_OPERATION_RESULT_SCHEMA = 'TopologyEditOperationPlanningResult.v1';
export const TOPOLOGY_EDIT_OPERATION_TYPES = Object.freeze([
  'EXTEND_EDGE',
  'SHORTEN_EDGE',
  'SPLIT_EDGE_FROM_DISTANCE',
  'RECONNECT_ENDPOINTS',
  'MOVE_CONNECTED_RUN',
  'CREATE_ORTHOGONAL_OFFSET',
  'APPLY_DECLARED_SLOPE',
  'INSERT_INLINE_COMPONENT',
  'INSERT_BRANCH_COMPONENT',
  'START_ROUTE',
]);

const OPERATION_TYPES = new Set(TOPOLOGY_EDIT_OPERATION_TYPES);
const COMMAND_TYPES = new Set(TOPOLOGY_EDIT_GOVERNED_COMMANDS);
const UNRESOLVED_STATUSES = new Set(['UNAVAILABLE', 'AMBIGUOUS', 'INCOMPATIBLE', 'UNRESOLVED']);

export function createTopologyEditOperationPlan(input = {}) {
  const basisHash = requiredText(input.basisHash, 'basisHash');
  const changedScope = assertTopologyEditChangedScope(input.changedScope);
  if (changedScope.basisHash !== basisHash) fail('changedScope basisHash does not match plan basisHash.', RangeError);
  const targetIds = normalizeTopologyEditCanonicalIds(input.targetIds, 'targetIds');
  assertTargetsDeclared(targetIds, changedScope);
  const material = {
    schema: TOPOLOGY_EDIT_OPERATION_PLAN_SCHEMA,
    status: 'PLANNED',
    operationType: normalizeOperationType(input.operationType),
    basisHash,
    targetIds,
    parameters: normalizeJsonRecord(input.parameters ?? {}, 'parameters'),
    commandIntents: normalizeCommandIntents(input.commandIntents),
    changedScope,
    unresolvedEvidence: normalizeUnresolvedEvidence(input.unresolvedEvidence),
  };
  return deepFreeze({ ...material, planHash: semanticHash(material) });
}

export function assertTopologyEditOperationPlan(value) {
  if (!isPlainRecord(value)) fail('plan must be an object.');
  const rebuilt = createTopologyEditOperationPlan(value);
  const supplied = { ...value };
  delete supplied.planHash;
  if (
    value.schema !== TOPOLOGY_EDIT_OPERATION_PLAN_SCHEMA
    || value.status !== 'PLANNED'
    || value.planHash !== semanticHash(supplied)
    || value.planHash !== rebuilt.planHash
  ) fail('plan differs from its immutable normalized authority.', RangeError);
  return rebuilt;
}

export function createUnrepresentableTopologyEditOperationResult(input = {}) {
  const material = {
    schema: TOPOLOGY_EDIT_OPERATION_RESULT_SCHEMA,
    status: 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS',
    operationType: normalizeOperationType(input.operationType),
    basisHash: requiredText(input.basisHash, 'basisHash'),
    targetIds: normalizeTopologyEditCanonicalIds(input.targetIds, 'targetIds'),
    reasonCode: requiredText(input.reasonCode, 'reasonCode').toUpperCase(),
    reason: requiredText(input.reason, 'reason'),
  };
  return deepFreeze({ ...material, resultHash: semanticHash(material) });
}

function normalizeCommandIntents(value) {
  if (!Array.isArray(value) || value.length === 0) fail('commandIntents must be a non-empty array.');
  return value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`commandIntents[${index}] must be an object.`);
    const commandType = requiredText(row.commandType, `commandIntents[${index}].commandType`).toUpperCase();
    if (!COMMAND_TYPES.has(commandType)) {
      fail(`commandIntents[${index}] uses unsupported governed command ${commandType}.`, RangeError);
    }
    return {
      sequence: index,
      commandType,
      payload: normalizeJsonRecord(row.payload ?? {}, `commandIntents[${index}].payload`),
    };
  });
}

function normalizeUnresolvedEvidence(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail('unresolvedEvidence must be an array.');
  const records = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`unresolvedEvidence[${index}] must be an object.`);
    const status = requiredText(row.status, `unresolvedEvidence[${index}].status`).toUpperCase();
    if (!UNRESOLVED_STATUSES.has(status)) fail(`unsupported unresolved evidence status ${status}.`, RangeError);
    return {
      code: requiredText(row.code, `unresolvedEvidence[${index}].code`).toUpperCase(),
      status,
      targetIds: normalizeTopologyEditCanonicalIds(
        row.targetIds ?? [],
        `unresolvedEvidence[${index}].targetIds`,
      ),
      field: row.field === undefined || row.field === null
        ? null
        : requiredText(row.field, `unresolvedEvidence[${index}].field`),
      details: normalizeJsonRecord(row.details ?? {}, `unresolvedEvidence[${index}].details`),
    };
  });
  return records.sort((left, right) => evidenceSortKey(left).localeCompare(evidenceSortKey(right)));
}

function normalizeJsonRecord(value, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  return normalizeJsonValue(value, label, new Set());
}

function normalizeJsonValue(value, path, active) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} must contain only finite numbers.`, RangeError);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    assertNotActive(value, active, path);
    active.add(value);
    const result = value.map((child, index) => normalizeJsonValue(child, `${path}[${index}]`, active));
    active.delete(value);
    return result;
  }
  if (isPlainRecord(value)) {
    assertNotActive(value, active, path);
    active.add(value);
    const result = Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) fail(`${path}.${key} must not be undefined.`);
      return [key, normalizeJsonValue(value[key], `${path}.${key}`, active)];
    }));
    active.delete(value);
    return result;
  }
  fail(`${path} contains unsupported ${typeof value}.`);
}

function assertTargetsDeclared(targetIds, changedScope) {
  const declared = new Set([
    ...changedScope.nodeIds,
    ...changedScope.edgeIds,
    ...changedScope.junctionIds,
    ...changedScope.supportIds,
    ...changedScope.boundaryIds,
    ...changedScope.validationNeighbourhoodIds,
  ]);
  const missing = targetIds.filter((id) => !declared.has(id));
  if (missing.length) fail(`target IDs are absent from changedScope: ${missing.join(', ')}.`, RangeError);
}

function normalizeOperationType(value) {
  const operationType = requiredText(value, 'operationType').toUpperCase();
  if (!OPERATION_TYPES.has(operationType)) fail(`unsupported operation type ${operationType}.`, RangeError);
  return operationType;
}
function evidenceSortKey(value) {
  return `${value.status}|${value.code}|${value.targetIds.join(',')}|${value.field || ''}|${semanticHash(value.details)}`;
}
function assertNotActive(value, active, path) {
  if (active.has(value)) fail(`${path} must not contain cycles.`);
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditOperationPlan: ${message}`);
}

export { TOPOLOGY_EDIT_CHANGED_SCOPE_SCHEMA };
