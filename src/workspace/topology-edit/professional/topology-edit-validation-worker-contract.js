import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditOperationPlan } from './topology-edit-operation-plan.js';
import {
  assertTopologyEditIncrementalValidationReceipt,
  runTopologyEditIncrementalValidation,
} from './topology-edit-incremental-validation.js';
import { topologyEditDiagnosticsHash } from './topology-edit-validation-diagnostics.js';

export const TOPOLOGY_EDIT_VALIDATION_WORKER_REQUEST_SCHEMA =
  'TopologyEditValidationWorkerRequest.v1';
export const TOPOLOGY_EDIT_VALIDATION_WORKER_RESPONSE_SCHEMA =
  'TopologyEditValidationWorkerResponse.v1';

export function createTopologyEditValidationWorkerRequest(input = {}) {
  const plan = assertTopologyEditOperationPlan(input.operationPlan);
  const material = {
    schema: TOPOLOGY_EDIT_VALIDATION_WORKER_REQUEST_SCHEMA,
    basisHash: plan.basisHash,
    planHash: plan.planHash,
    changedScopeHash: plan.changedScope.changedScopeHash,
    validatedTopologyHash: requiredText(
      input.validatedTopologyHash,
      'validatedTopologyHash',
    ),
    previousIssueHash: requiredText(
      input.previousIssueHash,
      'previousIssueHash',
    ),
    checkerOptions: normalizeRecord(input.checkerOptions ?? {}, 'checkerOptions'),
    performancePolicy: normalizePerformancePolicy(input.performancePolicy),
    blockingSeverities: normalizeSeverities(input.blockingSeverities ?? ['HIGH']),
  };
  return deepFreeze({
    ...material,
    requestId: `validation-request:${semanticHash(material)}`,
  });
}

