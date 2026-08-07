import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  NON_FEA_COMMON_METHOD_IDS,
  requireCommonEnrichedPipingInput,
  requirePreFeaPipingCheckReport,
} from '../non-fea-common-checker/index.js';

export const NON_FEA_ANALYSIS_PLAN_SCHEMAS = Object.freeze({
  IMPLEMENTATION_REGISTRY: 'non-fea-method-implementation-registry/v1',
  IMPLEMENTATION_BINDING: 'non-fea-method-implementation-binding/v1',
  EXECUTION_READINESS: 'non-fea-method-execution-readiness/v1',
  ANALYSIS_PLAN: 'non-fea-analysis-plan/v1',
  AUTHORITY_REVISION_VECTOR: 'non-fea-authority-revision-vector/v1',
  AUTHORITY_REVISION_STALENESS: 'non-fea-authority-revision-staleness/v1',
});

export const NON_FEA_IMPLEMENTATION_RUNTIME_STATES = Object.freeze([
  'REGISTERED',
  'NOT_REGISTERED',
  'INTRINSIC',
]);

export const NON_FEA_IMPLEMENTATION_QUALIFICATION_STATES = Object.freeze([
  'QUALIFIED',
  'QUALIFIED_RESTRICTED_DOMAIN',
  'UNQUALIFIED',
  'FUTURE_RESTRICTED_DOMAIN',
  'NOT_APPLICABLE',
]);

export const NON_FEA_EXECUTION_READINESS_STATES = Object.freeze([
  'READY_TO_AUTHORIZE',
  'BLOCKED_INPUT',
  'INPUT_READY_IMPLEMENTATION_NOT_READY',
  'SELECTION_REQUIRED',
]);

export function createNonFeaImplementationRegistry(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('Implementation registry requires at least one row.');
  }
  const implementations = rows.map(normalizeImplementationRow).sort(byImplementationId);
  const duplicate = implementations.find((row, index) => index > 0
    && row.implementationId === implementations[index - 1].implementationId);
  if (duplicate) {
    throw codedError(
      `Duplicate Non-FEA implementation ${duplicate.implementationId}.`,
      'NON_FEA_IMPLEMENTATION_DUPLICATE',
    );
  }
  const base = {
    schema: NON_FEA_ANALYSIS_PLAN_SCHEMAS.IMPLEMENTATION_REGISTRY,
    implementations,
  };
  return requireNonFeaImplementationRegistry({ ...base, semanticHash: semanticHash(base) });
}

export function requireNonFeaImplementationRegistry(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ANALYSIS_PLAN_SCHEMAS.IMPLEMENTATION_REGISTRY) {
    throw new TypeError(`Expected ${NON_FEA_ANALYSIS_PLAN_SCHEMAS.IMPLEMENTATION_REGISTRY}.`);
  }
  const base = { schema: value.schema, implementations: value.implementations };
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError('Implementation registry hash is stale.', 'NON_FEA_IMPLEMENTATION_REGISTRY_HASH_MISMATCH');
  }
  const normalized = value.implementations.map(normalizeImplementationRow).sort(byImplementationId);
  if (JSON.stringify(normalized) !== JSON.stringify(value.implementations)) {
    throw codedError('Implementation registry rows are not in canonical order.', 'NON_FEA_IMPLEMENTATION_REGISTRY_ORDER_INVALID');
  }
  const ids = normalized.map((row) => row.implementationId);
  if (new Set(ids).size !== ids.length) {
    throw codedError('Implementation registry contains duplicate identities.', 'NON_FEA_IMPLEMENTATION_DUPLICATE');
  }
  return deepFreeze(value);
}

