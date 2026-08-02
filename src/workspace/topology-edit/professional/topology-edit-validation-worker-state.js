import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditValidationWorkerRequest,
  assertTopologyEditValidationWorkerResponse,
} from './topology-edit-validation-worker-contract.js';

export const TOPOLOGY_EDIT_VALIDATION_WORKER_STATE_SCHEMA =
  'TopologyEditValidationWorkerState.v1';
export const TOPOLOGY_EDIT_VALIDATION_WORKER_DISPOSITION_SCHEMA =
  'TopologyEditValidationWorkerDisposition.v1';

const REJECTION_STATUSES = Object.freeze({
  CANCELLED: 'REJECTED_CANCELLED',
  SUPERSEDED: 'REJECTED_SUPERSEDED',
  NO_ACTIVE: 'REJECTED_NO_ACTIVE_REQUEST',
  BASIS: 'REJECTED_BASIS_HASH',
  PLAN: 'REJECTED_PLAN_HASH',
  SCOPE: 'REJECTED_CHANGED_SCOPE_HASH',
  TOPOLOGY: 'REJECTED_VALIDATED_TOPOLOGY_HASH',
});

export function createTopologyEditValidationWorkerState() {
  return createState({
    generation: 0,
    activeRequest: null,
    supersededRequestIds: [],
    cancelledRequestIds: [],
    acceptedResponse: null,
  });
}

