import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
  authorizeInputXmlLinearSolve,
  diagnoseInputXmlLinearPreFea,
  prepareInputXmlLinearPreFea,
  solveInputXmlLinearAnalysis,
} from './inputxml-linear-prefea.js';

export const GOVERNED_ANALYSIS_PIPELINE_SCHEMA = 'governed-analysis-pipeline/v1';
export const GOVERNED_ANALYSIS_PIPELINE_STAGES = Object.freeze([
  'INGEST',
  'PREPARE',
  'AUTHORIZE',
  'SOLVE',
  'NORMALIZE',
  'COMPARE',
  'REPORT',
]);

export class GovernedAnalysisPipelineError extends Error {
  constructor(message, code, data = {}) {
    super(message);
    this.name = 'GovernedAnalysisPipelineError';
    this.code = code;
    this.data = deepFreeze(structuredClone(data));
  }
}

/**
 * Model-neutral orchestration for benchmark/qualification flows.
 *
 * The stage implementations remain explicit dependencies so a new model format
 * can provide its own ingestion and comparison mapping without duplicating the
 * custody/order contract. Runtime state is deliberately not retained in the
 * returned record; only the normalized result and downstream evidence survive.
 */
export function runGovernedAnalysisPipeline({
  input,
  reference = null,
  context = {},
  stages,
}) {
  requireRecord(stages, 'stages');
  for (const stage of GOVERNED_ANALYSIS_PIPELINE_STAGES) {
    requireFunction(stages[stage.toLowerCase()], `stages.${stage.toLowerCase()}`);
  }

  const ledger = [];
  const call = (stageName, fn, payload) => {
    try {
      const value = fn(payload);
      ledger.push(deepFreeze({
        sequence: ledger.length + 1,
        stage: stageName,
        status: 'PASS',
        identity: stageIdentity(value),
      }));
      return value;
    } catch (error) {
      const failure = deepFreeze({
        sequence: ledger.length + 1,
        stage: stageName,
        status: 'FAIL',
        code: String(error?.code ?? 'PIPELINE_STAGE_FAILED'),
        message: String(error?.message ?? error),
      });
      ledger.push(failure);
      throw new GovernedAnalysisPipelineError(
        `${stageName} stage failed: ${failure.message}`,
        'GOVERNED_ANALYSIS_PIPELINE_STAGE_FAILED',
        {
          failedStage: stageName,
          causeCode: failure.code,
          ledger,
        },
      );
    }
  };

  const ingested = call('INGEST', stages.ingest, { input, context });
  const prepared = call('PREPARE', stages.prepare, { ingested, context });
  const authorized = call('AUTHORIZE', stages.authorize, { ingested, prepared, context });
  const solved = call('SOLVE', stages.solve, { ingested, prepared, authorized, context });
  const normalized = call('NORMALIZE', stages.normalize, {
    ingested,
    prepared,
    authorized,
    solved,
    context,
  });
  const comparison = call('COMPARE', stages.compare, {
    ingested,
    prepared,
    authorized,
    normalized,
    reference,
    context,
  });
  const report = call('REPORT', stages.report, {
    ingested,
    prepared,
    authorized,
    normalized,
    comparison,
    reference,
    context,
    stageLedger: Object.freeze([...ledger]),
  });

  return deepFreeze({
    schema: GOVERNED_ANALYSIS_PIPELINE_SCHEMA,
    status: 'COMPLETE',
    stageLedger: ledger,
    ingestion: ingested,
    preparation: prepared,
    authorization: authorized,
    normalizedResults: normalized,
    comparison,
    report,
  });
}

/**
 * Creates the reusable InputXML implementation of the governed pipeline.
 *
 * By default this is hard-bound to the production pre-FEA APIs. The optional
 * `prefeaApi` injection exists only to make the orchestration independently
 * testable; callers that omit it cannot replace or skip diagnose/prepare/
 * authorize/solve.
 */
