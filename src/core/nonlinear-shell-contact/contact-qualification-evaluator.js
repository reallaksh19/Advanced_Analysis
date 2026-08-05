import {
  HASH_PATTERN,
  assertArray,
  assertFiniteNumber,
  assertPlainData,
  deepFreeze,
  semanticHash,
} from './contracts.js';
import { REQUIRED_CONTACT_BENCHMARKS, validateContactProcedureContract } from './contact-procedure-contract.js';

const CUSTODY_FIELDS = Object.freeze([
  'solverVersion', 'solverSourceCommit', 'sourceArchiveHash', 'binaryHash', 'containerDigest',
  'compiler', 'compilerFlags', 'linkedLibrariesHash', 'platform', 'threadCount',
]);

export function evaluateContactQualification({
  contract,
  shellQualificationReceipt = null,
  solverCustody = {},
  benchmarkEvidence = [],
}) {
  validateContactProcedureContract(contract);
  assertPlainData(solverCustody, '$solverCustody');
  assertArray(benchmarkEvidence, '$benchmarkEvidence');
  const blockers = [];
  if (!shellQualificationReceipt || shellQualificationReceipt.shellFormulationQualified !== true || !HASH_PATTERN.test(shellQualificationReceipt.receiptHash ?? '')) {
    blockers.push('SHELL_QUALIFICATION_RECEIPT_MISSING_OR_UNQUALIFIED');
  }
  for (const field of CUSTODY_FIELDS) {
    const value = solverCustody[field];
    if (value === null || value === undefined || value === '' || value === 'UNRESOLVED') blockers.push(`SOLVER_CUSTODY_MISSING:${field}`);
  }
  const evidenceById = new Map(benchmarkEvidence.map((entry) => [entry?.id, entry]));
  for (const id of REQUIRED_CONTACT_BENCHMARKS) {
    const evidence = evidenceById.get(id);
    if (!evidence) {
      blockers.push(`BENCHMARK_MISSING:${id}`);
      continue;
    }
    try {
      validateContactEvidence(evidence, contract);
      if (evidence.passed !== true) blockers.push(`BENCHMARK_FAILED:${id}`);
    } catch (error) {
      blockers.push(`BENCHMARK_INVALID:${id}:${error.message}`);
    }
  }
  if (benchmarkEvidence.length !== new Set(benchmarkEvidence.map((entry) => entry?.id)).size) blockers.push('BENCHMARK_DUPLICATE_ID');
  const contactProcedureQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc02-report/v1',
    status: contactProcedureQualified ? 'NC02_QUALIFIED' : 'NC02_BLOCKED',
    contactProcedureHash: contract.contactProcedureHash,
    blockers: [...blockers].sort(),
    authority: {
      nc02ContractQualified: true,
      shellFormulationQualified: shellQualificationReceipt?.shellFormulationQualified === true,
      contactProcedureQualified,
      elasticDentingProcedureQualified: false,
      plasticDentingProcedureQualified: false,
      codeAssessmentQualified: false,
      productionExecutionAuthorized: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

function validateContactEvidence(evidence, contract) {
  assertPlainData(evidence, '$contactEvidence');
  if (!REQUIRED_CONTACT_BENCHMARKS.includes(evidence.id)) throw new TypeError('Unknown contact benchmark.');
  for (const field of ['referenceHash', 'rawEvidenceHash']) if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  assertFiniteNumber(evidence.referenceUncertainty, 'referenceUncertainty', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.acceptanceTolerance, 'acceptanceTolerance', (n) => n > 0, 'positive');
  if (evidence.acceptanceTolerance < evidence.referenceUncertainty) throw new TypeError('Tolerance understates uncertainty.');
  assertFiniteNumber(evidence.penetrationRatio, 'penetrationRatio', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.contactWorkImbalance, 'contactWorkImbalance', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.globalEquilibriumResidual, 'globalEquilibriumResidual', (n) => n >= 0, 'nonnegative');
  if (evidence.penetrationRatio > contract.penetrationLimitRatio) throw new TypeError('Penetration limit exceeded.');
  if (evidence.contactWorkImbalance > contract.contactWorkImbalanceLimit) throw new TypeError('Contact-work imbalance exceeded.');
  if (evidence.globalEquilibriumResidual > contract.globalEquilibriumResidualLimit) throw new TypeError('Equilibrium residual exceeded.');
  if (!Array.isArray(evidence.penaltySweep) || evidence.penaltySweep.length < contract.penaltySensitivityScales.length) throw new TypeError('Penalty sensitivity evidence is incomplete.');
  if (!Array.isArray(evidence.incrementSweep) || evidence.incrementSweep.length < contract.incrementSensitivityScales.length) throw new TypeError('Increment sensitivity evidence is incomplete.');
  if (evidence.id === 'MASTER_SLAVE_REVERSAL') {
    assertFiniteNumber(evidence.reversalDifference, 'reversalDifference', (n) => n >= 0, 'nonnegative');
    if (evidence.reversalDifference > evidence.acceptanceTolerance) throw new TypeError('Master/slave reversal difference exceeds tolerance.');
  }
  if (typeof evidence.passed !== 'boolean') throw new TypeError('Pass disposition is required.');
}
