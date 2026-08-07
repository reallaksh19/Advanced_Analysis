import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  compareAscii,
  normalizeBenchmarkResultRows,
  requireGovernedBenchmarkRecord,
  sealBenchmarkQualificationReport,
} from './qualification-contract.js';
import { compareBenchmarkResultRows } from './qualification-comparison.js';
import { normalizeLinearSolverBenchmarkResult } from './qualification-normalization.js';

/**
 * Model-agnostic benchmark qualification pipeline.
 *
 * Adapter responsibility: parse model/reference source and expose reference rows.
 * Pipeline responsibility: preparation/authorization custody, solve orchestration,
 * solver-result normalization, comparison and deterministic reporting.
 */
export function runGovernedBenchmarkQualification({
  adapter,
  source,
  prepare,
  authorize,
  solve,
  tolerances,
  optionalQuantities = [],
  normalizeSolved = normalizeLinearSolverBenchmarkResult,
}) {
  requireAdapter(adapter);
  requireFunction(prepare, 'prepare');
  requireFunction(authorize, 'authorize');
  requireFunction(solve, 'solve');
  requireFunction(normalizeSolved, 'normalizeSolved');

  const ingested = adapter.ingest(source);
  requireIngestion(ingested, adapter);
  const caseIds = [...adapter.caseIds].map(String).sort(compareAscii);

  const preparation = requireGovernedBenchmarkRecord(prepare({
    benchmarkId: adapter.benchmarkId,
    caseIds: Object.freeze(caseIds),
    modelInput: ingested.modelInput,
    ingestion: ingested,
  }), 'prepare');

  const authorization = requireGovernedBenchmarkRecord(authorize({
    benchmarkId: adapter.benchmarkId,
    caseIds: Object.freeze(caseIds),
    preparation,
    ingestion: ingested,
  }), 'authorize');
  requireAuthorizationCustody(authorization, preparation, caseIds);

  const cases = [];
  for (const caseId of caseIds) {
    const solved = solve({
      benchmarkId: adapter.benchmarkId,
      caseId,
      modelInput: ingested.modelInput,
      preparation,
      authorization,
      ingestion: ingested,
    });
    const actual = normalizeSolved(caseId, solved);
    const referenceRows = normalizeBenchmarkResultRows(
      adapter.referenceRows({ caseId, ingestion: ingested }),
      caseId,
    );
    const comparison = compareBenchmarkResultRows({
      caseId,
      referenceRows,
      actualRows: actual.rows,
      tolerances,
      optionalQuantities,
      exposedQuantities: actual.exposedQuantities,
    });
    cases.push(deepFreeze({
      caseId,
      status: comparison.status,
      executionSemanticHash: actual.executionSemanticHash ?? null,
      executionEvidenceHash: actual.executionEvidenceHash ?? null,
      comparison,
    }));
  }

  const failedCases = cases.filter((row) => row.status === 'FAIL');
  const noComparableCases = cases.filter((row) => row.status === 'NO_COMPARABLE_RESULTS');
  const totals = cases.reduce((acc, row) => {
    for (const key of ['total', 'compared', 'passed', 'failed', 'notExposed', 'notCompared']) {
      acc[key] += row.comparison.counts[key];
    }
    return acc;
  }, { total: 0, compared: 0, passed: 0, failed: 0, notExposed: 0, notCompared: 0 });

  return sealBenchmarkQualificationReport({
    benchmarkId: adapter.benchmarkId,
    adapterId: adapter.adapterId,
    caseIds,
    status: failedCases.length > 0
      ? 'FAIL'
      : noComparableCases.length > 0 ? 'INCOMPLETE' : 'PASS',
    parentAuthority: {
      ingestionSemanticHash: ingested.semanticHash,
      preparationSemanticHash: preparation.semanticHash,
      authorizationSemanticHash: authorization.semanticHash,
    },
    tolerances: normalizeToleranceEvidence(tolerances),
    optionalQuantities: [...new Set(optionalQuantities.map((row) => String(row).toUpperCase()))].sort(compareAscii),
    totals,
    cases,
    reportBasisHash: semanticHash({
      benchmarkId: adapter.benchmarkId,
      adapterId: adapter.adapterId,
      ingestionSemanticHash: ingested.semanticHash,
      preparationSemanticHash: preparation.semanticHash,
      authorizationSemanticHash: authorization.semanticHash,
      caseIds,
    }),
  });
}

function requireAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Benchmark adapter is required.');
  for (const field of ['adapterId', 'benchmarkId']) {
    if (typeof adapter[field] !== 'string' || adapter[field].trim() === '') {
      throw new TypeError(`adapter.${field} is required.`);
    }
  }
  if (!Array.isArray(adapter.caseIds) || adapter.caseIds.length === 0) {
    throw new TypeError('adapter.caseIds must be a non-empty array.');
  }
  requireFunction(adapter.ingest, 'adapter.ingest');
  requireFunction(adapter.referenceRows, 'adapter.referenceRows');
}

function requireIngestion(ingested, adapter) {
  if (!ingested || typeof ingested !== 'object') throw new TypeError('Adapter ingestion must return an object.');
  if (typeof ingested.semanticHash !== 'string' || ingested.semanticHash.trim() === '') {
    throw new TypeError('Adapter ingestion must expose semanticHash.');
  }
  if (!Object.prototype.hasOwnProperty.call(ingested, 'modelInput')) {
    throw new TypeError('Adapter ingestion must expose modelInput.');
  }
  if (ingested.benchmarkId !== adapter.benchmarkId) {
    throw new TypeError('Adapter ingestion benchmark identity mismatch.');
  }
}

function requireAuthorizationCustody(authorization, preparation, caseIds) {
  if (authorization.preparationSemanticHash !== undefined
    && authorization.preparationSemanticHash !== preparation.semanticHash) {
    throw new TypeError('Benchmark authorization is stale or bound to another preparation.');
  }
  if (authorization.authorizedPhysicalCaseIds !== undefined) {
    if (!Array.isArray(authorization.authorizedPhysicalCaseIds)) {
      throw new TypeError('authorization.authorizedPhysicalCaseIds must be an array when supplied.');
    }
    const authorized = new Set(authorization.authorizedPhysicalCaseIds.map(String));
    const unauthorized = caseIds.filter((caseId) => !authorized.has(caseId));
    if (unauthorized.length > 0) {
      throw new TypeError(`Benchmark authorization does not cover cases: ${unauthorized.join(', ')}.`);
    }
  }
  if (authorization.executionBoundary?.authorizationIssued === false) {
    throw new TypeError('Benchmark authorization record explicitly states that authorization was not issued.');
  }
}

function normalizeToleranceEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Benchmark tolerance policy must be an object.');
  }
  return Object.fromEntries(Object.keys(value).sort(compareAscii).map((key) => {
    const row = value[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`Tolerance ${key} must be an object.`);
    }
    return [key, {
      absolute: finiteNonnegative(row.absolute ?? 0, `${key}.absolute`),
      relative: finiteNonnegative(row.relative ?? 0, `${key}.relative`),
      scaleFloor: finiteNonnegative(row.scaleFloor ?? 0, `${key}.scaleFloor`),
    }];
  }));
}

function requireFunction(value, field) {
  if (typeof value !== 'function') throw new TypeError(`${field} must be a function.`);
}

function finiteNonnegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${field} must be finite and nonnegative.`);
  return number;
}
