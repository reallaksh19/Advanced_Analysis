import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNED_ANALYSIS_PIPELINE_SCHEMA,
  GOVERNED_ANALYSIS_PIPELINE_STAGES,
  GovernedAnalysisPipelineError,
  createGovernedInputXmlPipelineStages,
  runGovernedAnalysisPipeline,
} from '../src/core/linear-piping-analysis-consumer/governed-analysis-pipeline.js';

function fixture({ failAuthorization = false } = {}) {
  const calls = [];
  const prefeaApi = {
    diagnose(request) {
      calls.push('diagnose');
      return Object.freeze({ schema: 'diag/v1', status: 'PASS', semanticHash: 'DIAG', request });
    },
    prepare(diagnostics) {
      calls.push('prepare');
      return Object.freeze({
        schema: 'prep/v1',
        status: 'PASS',
        semanticHash: 'PREP',
        evidenceHash: 'PREP-EVID',
        diagnostics,
      });
    },
    authorize(preparation) {
      calls.push('authorize');
      if (failAuthorization) {
        const error = new Error('authorization rejected');
        error.code = 'PREFEA_AUTHORIZATION_REJECTED_FOR_TEST';
        throw error;
      }
      return Object.freeze({
        schema: 'auth/v1',
        status: 'PASS',
        authorizationId: 'AUTH-1',
        preparationSemanticHash: preparation.semanticHash,
      });
    },
    solve(preparation, authorization, options) {
      calls.push('solve-gateway');
      assert.equal(preparation.semanticHash, 'PREP');
      assert.equal(authorization.authorizationId, 'AUTH-1');
      return options.executeAuthorizedCases({
        preparation,
        authorization,
        requestedCaseIds: options.requestedCaseIds,
        selectedCases: Object.freeze(options.requestedCaseIds.map((caseId) => ({ caseId }))),
      });
    },
  };

  const stages = createGovernedInputXmlPipelineStages({
    ingest: ({ input }) => {
      calls.push('ingest');
      return Object.freeze({
        analysisRequest: Object.freeze({ sourceId: input.sourceId }),
        modelId: input.sourceId,
      });
    },
    requestedProfileId: 'STRICT_INPUTXML_LINEAR_STATIC_V1',
    requestedCaseIds: ['CASE-19', 'CASE-20', 'CASE-21'],
    executeAuthorizedCases: ({ requestedCaseIds }) => {
      calls.push('executor');
      return Object.freeze({ solvedCaseIds: Object.freeze([...requestedCaseIds]) });
    },
    normalize: ({ solved }) => {
      calls.push('normalize');
      return Object.freeze({ caseIds: solved.solvedCaseIds, rows: Object.freeze([]) });
    },
    compare: ({ normalized, reference }) => {
      calls.push('compare');
      return Object.freeze({ caseIds: normalized.caseIds, referenceId: reference.referenceId });
    },
    report: ({ comparison, stageLedger }) => {
      calls.push('report');
      return Object.freeze({
        schema: 'qualification-report/v1',
        comparedCaseIds: comparison.caseIds,
        stageCountAtReportEntry: stageLedger.length,
      });
    },
    prefeaApi,
  });
  return { calls, stages };
}

test('pipeline executes ingestion -> preparation -> authorization -> solve -> normalize -> compare -> report in order', () => {
  const { calls, stages } = fixture();
  const result = runGovernedAnalysisPipeline({
    input: Object.freeze({ sourceId: 'BM4' }),
    reference: Object.freeze({ referenceId: 'PINNED-BM4' }),
    stages,
  });

  assert.equal(result.schema, GOVERNED_ANALYSIS_PIPELINE_SCHEMA);
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.stageLedger.map((row) => row.stage), GOVERNED_ANALYSIS_PIPELINE_STAGES);
  assert.deepEqual(result.stageLedger.map((row) => row.sequence), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(calls, [
    'ingest',
    'diagnose',
    'prepare',
    'authorize',
    'solve-gateway',
    'executor',
    'normalize',
    'compare',
    'report',
  ]);
  assert.deepEqual(result.normalizedResults.caseIds, ['CASE-19', 'CASE-20', 'CASE-21']);
  assert.equal(result.report.stageCountAtReportEntry, 6);
  assert.equal(Object.isFrozen(result), true);
});

test('authorization failure stops before solver runtime creation', () => {
  const { calls, stages } = fixture({ failAuthorization: true });
  assert.throws(
    () => runGovernedAnalysisPipeline({
      input: Object.freeze({ sourceId: 'BM4' }),
      reference: Object.freeze({ referenceId: 'PINNED-BM4' }),
      stages,
    }),
    (error) => {
      assert.equal(error instanceof GovernedAnalysisPipelineError, true);
      assert.equal(error.code, 'GOVERNED_ANALYSIS_PIPELINE_STAGE_FAILED');
      assert.equal(error.data.failedStage, 'AUTHORIZE');
      assert.equal(error.data.causeCode, 'PREFEA_AUTHORIZATION_REJECTED_FOR_TEST');
      return true;
    },
  );
  assert.deepEqual(calls, ['ingest', 'diagnose', 'prepare', 'authorize']);
  assert.equal(calls.includes('solve-gateway'), false);
  assert.equal(calls.includes('executor'), false);
});

test('stage contract is fail-closed when any required stage is absent', () => {
  assert.throws(
    () => runGovernedAnalysisPipeline({
      input: {},
      stages: {
        ingest() {}, prepare() {}, authorize() {}, solve() {}, normalize() {}, compare() {},
      },
    }),
    (error) => error?.code === 'GOVERNED_ANALYSIS_PIPELINE_FUNCTION_REQUIRED',
  );
});
