import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BM4_QUALIFICATION_CASE_IDS,
  compareBenchmarkResultRows,
  createBenchmarkQualificationAdapter,
  createBm4QualificationAdapter,
  runGovernedBenchmarkQualification,
} from '../src/core/fea-benchmarks/index.js';

const tolerances = Object.freeze({
  DISPLACEMENT: Object.freeze({ absolute: 1e-9, relative: 1e-6, scaleFloor: 1e-9 }),
  FORCE: Object.freeze({ absolute: 1, relative: 1e-6, scaleFloor: 1 }),
  STRESS: Object.freeze({ absolute: 1, relative: 1e-6, scaleFloor: 1 }),
});

function bm4Source() {
  return {
    modelInput: { semanticHash: 'BM4-MODEL' },
    references: {
      CASE21: {
        nodes: [{ nodeId: '20', displacements: { DY: -0.002 }, forces: { FY: -250 } }],
        elements: [{ elementId: 'E20', stresses: { CODE: 21e6 } }],
      },
      CASE19: {
        nodes: [{ nodeId: '10', displacements: { DX: 0.001 }, forces: { FY: 100 } }],
        elements: [{ elementId: 'E10', stresses: { CODE: 19e6 } }],
      },
    },
  };
}

function execution(caseId) {
  if (caseId === 'CASE19') {
    return {
      semanticHash: 'EXEC-19', evidenceHash: 'EVID-19',
      displacement: [{ nodeId: '10', dof: 'UX', value: 0.001 }],
      reactions: [{ nodeId: '10', dof: 'UY', value: 100 }],
    };
  }
  return {
    semanticHash: 'EXEC-21', evidenceHash: 'EVID-21',
    displacement: [{ nodeId: '20', dof: 'UY', value: -0.002 }],
    reactions: [{ nodeId: '20', dof: 'UY', value: -250 }],
  };
}

test('BM4 adapter fixes qualification scope to CASE19 and CASE21', () => {
  assert.deepEqual(BM4_QUALIFICATION_CASE_IDS, ['CASE19', 'CASE21']);
  const adapter = createBm4QualificationAdapter({ parseModel: (source) => source });
  const ingested = adapter.ingest(bm4Source());
  assert.deepEqual(ingested.caseIds, ['CASE19', 'CASE21']);
  assert.throws(() => adapter.referenceRows({ caseId: 'CASE20', ingestion: ingested }), /CASE19 or CASE21/u);
});