export function assertTopologyEditValidationWorkerState(value) {
  if (!isPlainRecord(value)) fail('state must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_VALIDATION_WORKER_STATE_SCHEMA) {
    fail(`state must use ${TOPOLOGY_EDIT_VALIDATION_WORKER_STATE_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.stateHash;
  if (value.stateHash !== semanticHash(material)) {
    fail('stateHash does not match state authority.', RangeError);
  }
  nonNegativeInteger(value.generation, 'generation');
  sortedUnique(value.supersededRequestIds, 'supersededRequestIds');
  sortedUnique(value.cancelledRequestIds, 'cancelledRequestIds');
  if (value.activeRequest !== null) assertRequestSummary(value.activeRequest);
  if (value.acceptedResponse !== null) assertAcceptedSummary(value.acceptedResponse);
  return value;
}

export function beginTopologyEditValidationWorkerRequest(stateInput, requestInput) {
  const state = assertTopologyEditValidationWorkerState(stateInput);
  const request = assertTopologyEditValidationWorkerRequest(requestInput);
  if (state.activeRequest?.requestId === request.requestId) return state;
  const superseded = new Set(state.supersededRequestIds);
  if (state.activeRequest) superseded.add(state.activeRequest.requestId);
  const cancelled = new Set(state.cancelledRequestIds);
  cancelled.delete(request.requestId);
  return createState({
    generation: state.generation + 1,
    activeRequest: requestSummary(request),
    supersededRequestIds: [...superseded],
    cancelledRequestIds: [...cancelled],
    acceptedResponse: state.acceptedResponse,
  });
}

export function cancelTopologyEditValidationWorkerRequest(stateInput, requestIdInput) {
  const state = assertTopologyEditValidationWorkerState(stateInput);
  const requestId = requiredText(requestIdInput, 'requestId');
  if (state.activeRequest?.requestId !== requestId) return state;
  const cancelled = new Set(state.cancelledRequestIds);
  cancelled.add(requestId);
  return createState({
    generation: state.generation + 1,
    activeRequest: null,
    supersededRequestIds: state.supersededRequestIds,
    cancelledRequestIds: [...cancelled],
    acceptedResponse: state.acceptedResponse,
  });
}

export function acceptTopologyEditValidationWorkerResponse(stateInput, responseInput) {
  const state = assertTopologyEditValidationWorkerState(stateInput);
  const response = assertTopologyEditValidationWorkerResponse(responseInput);
  const status = responseDisposition(state, response);
  if (status !== 'ACCEPTED') return disposition(status, state, response, null);
  const next = createState({
    generation: state.generation + 1,
    activeRequest: null,
    supersededRequestIds: state.supersededRequestIds,
    cancelledRequestIds: state.cancelledRequestIds,
    acceptedResponse: {
      requestId: response.requestId,
      responseHash: response.responseHash,
      validationHash: response.validationHash,
    },
  });
  return disposition('ACCEPTED', next, response, response.receipt);
}

export function assertTopologyEditValidationWorkerDisposition(value) {
  if (!isPlainRecord(value)) fail('disposition must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_VALIDATION_WORKER_DISPOSITION_SCHEMA) {
    fail(`disposition must use ${TOPOLOGY_EDIT_VALIDATION_WORKER_DISPOSITION_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.dispositionHash;
  if (value.dispositionHash !== semanticHash(material)) {
    fail('dispositionHash does not match disposition authority.', RangeError);
  }
  assertTopologyEditValidationWorkerState(value.state);
  return value;
}

function responseDisposition(state, response) {
  if (state.cancelledRequestIds.includes(response.requestId)) {
    return REJECTION_STATUSES.CANCELLED;
  }
  if (state.supersededRequestIds.includes(response.requestId)) {
    return REJECTION_STATUSES.SUPERSEDED;
  }
  if (!state.activeRequest) return REJECTION_STATUSES.NO_ACTIVE;
  if (state.activeRequest.requestId !== response.requestId) {
    return REJECTION_STATUSES.SUPERSEDED;
  }
  if (state.activeRequest.basisHash !== response.basisHash) return REJECTION_STATUSES.BASIS;
  if (state.activeRequest.planHash !== response.planHash) return REJECTION_STATUSES.PLAN;
  if (state.activeRequest.changedScopeHash !== response.changedScopeHash) {
    return REJECTION_STATUSES.SCOPE;
  }
  if (state.activeRequest.validatedTopologyHash !== response.validatedTopologyHash) {
    return REJECTION_STATUSES.TOPOLOGY;
  }
  return 'ACCEPTED';
}

function createState(input) {
  const material = {
    schema: TOPOLOGY_EDIT_VALIDATION_WORKER_STATE_SCHEMA,
    generation: nonNegativeInteger(input.generation, 'generation'),
    activeRequest: input.activeRequest === null ? null : assertRequestSummary(input.activeRequest),
    supersededRequestIds: normalizedIds(input.supersededRequestIds),
    cancelledRequestIds: normalizedIds(input.cancelledRequestIds),
    acceptedResponse: input.acceptedResponse === null
      ? null
      : assertAcceptedSummary(input.acceptedResponse),
  };
  return deepFreeze({ ...material, stateHash: semanticHash(material) });
}

function disposition(status, state, response, receipt) {
  const material = {
    schema: TOPOLOGY_EDIT_VALIDATION_WORKER_DISPOSITION_SCHEMA,
    status,
    requestId: response.requestId,
    responseHash: response.responseHash,
    state,
    receipt,
  };
  return deepFreeze({ ...material, dispositionHash: semanticHash(material) });
}

function requestSummary(request) {
  return {
    requestId: request.requestId,
    basisHash: request.basisHash,
    planHash: request.planHash,
    changedScopeHash: request.changedScopeHash,
    validatedTopologyHash: request.validatedTopologyHash,
  };
}

function assertRequestSummary(value) {
  if (!isPlainRecord(value)) fail('activeRequest must be an object.');
  return {
    requestId: requiredText(value.requestId, 'activeRequest.requestId'),
    basisHash: requiredText(value.basisHash, 'activeRequest.basisHash'),
    planHash: requiredText(value.planHash, 'activeRequest.planHash'),
    changedScopeHash: requiredText(
      value.changedScopeHash,
      'activeRequest.changedScopeHash',
    ),
    validatedTopologyHash: requiredText(
      value.validatedTopologyHash,
      'activeRequest.validatedTopologyHash',
    ),
  };
}

function assertAcceptedSummary(value) {
  if (!isPlainRecord(value)) fail('acceptedResponse must be an object.');
  return {
    requestId: requiredText(value.requestId, 'acceptedResponse.requestId'),
    responseHash: requiredText(value.responseHash, 'acceptedResponse.responseHash'),
    validationHash: requiredText(value.validationHash, 'acceptedResponse.validationHash'),
  };
}

function normalizedIds(value) {
  if (!Array.isArray(value)) fail('request ID collection must be an array.');
  return [...new Set(value.map((row, index) => (
    requiredText(row, `requestIds[${index}]`)
  )))].sort(compareText);
}
function sortedUnique(value, label) {
  const normalized = normalizedIds(value);
  if (normalized.length !== value.length
    || normalized.some((row, index) => row !== value[index])) {
    fail(`${label} must be sorted and unique.`, RangeError);
  }
}
function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail(`${label} must be a non-negative integer.`, RangeError);
  }
  return number;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function compareText(left, right) { return left.localeCompare(right); }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditValidationWorkerState: ${message}`);
}
