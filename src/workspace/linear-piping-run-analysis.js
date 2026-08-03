import {
  compileLinearPipingInputXmlAnalysisContext,
} from '../core/linear-piping-analysis-consumer/index.js';
import {
  MULTICASE_APPLICATION_REQUEST_SCHEMA,
  compileLinearPipingMulticaseApplication,
} from '../core/linear-piping-multicase-application/index.js';

export const LINEAR_PIPING_WORKBENCH_RUN_REQUEST_SCHEMA =
  'linear-piping-workbench-run-request/v1';
export const LINEAR_PIPING_WORKBENCH_RUN_RESULT_SCHEMA =
  'linear-piping-workbench-run-result/v1';

export const LINEAR_PIPING_WORKBENCH_RUN_REQUEST_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'cases',
  'interfaceAuthority',
  'nozzleAllowableProfiles',
  'b31Authority',
]);
export const LINEAR_PIPING_WORKBENCH_RUN_CASE_KEYS = Object.freeze([
  'caseId',
  'inputXmlAnalysisRequest',
]);

/**
 * Execute the existing browser-safe production orchestration for one caller-
 * supplied workbench request. One factorization cache is shared across every
 * case in this invocation; no fixture or engineering authority is supplied by
 * this module.
 */
export function runLinearPipingWorkbenchAnalysis(value) {
  const accepted = requireLinearPipingWorkbenchRunRequest(value);
  const runtime = { factorizationCache: new Map() };
  const cases = accepted.cases.map((entry) => {
    try {
      return Object.freeze({
        caseId: entry.caseId,
        inputXmlAnalysisContext: compileLinearPipingInputXmlAnalysisContext(
          entry.inputXmlAnalysisRequest,
          runtime,
        ),
      });
    } catch (error) {
      throw stagedError(error, `CASE:${entry.caseId}:INPUTXML_ANALYSIS`);
    }
  });

  let multicaseApplication;
  try {
    multicaseApplication = compileLinearPipingMulticaseApplication({
      schema: MULTICASE_APPLICATION_REQUEST_SCHEMA,
      applicationId: accepted.applicationId,
      cases,
      interfaceAuthority: accepted.interfaceAuthority,
      nozzleAllowableProfiles: accepted.nozzleAllowableProfiles,
      b31Authority: accepted.b31Authority,
    });
  } catch (error) {
    throw stagedError(error, 'MULTICASE_APPLICATION');
  }

  return Object.freeze({
    schema: LINEAR_PIPING_WORKBENCH_RUN_RESULT_SCHEMA,
    cases: Object.freeze(cases),
    multicaseApplication,
    runtimeEvidence: Object.freeze({
      factorizationCacheEntryCount: runtime.factorizationCache.size,
      sharedAcrossCaseCount: cases.length,
    }),
  });
}

export function requireLinearPipingWorkbenchRunRequest(value) {
  requireRecord(value, 'runRequest');
  requireExactKeys(value, LINEAR_PIPING_WORKBENCH_RUN_REQUEST_KEYS, 'runRequest');
  if (value.schema !== LINEAR_PIPING_WORKBENCH_RUN_REQUEST_SCHEMA) {
    failRunRequest(
      `runRequest.schema must be ${LINEAR_PIPING_WORKBENCH_RUN_REQUEST_SCHEMA}.`,
      'PIPING_WORKBENCH_RUN_SCHEMA_INVALID',
    );
  }
  const applicationId = requireText(value.applicationId, 'runRequest.applicationId');
  const cases = requireArray(value.cases, 'runRequest.cases').map((entry, index) => {
    const field = `runRequest.cases[${index}]`;
    requireRecord(entry, field);
    requireExactKeys(entry, LINEAR_PIPING_WORKBENCH_RUN_CASE_KEYS, field);
    requireRecord(entry.inputXmlAnalysisRequest, `${field}.inputXmlAnalysisRequest`);
    return Object.freeze({
      caseId: requireText(entry.caseId, `${field}.caseId`),
      inputXmlAnalysisRequest: entry.inputXmlAnalysisRequest,
    });
  });
  if (cases.length === 0) {
    failRunRequest('runRequest.cases must contain at least one case.', 'PIPING_WORKBENCH_RUN_CASES_EMPTY');
  }
  const caseIds = cases.map((entry) => entry.caseId);
  if (new Set(caseIds).size !== caseIds.length) {
    failRunRequest('runRequest caseId values must be unique.', 'PIPING_WORKBENCH_RUN_CASE_DUPLICATE');
  }
  requireRecord(value.interfaceAuthority, 'runRequest.interfaceAuthority');
  requireArray(value.nozzleAllowableProfiles, 'runRequest.nozzleAllowableProfiles');
  requireRecord(value.b31Authority, 'runRequest.b31Authority');
  return Object.freeze({
    schema: value.schema,
    applicationId,
    cases: Object.freeze(cases),
    interfaceAuthority: value.interfaceAuthority,
    nozzleAllowableProfiles: Object.freeze([...value.nozzleAllowableProfiles]),
    b31Authority: value.b31Authority,
  });
}

function stagedError(error, analysisStage) {
  const staged = new Error(error?.message ?? String(error));
  staged.name = error?.name ?? 'LinearPipingWorkbenchRunError';
  staged.code = error?.code ?? 'PIPING_WORKBENCH_RUN_FAILED';
  staged.evidence = error?.evidence ?? null;
  staged.analysisStage = analysisStage;
  staged.cause = error;
  return staged;
}

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failRunRequest(`${field} must be a record.`, 'PIPING_WORKBENCH_RUN_RECORD_REQUIRED');
  }
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failRunRequest(`${field} must be an array.`, 'PIPING_WORKBENCH_RUN_ARRAY_REQUIRED');
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    failRunRequest(`${field} must be a non-empty string.`, 'PIPING_WORKBENCH_RUN_TEXT_REQUIRED');
  }
  return value;
}

function requireExactKeys(value, expected, field) {
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failRunRequest(`${field} keys are invalid.`, 'PIPING_WORKBENCH_RUN_KEYS_INVALID');
  }
}

function failRunRequest(message, code) {
  const error = new TypeError(message);
  error.code = code;
  error.evidence = null;
  throw error;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
