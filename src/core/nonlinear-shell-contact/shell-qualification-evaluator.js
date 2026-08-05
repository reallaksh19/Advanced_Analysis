import {
  HASH_PATTERN,
  assertArray,
  assertFiniteNumber,
  assertPlainData,
  deepFreeze,
  semanticHash,
} from './contracts.js';
import { validateShellFormulationContract } from './shell-formulation-contract.js';
import { SHELL_BENCHMARK_CATALOG, SHELL_BENCHMARK_CATALOG_HASH } from './shell-benchmark-catalog.js';

const CUSTODY_FIELDS = Object.freeze([
  'solverVersion', 'solverSourceCommit', 'sourceArchiveHash', 'binaryHash', 'containerDigest',
  'compiler', 'compilerFlags', 'linkedLibrariesHash', 'platform', 'threadCount',
]);

export function evaluateShellQualification({ contract, solverCustody = {}, benchmarkEvidence = [] }) {
  validateShellFormulationContract(contract);
  assertPlainData(solverCustody, '$solverCustody');
  assertArray(benchmarkEvidence, '$benchmarkEvidence');
  const blockers = [];
  for (const field of CUSTODY_FIELDS) {
    const value = solverCustody[field];
    if (value === null || value === undefined || value === '' || value === 'UNRESOLVED') blockers.push(`SOLVER_CUSTODY_MISSING:${field}`);
  }
  const evidenceById = new Map(benchmarkEvidence.map((entry) => [entry?.id, entry]));
  for (const benchmark of SHELL_BENCHMARK_CATALOG) {
    const evidence = evidenceById.get(benchmark.id);
    if (!evidence) {
      blockers.push(`BENCHMARK_MISSING:${benchmark.id}`);
      continue;
    }
    try {
      validateBenchmarkEvidence(evidence, benchmark);
      if (evidence.passed !== true) blockers.push(`BENCHMARK_FAILED:${benchmark.id}`);
    } catch (error) {
      blockers.push(`BENCHMARK_INVALID:${benchmark.id}:${error.message}`);
    }
  }
  const duplicateIds = benchmarkEvidence.length !== new Set(benchmarkEvidence.map((entry) => entry?.id)).size;
  if (duplicateIds) blockers.push('BENCHMARK_DUPLICATE_ID');
  const shellFormulationQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc01-report/v1',
    status: shellFormulationQualified ? 'NC01_QUALIFIED' : 'NC01_BLOCKED',
    shellFormulationHash: contract.shellFormulationHash,
    benchmarkCatalogHash: SHELL_BENCHMARK_CATALOG_HASH,
    evaluatedBenchmarkCount: benchmarkEvidence.length,
    blockers: [...blockers].sort(),
    authority: {
      nc01ContractQualified: true,
      solverBridgeQualified: false,
      shellFormulationQualified,
      nc02Authorized: shellFormulationQualified,
      contactProcedureQualified: false,
      elasticDentingProcedureQualified: false,
      productionExecutionAuthorized: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

function validateBenchmarkEvidence(evidence, benchmark) {
  assertPlainData(evidence, `$benchmarkEvidence.${benchmark.id}`);
  if (evidence.id !== benchmark.id) throw new TypeError('Evidence identity mismatch.');
  if (!HASH_PATTERN.test(evidence.referenceHash ?? '')) throw new TypeError('Reference hash is required.');
  if (!HASH_PATTERN.test(evidence.rawEvidenceHash ?? '')) throw new TypeError('Raw evidence hash is required.');
  assertFiniteNumber(evidence.referenceUncertainty, 'referenceUncertainty', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.acceptanceTolerance, 'acceptanceTolerance', (n) => n > 0, 'positive');
  assertFiniteNumber(evidence.observedError, 'observedError', (n) => n >= 0, 'nonnegative');
  if (evidence.acceptanceTolerance < evidence.referenceUncertainty) throw new TypeError('Tolerance cannot understate reference uncertainty.');
  if (!Array.isArray(evidence.meshLevels) || evidence.meshLevels.length < benchmark.minimumMeshLevels) throw new TypeError('Insufficient mesh ladder.');
  for (const row of evidence.meshLevels) {
    assertFiniteNumber(row.characteristicSize, 'characteristicSize', (n) => n > 0, 'positive');
    assertFiniteNumber(row.quantity, 'quantity');
  }
  if (evidence.observedError > evidence.acceptanceTolerance) throw new TypeError('Observed error exceeds tolerance.');
  if (typeof evidence.passed !== 'boolean') throw new TypeError('Pass disposition is required.');
}