export function createGovernedInputXmlPipelineStages({
  ingest,
  requestedProfileId,
  requestedCaseIds,
  diagnosticsOptions = {},
  preparationOptions = {},
  approval,
  executeAuthorizedCases,
  normalize,
  compare,
  report,
  prefeaApi = null,
}) {
  requireFunction(ingest, 'ingest');
  requireText(requestedProfileId, 'requestedProfileId');
  requireStringArray(requestedCaseIds, 'requestedCaseIds');
  requireFunction(executeAuthorizedCases, 'executeAuthorizedCases');
  requireFunction(normalize, 'normalize');
  requireFunction(compare, 'compare');
  requireFunction(report, 'report');

  const api = prefeaApi ?? Object.freeze({
    diagnose: diagnoseInputXmlLinearPreFea,
    prepare: prepareInputXmlLinearPreFea,
    authorize: authorizeInputXmlLinearSolve,
    solve: solveInputXmlLinearAnalysis,
  });
  for (const key of ['diagnose', 'prepare', 'authorize', 'solve']) {
    requireFunction(api[key], `prefeaApi.${key}`);
  }

  return deepFreeze({
    ingest: ({ input, context }) => ingest({ input, context }),

    prepare: ({ ingested }) => {
      requireRecord(ingested, 'ingested');
      requireRecord(ingested.analysisRequest, 'ingested.analysisRequest');
      const request = Object.freeze({
        schema: INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
        analysisRequest: ingested.analysisRequest,
        requestedProfileId,
        requestedCaseIds: Object.freeze([...requestedCaseIds]),
      });
      const diagnostics = api.diagnose(request, diagnosticsOptions);
      const preparation = api.prepare(diagnostics, preparationOptions);
      return Object.freeze({ diagnostics, preparation });
    },

    authorize: ({ ingested, prepared, context }) => {
      const authorizationInput = typeof approval === 'function'
        ? approval({ ingested, prepared, context })
        : approval;
      return api.authorize(prepared.preparation, authorizationInput);
    },

    solve: ({ ingested, prepared, authorized, context }) => api.solve(
      prepared.preparation,
      authorized,
      {
        requestedCaseIds,
        executeAuthorizedCases: (governed) => executeAuthorizedCases({
          ...governed,
          ingested,
          diagnostics: prepared.diagnostics,
          preparation: prepared.preparation,
          authorization: authorized,
          context,
        }),
      },
    ),

    normalize: ({ ingested, prepared, authorized, solved, context }) => normalize({
      ingested,
      diagnostics: prepared.diagnostics,
      preparation: prepared.preparation,
      authorization: authorized,
      solved,
      context,
    }),

    compare: ({ ingested, prepared, authorized, normalized, reference, context }) => compare({
      ingested,
      diagnostics: prepared.diagnostics,
      preparation: prepared.preparation,
      authorization: authorized,
      normalized,
      reference,
      context,
    }),

    report: ({ ingested, prepared, authorized, normalized, comparison, reference, context, stageLedger }) => report({
      ingested,
      diagnostics: prepared.diagnostics,
      preparation: prepared.preparation,
      authorization: authorized,
      normalized,
      comparison,
      reference,
      context,
      stageLedger,
    }),
  });
}

function stageIdentity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return Object.freeze({ type: typeof value });
  const identity = {};
  for (const key of [
    'schema', 'status', 'semanticHash', 'evidenceHash', 'preparationId',
    'authorizationId', 'modelSemanticHash', 'stiffnessStateHash', 'loadStateHash',
  ]) {
    if (value[key] !== undefined) identity[key] = value[key];
  }
  if (Object.keys(identity).length === 0) identity.type = Array.isArray(value) ? 'array' : 'object';
  return deepFreeze(identity);
}

function requireFunction(value, field) {
  if (typeof value !== 'function') {
    throw new GovernedAnalysisPipelineError(`${field} must be a function.`, 'GOVERNED_ANALYSIS_PIPELINE_FUNCTION_REQUIRED', { field });
  }
}

function requireRecord(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GovernedAnalysisPipelineError(`${field} must be an object.`, 'GOVERNED_ANALYSIS_PIPELINE_RECORD_REQUIRED', { field });
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GovernedAnalysisPipelineError(`${field} must be a non-empty string.`, 'GOVERNED_ANALYSIS_PIPELINE_TEXT_REQUIRED', { field });
  }
}

function requireStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some((row) => typeof row !== 'string' || row.trim() === '')) {
    throw new GovernedAnalysisPipelineError(`${field} must be a non-empty string array.`, 'GOVERNED_ANALYSIS_PIPELINE_CASES_REQUIRED', { field });
  }
}