export function createNonFeaImplementationBinding(input) {
  if (!isRecord(input)) throw new TypeError('Implementation binding input must be an object.');
  const commonMethodId = commonMethodIdOf(input.commonMethodId);
  const implementationId = requiredText(input.implementationId, 'implementationId');
  const implementationRegistrySemanticHash = semanticHashText(
    input.implementationRegistrySemanticHash,
    'implementationRegistrySemanticHash',
  );
  const runtimeState = enumValue(
    input.runtimeState,
    NON_FEA_IMPLEMENTATION_RUNTIME_STATES,
    'runtimeState',
  );
  const qualificationState = enumValue(
    input.qualificationState,
    NON_FEA_IMPLEMENTATION_QUALIFICATION_STATES,
    'qualificationState',
  );
  const base = {
    schema: NON_FEA_ANALYSIS_PLAN_SCHEMAS.IMPLEMENTATION_BINDING,
    commonMethodId,
    implementationId,
    implementationRegistrySemanticHash,
    runtimeState,
    qualificationState,
    qualificationProfileId: nullableText(input.qualificationProfileId),
    qualificationProfileSemanticHash: nullableSemanticHash(
      input.qualificationProfileSemanticHash,
      'qualificationProfileSemanticHash',
    ),
    purpose: nullableText(input.purpose),
    selection: enumValue(input.selection || 'AUTOMATIC', ['AUTOMATIC', 'EXPLICIT'], 'selection'),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireNonFeaImplementationBinding(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ANALYSIS_PLAN_SCHEMAS.IMPLEMENTATION_BINDING) {
    throw new TypeError(`Expected ${NON_FEA_ANALYSIS_PLAN_SCHEMAS.IMPLEMENTATION_BINDING}.`);
  }
  const base = { ...value };
  delete base.semanticHash;
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError('Implementation binding hash is stale.', 'NON_FEA_IMPLEMENTATION_BINDING_HASH_MISMATCH');
  }
  commonMethodIdOf(value.commonMethodId);
  return deepFreeze(value);
}