export function assertTopologyEditValidationWorkerRequest(value) {
  if (!isPlainRecord(value)) fail('request must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_VALIDATION_WORKER_REQUEST_SCHEMA) {
    fail(`request must use ${TOPOLOGY_EDIT_VALIDATION_WORKER_REQUEST_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.requestId;
  if (value.requestId !== `validation-request:${semanticHash(material)}`) {
    fail('requestId does not match request authority.', RangeError);
  }
  normalizeRecord(value.checkerOptions, 'checkerOptions');
  normalizePerformancePolicy(value.performancePolicy);
  normalizeSeverities(value.blockingSeverities);
  return value;
}

export function executeTopologyEditValidationWorkerRequest(input = {}) {
  const request = assertTopologyEditValidationWorkerRequest(input.request);
  const plan = assertTopologyEditOperationPlan(input.operationPlan);
  assertRequestMatchesInputs(request, plan, input.canonicalTopology, input.previousDiagnostics);
  const receipt = runTopologyEditIncrementalValidation({
    canonicalTopology: input.canonicalTopology,
    operationPlan: plan,
    previousDiagnostics: input.previousDiagnostics,
    checkerOptions: request.checkerOptions,
    performancePolicy: request.performancePolicy,
    checker: input.checker,
    now: input.now,
  });
  return createTopologyEditValidationWorkerResponse({ request, receipt });
}

export function createTopologyEditValidationWorkerResponse(input = {}) {
  const request = assertTopologyEditValidationWorkerRequest(input.request);
  const receipt = assertTopologyEditIncrementalValidationReceipt(input.receipt);
  assertReceiptMatchesRequest(receipt, request);
  const issueRows = receipt.finalDiagnostics.map((row) => ({
    id: issueId(row),
    severity: stringValue(row.severity).toUpperCase() || 'UNKNOWN',
  }));
  const blocking = new Set(request.blockingSeverities);
  const material = {
    schema: TOPOLOGY_EDIT_VALIDATION_WORKER_RESPONSE_SCHEMA,
    requestId: request.requestId,
    basisHash: request.basisHash,
    planHash: request.planHash,
    changedScopeHash: request.changedScopeHash,
    validatedTopologyHash: request.validatedTopologyHash,
    validationHash: receipt.validationHash,
    issueIds: issueRows.map((row) => row.id).sort(compareText),
    blockingIssueIds: issueRows.filter((row) => blocking.has(row.severity))
      .map((row) => row.id).sort(compareText),
    warningIssueIds: issueRows.filter((row) => !blocking.has(row.severity))
      .map((row) => row.id).sort(compareText),
    receipt,
  };
  return deepFreeze({
    ...material,
    responseHash: semanticHash(material),
  });
}

export function assertTopologyEditValidationWorkerResponse(value) {
  if (!isPlainRecord(value)) fail('response must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_VALIDATION_WORKER_RESPONSE_SCHEMA) {
    fail(`response must use ${TOPOLOGY_EDIT_VALIDATION_WORKER_RESPONSE_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.responseHash;
  if (value.responseHash !== semanticHash(material)) {
    fail('responseHash does not match response authority.', RangeError);
  }
  assertTopologyEditIncrementalValidationReceipt(value.receipt);
  if (value.validationHash !== value.receipt.validationHash) {
    fail('response validationHash differs from receipt.', RangeError);
  }
  assertSortedUnique(value.issueIds, 'issueIds');
  assertSortedUnique(value.blockingIssueIds, 'blockingIssueIds');
  assertSortedUnique(value.warningIssueIds, 'warningIssueIds');
  return value;
}

function assertRequestMatchesInputs(request, plan, canonical, previousDiagnostics) {
  const mismatches = [];
  if (request.basisHash !== plan.basisHash) mismatches.push('basisHash');
  if (request.planHash !== plan.planHash) mismatches.push('planHash');
  if (request.changedScopeHash !== plan.changedScope.changedScopeHash) {
    mismatches.push('changedScopeHash');
  }
  if (request.validatedTopologyHash !== canonical?.canonicalTopologyHash) {
    mismatches.push('validatedTopologyHash');
  }
  if (request.previousIssueHash !== topologyEditDiagnosticsHash(previousDiagnostics)) {
    mismatches.push('previousIssueHash');
  }
  if (mismatches.length) fail(`request differs from execution inputs: ${mismatches.join(', ')}.`, RangeError);
}

function assertReceiptMatchesRequest(receipt, request) {
  const pairs = [
    ['priorBasisHash', 'basisHash'],
    ['planHash', 'planHash'],
    ['changedScopeHash', 'changedScopeHash'],
    ['validatedTopologyHash', 'validatedTopologyHash'],
  ];
  const mismatches = pairs.filter(([receiptField, requestField]) => (
    receipt[receiptField] !== request[requestField]
  )).map(([field]) => field);
  if (mismatches.length) fail(`receipt differs from request: ${mismatches.join(', ')}.`, RangeError);
}

function normalizePerformancePolicy(value) {
  if (!isPlainRecord(value)) fail('performancePolicy must be an object.');
  const result = {
    fastPathBudgetMs: positive(value.fastPathBudgetMs, 'fastPathBudgetMs'),
    warningBudgetMs: positive(value.warningBudgetMs, 'warningBudgetMs'),
    hysteresisMs: nonNegative(value.hysteresisMs, 'hysteresisMs'),
  };
  if (result.warningBudgetMs < result.fastPathBudgetMs) {
    fail('warningBudgetMs must be at least fastPathBudgetMs.', RangeError);
  }
  return result;
}

function normalizeSeverities(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('blockingSeverities must be a non-empty array.');
  }
  return [...new Set(value.map((row, index) => (
    requiredText(row, `blockingSeverities[${index}]`).toUpperCase()
  )))].sort(compareText);
}

function normalizeRecord(value, path) {
  if (!isPlainRecord(value)) fail(`${path} must be an object.`);
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [
    key,
    normalizeValue(value[key], `${path}.${key}`),
  ]));
}

function normalizeValue(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} must contain finite numbers.`, RangeError);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((row, index) => normalizeValue(row, `${path}[${index}]`));
  if (isPlainRecord(value)) return normalizeRecord(value, path);
  fail(`${path} contains unsupported ${typeof value}.`);
}

function issueId(value) {
  return stringValue(value?.id) || `issue:${semanticHash(value)}`;
}
function assertSortedUnique(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const normalized = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length || normalized.some((row, index) => row !== [...normalized].sort(compareText)[index])) {
    fail(`${label} must be sorted and unique.`, RangeError);
  }
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be positive.`, RangeError);
  return number;
}
function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${label} must be non-negative.`, RangeError);
  return number;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function compareText(left, right) { return left.localeCompare(right); }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditValidationWorkerContract: ${message}`);
}