test('governed BM4 qualification compares node results and reports unavailable stress honestly', () => {
  const ledger = [];
  const adapter = createBm4QualificationAdapter({ parseModel: (source) => source });
  const report = runGovernedBenchmarkQualification({
    adapter,
    source: bm4Source(),
    tolerances,
    optionalQuantities: ['STRESS'],
    prepare: ({ caseIds }) => {
      ledger.push(`PREPARE:${caseIds.join(',')}`);
      return { semanticHash: 'PREP-BM4' };
    },
    authorize: ({ preparation, caseIds }) => {
      ledger.push(`AUTHORIZE:${preparation.semanticHash}`);
      return {
        semanticHash: 'AUTH-BM4',
        preparationSemanticHash: preparation.semanticHash,
        authorizedPhysicalCaseIds: caseIds,
        executionBoundary: { authorizationIssued: true },
      };
    },
    solve: ({ caseId, authorization }) => {
      ledger.push(`SOLVE:${caseId}:${authorization.semanticHash}`);
      return execution(caseId);
    },
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.compared, 4);
  assert.equal(report.totals.notExposed, 2);
  assert.equal(report.parentAuthority.preparationSemanticHash, 'PREP-BM4');
  assert.equal(report.parentAuthority.authorizationSemanticHash, 'AUTH-BM4');
  assert.deepEqual(ledger, [
    'PREPARE:CASE19,CASE21',
    'AUTHORIZE:PREP-BM4',
    'SOLVE:CASE19:AUTH-BM4',
    'SOLVE:CASE21:AUTH-BM4',
  ]);
  const force = report.cases[0].comparison.rows.find((row) => row.quantity === 'FORCE');
  assert.equal(force.referenceValue, 100);
  assert.equal(force.actualValue, 100, 'support-on-pipe reaction convention must not be sign-flipped');
});

test('stale benchmark authorization blocks before solve', () => {
  let solved = false;
  const adapter = createBm4QualificationAdapter({ parseModel: (source) => source });
  assert.throws(() => runGovernedBenchmarkQualification({
    adapter,
    source: bm4Source(),
    tolerances,
    optionalQuantities: ['STRESS'],
    prepare: () => ({ semanticHash: 'PREP-CURRENT' }),
    authorize: () => ({
      semanticHash: 'AUTH-STALE',
      preparationSemanticHash: 'PREP-OLD',
      authorizedPhysicalCaseIds: ['CASE19', 'CASE21'],
    }),
    solve: () => { solved = true; return execution('CASE19'); },
  }), /stale or bound to another preparation/u);
  assert.equal(solved, false);
});

test('authorization missing a requested benchmark case blocks before solve', () => {
  let solved = false;
  const adapter = createBm4QualificationAdapter({ parseModel: (source) => source });
  assert.throws(() => runGovernedBenchmarkQualification({
    adapter,
    source: bm4Source(),
    tolerances,
    optionalQuantities: ['STRESS'],
    prepare: () => ({ semanticHash: 'PREP-CURRENT' }),
    authorize: () => ({
      semanticHash: 'AUTH-PARTIAL',
      preparationSemanticHash: 'PREP-CURRENT',
      authorizedPhysicalCaseIds: ['CASE19'],
    }),
    solve: () => { solved = true; return execution('CASE19'); },
  }), /does not cover cases: CASE21/u);
  assert.equal(solved, false);
});

test('required missing force fails while optional unexposed stress does not', () => {
  const result = compareBenchmarkResultRows({
    caseId: 'CASE19',
    referenceRows: [
      { entityKind: 'NODE', entityId: '10', quantity: 'FORCE', component: 'UY', value: 100, unit: 'N' },
      { entityKind: 'ELEMENT', entityId: 'E10', quantity: 'STRESS', component: 'CODE', value: 10, unit: 'Pa', required: false },
    ],
    actualRows: [],
    tolerances,
    optionalQuantities: ['STRESS'],
    exposedQuantities: [],
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.rows.find((row) => row.quantity === 'FORCE').status, 'FAIL');
  assert.equal(result.rows.find((row) => row.quantity === 'STRESS').status, 'NOT_EXPOSED');
});

test('unit mismatches fail instead of silently converting benchmark evidence', () => {
  const result = compareBenchmarkResultRows({
    caseId: 'FUTURE-BM',
    referenceRows: [{ entityKind: 'NODE', entityId: '1', quantity: 'DISPLACEMENT', component: 'UX', value: 1, unit: 'mm' }],
    actualRows: [{ entityKind: 'NODE', entityId: '1', quantity: 'DISPLACEMENT', component: 'UX', value: 0.001, unit: 'm' }],
    tolerances,
    exposedQuantities: ['DISPLACEMENT'],
  });
  assert.equal(result.status, 'FAIL');
  assert.match(result.rows[0].note, /Unit mismatch/u);
});

test('generic adapter factory qualifies a future benchmark without shared-pipeline branching', () => {
  const adapter = createBenchmarkQualificationAdapter({
    adapterId: 'BM5-TEST',
    benchmarkId: 'BM5',
    caseIds: ['C1'],
    parseModel: () => ({ semanticHash: 'BM5-MODEL' }),
    parseReference: () => ({
      C1: [{ entityKind: 'NODE', entityId: 'N1', quantity: 'FORCE', component: 'UX', value: 5, unit: 'N' }],
    }),
  });
  const report = runGovernedBenchmarkQualification({
    adapter,
    source: {},
    tolerances,
    prepare: () => ({ semanticHash: 'PREP-BM5' }),
    authorize: ({ preparation, caseIds }) => ({
      semanticHash: 'AUTH-BM5',
      preparationSemanticHash: preparation.semanticHash,
      authorizedPhysicalCaseIds: caseIds,
    }),
    solve: () => ({
      semanticHash: 'EXEC-BM5', evidenceHash: 'EVID-BM5', displacement: [],
      reactions: [{ nodeId: 'N1', dof: 'UX', value: 5 }],
    }),
  });
  assert.equal(report.benchmarkId, 'BM5');
  assert.equal(report.status, 'PASS');
});