export function evaluateNonFeaExecutionReadiness(input) {
  if (!isRecord(input)) throw new TypeError('Execution readiness input must be an object.');
  const report = requirePreFeaPipingCheckReport(input.report);
  const registry = requireNonFeaImplementationRegistry(input.implementationRegistry);
  const selected = normalizeSelectionMap(input.selectedImplementations || {});
  const methodRows = report.methodRows.map((row) => evaluateReadinessRow(row, registry, selected));
  const base = {
    schema: NON_FEA_ANALYSIS_PLAN_SCHEMAS.EXECUTION_READINESS,
    checkerReportSemanticHash: report.semanticHash,
    implementationRegistrySemanticHash: registry.semanticHash,
    selectedImplementations: selected,
    methodRows,
    readyToAuthorizeMethodIds: methodRows
      .filter((row) => row.executionState === 'READY_TO_AUTHORIZE')
      .map((row) => row.commonMethodId),
    blockedInputMethodIds: methodRows
      .filter((row) => row.executionState === 'BLOCKED_INPUT')
      .map((row) => row.commonMethodId),
    implementationBlockedMethodIds: methodRows
      .filter((row) => ['INPUT_READY_IMPLEMENTATION_NOT_READY', 'SELECTION_REQUIRED'].includes(row.executionState))
      .map((row) => row.commonMethodId),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function createNonFeaAnalysisPlan(input) {
  if (!isRecord(input)) throw new TypeError('Analysis plan input must be an object.');
  const readiness = requireNonFeaExecutionReadiness(input.executionReadiness);
  const requestedMethodIds = uniqueCommonMethodIds(input.requestedMethodIds);
  const requestedLoadCaseIds = uniqueText(input.requestedLoadCaseIds, 'requestedLoadCaseIds');
  const rowsByMethod = new Map(readiness.methodRows.map((row) => [row.commonMethodId, row]));
  requestedMethodIds.forEach((methodId) => {
    if (!rowsByMethod.has(methodId)) {
      throw codedError(
        `Analysis plan method ${methodId} is absent from the checker report.`,
        'NON_FEA_ANALYSIS_PLAN_METHOD_NOT_EVALUATED',
      );
    }
  });
  const bindings = requestedMethodIds
    .map((methodId) => rowsByMethod.get(methodId).binding)
    .filter(Boolean);
  const base = {
    schema: NON_FEA_ANALYSIS_PLAN_SCHEMAS.ANALYSIS_PLAN,
    planId: requiredText(input.planId, 'planId'),
    checkerReportSemanticHash: readiness.checkerReportSemanticHash,
    implementationRegistrySemanticHash: readiness.implementationRegistrySemanticHash,
    executionReadinessSemanticHash: readiness.semanticHash,
    requestedMethodIds,
    requestedLoadCaseIds,
    qualificationProfileSemanticHash: nullableSemanticHash(
      input.qualificationProfileSemanticHash,
      'qualificationProfileSemanticHash',
    ),
    implementationBindings: bindings,
    executionStates: Object.fromEntries(requestedMethodIds.map((methodId) => [
      methodId,
      rowsByMethod.get(methodId).executionState,
    ])),
    policy: {
      commonInputSealRequired: true,
      explicitImplementationAuthorizationRequired: true,
      autoExecution: false,
      geometryMutationPermitted: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function createNonFeaAuthorityRevisionVector(value) {
  const commonInput = requireCommonEnrichedPipingInput(value);
  const authorityContractSemanticHashes = Object.fromEntries(
    Object.entries(commonInput.authorityContracts || {})
      .sort(([left], [right]) => ascii(left, right))
      .map(([key, row]) => [key, row?.semanticHash || null]),
  );
  const base = {
    schema: NON_FEA_ANALYSIS_PLAN_SCHEMAS.AUTHORITY_REVISION_VECTOR,
    commonInputSemanticHash: commonInput.semanticHash,
    sourceDatasetSha256: commonInput.sourceDatasetSha256,
    sourceModelSemanticHash: commonInput.sourceModelSemanticHash,
    enrichmentSidecarSemanticHash: commonInput.enrichmentSidecarSemanticHash,
    resolutionLedgerSemanticHash: commonInput.resolutionLedgerSemanticHash,
    projectDataProfileSemanticHash: commonInput.projectDataProfileSemanticHash,
    configuredDefaultUsageLedgerSemanticHash:
      commonInput.configuredDefaultUsageLedgerSemanticHash || null,
    qualificationProfileSemanticHash: commonInput.qualificationProfileSemanticHash || null,
    authorityContractSemanticHashes,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function assessNonFeaAuthorityRevisionStaleness(expectedValue, currentValue) {
  const expected = requireAuthorityRevisionVector(expectedValue);
  const current = requireAuthorityRevisionVector(currentValue);
  const changes = [];
  compareRevisionValues(expected, current, '', changes);
  const base = {
    schema: NON_FEA_ANALYSIS_PLAN_SCHEMAS.AUTHORITY_REVISION_STALENESS,
    expectedRevisionVectorSemanticHash: expected.semanticHash,
    currentRevisionVectorSemanticHash: current.semanticHash,
    stale: changes.length > 0,
    changes: changes.sort((left, right) => ascii(`${left.path}|${left.code}`, `${right.path}|${right.code}`)),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireNonFeaExecutionReadiness(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ANALYSIS_PLAN_SCHEMAS.EXECUTION_READINESS) {
    throw new TypeError(`Expected ${NON_FEA_ANALYSIS_PLAN_SCHEMAS.EXECUTION_READINESS}.`);
  }
  const base = { ...value };
  delete base.semanticHash;
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError('Execution readiness hash is stale.', 'NON_FEA_EXECUTION_READINESS_HASH_MISMATCH');
  }
  return deepFreeze(value);
}

export function requireAuthorityRevisionVector(value) {
  if (!isRecord(value) || value.schema !== NON_FEA_ANALYSIS_PLAN_SCHEMAS.AUTHORITY_REVISION_VECTOR) {
    throw new TypeError(`Expected ${NON_FEA_ANALYSIS_PLAN_SCHEMAS.AUTHORITY_REVISION_VECTOR}.`);
  }
  const base = { ...value };
  delete base.semanticHash;
  if (semanticHash(base) !== value.semanticHash) {
    throw codedError('Authority revision vector hash is stale.', 'NON_FEA_AUTHORITY_REVISION_VECTOR_HASH_MISMATCH');
  }
  return deepFreeze(value);
}

function evaluateReadinessRow(methodRow, registry, selected) {
  const commonMethodId = commonMethodIdOf(methodRow.methodId);
  const inputState = methodRow.state === 'READY' ? 'READY' : 'BLOCKED';
  const candidates = registry.implementations.filter((row) => row.commonMethodIds.includes(commonMethodId));
  const selectedImplementationId = selected[commonMethodId] || null;
  const selectedRow = selectedImplementationId
    ? candidates.find((row) => row.implementationId === selectedImplementationId) || null
    : null;
  if (selectedImplementationId && !selectedRow) {
    throw codedError(
      `Selected implementation ${selectedImplementationId} does not implement ${commonMethodId}.`,
      'NON_FEA_IMPLEMENTATION_SELECTION_INVALID',
    );
  }
  const qualified = candidates.filter(isImplementationQualified);
  const selectedQualified = selectedRow ? isImplementationQualified(selectedRow) : false;
  const chosen = selectedRow
    ? (selectedQualified ? selectedRow : null)
    : (qualified.length === 1 ? qualified[0] : null);
  let implementationState = 'NOT_BOUND';
  let executionState = inputState === 'READY'
    ? 'INPUT_READY_IMPLEMENTATION_NOT_READY'
    : 'BLOCKED_INPUT';
  let blockerCode = null;
  if (selectedRow && !selectedQualified) {
    implementationState = selectedRow.runtimeState === 'NOT_REGISTERED'
      ? 'NOT_REGISTERED'
      : 'UNQUALIFIED';
    blockerCode = implementationState === 'NOT_REGISTERED'
      ? 'NON_FEA_IMPLEMENTATION_NOT_REGISTERED'
      : 'NON_FEA_IMPLEMENTATION_NOT_QUALIFIED';
  } else if (candidates.length > 0 && qualified.length === 0) {
    implementationState = candidates.every((row) => row.runtimeState === 'NOT_REGISTERED')
      ? 'NOT_REGISTERED'
      : 'UNQUALIFIED';
    blockerCode = implementationState === 'NOT_REGISTERED'
      ? 'NON_FEA_IMPLEMENTATION_NOT_REGISTERED'
      : 'NON_FEA_IMPLEMENTATION_NOT_QUALIFIED';
  } else if (!selectedRow && qualified.length > 1) {
    implementationState = 'SELECTION_REQUIRED';
    if (inputState === 'READY') executionState = 'SELECTION_REQUIRED';
    blockerCode = 'NON_FEA_IMPLEMENTATION_SELECTION_REQUIRED';
  } else if (chosen) {
    implementationState = 'QUALIFIED';
    if (inputState === 'READY') executionState = 'READY_TO_AUTHORIZE';
  } else {
    blockerCode = 'NON_FEA_IMPLEMENTATION_BINDING_REQUIRED';
  }
  const binding = chosen
    ? createNonFeaImplementationBinding({
      commonMethodId,
      implementationId: chosen.implementationId,
      implementationRegistrySemanticHash: registry.semanticHash,
      runtimeState: chosen.runtimeState,
      qualificationState: chosen.qualificationState,
      qualificationProfileId: chosen.qualificationProfileId,
      qualificationProfileSemanticHash: chosen.qualificationProfileSemanticHash,
      purpose: chosen.purpose,
      selection: selectedRow ? 'EXPLICIT' : 'AUTOMATIC',
    })
    : null;
  return deepFreeze({
    commonMethodId,
    inputState,
    implementationState,
    executionState,
    selectedImplementationId: binding?.implementationId || selectedImplementationId,
    eligibleImplementationIds: qualified.map((row) => row.implementationId),
    candidateImplementationIds: candidates.map((row) => row.implementationId),
    binding,
    inputBlockers: structuredClone(methodRow.blockers || []),
    implementationBlockerCode: inputState === 'READY' ? blockerCode : null,
  });
}

function normalizeImplementationRow(row) {
  if (!isRecord(row)) throw new TypeError('Implementation row must be an object.');
  const runtimeState = enumValue(row.runtimeState, NON_FEA_IMPLEMENTATION_RUNTIME_STATES, 'runtimeState');
  const qualificationState = enumValue(
    row.qualificationState,
    NON_FEA_IMPLEMENTATION_QUALIFICATION_STATES,
    'qualificationState',
  );
  return deepFreeze({
    implementationId: requiredText(row.implementationId, 'implementationId'),
    commonMethodIds: uniqueCommonMethodIds(row.commonMethodIds),
    runtimeState,
    qualificationState,
    purpose: nullableText(row.purpose),
    qualificationProfileId: nullableText(row.qualificationProfileId),
    qualificationProfileSemanticHash: nullableSemanticHash(
      row.qualificationProfileSemanticHash,
      'qualificationProfileSemanticHash',
    ),
    sourceRegistry: nullableText(row.sourceRegistry),
  });
}

function isImplementationQualified(row) {
  return ['REGISTERED', 'INTRINSIC'].includes(row.runtimeState)
    && ['QUALIFIED', 'QUALIFIED_RESTRICTED_DOMAIN'].includes(row.qualificationState);
}

function normalizeSelectionMap(value) {
  if (!isRecord(value)) throw new TypeError('selectedImplementations must be an object.');
  const entries = Object.entries(value).sort(([left], [right]) => ascii(left, right));
  const normalized = {};
  entries.forEach(([methodId, implementationId]) => {
    normalized[commonMethodIdOf(methodId)] = requiredText(implementationId, `selectedImplementations.${methodId}`);
  });
  return deepFreeze(normalized);
}

function compareRevisionValues(expected, current, path, changes) {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(current)])]
    .filter((key) => !['schema', 'semanticHash', 'commonInputSemanticHash'].includes(key))
    .sort(ascii);
  keys.forEach((key) => {
    const nextPath = path ? `${path}.${key}` : key;
    const left = expected[key];
    const right = current[key];
    if (isRecord(left) && isRecord(right)) {
      compareRevisionValues(left, right, nextPath, changes);
      return;
    }
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changes.push({
        code: 'NON_FEA_AUTHORITY_REVISION_CHANGED',
        path: nextPath,
        expected: left ?? null,
        actual: right ?? null,
      });
    }
  });
}

function uniqueCommonMethodIds(values) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError('commonMethodIds must be a non-empty array.');
  return deepFreeze([...new Set(values.map(commonMethodIdOf))].sort(ascii));
}

function uniqueText(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${label} must be a non-empty array.`);
  return deepFreeze([...new Set(values.map((value, index) => requiredText(value, `${label}[${index}]`)))].sort(ascii));
}

function commonMethodIdOf(value) {
  const methodId = requiredText(value, 'commonMethodId');
  if (!NON_FEA_COMMON_METHOD_IDS.includes(methodId)) throw new TypeError(`Unknown Non-FEA common method ${methodId}.`);
  return methodId;
}

function enumValue(value, allowed, label) {
  const text = requiredText(value, label);
  if (!allowed.includes(text)) throw new TypeError(`${label} must be one of ${allowed.join(', ')}.`);
  return text;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}
function nullableText(value) {
  if (value === null || value === undefined || value === '') return null;
  return requiredText(value, 'text');
}
function semanticHashText(value, label) {
  const text = requiredText(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(text)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  return text;
}
function nullableSemanticHash(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return semanticHashText(value, label);
}
function byImplementationId(left, right) { return ascii(left.implementationId, right.implementationId); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function codedError(message, code) { const error = new Error(message); error.code = code; return error; }
