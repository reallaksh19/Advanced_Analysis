import { HASH_PATTERN, assertArray, assertFiniteNumber, assertPlainData, assertString, deepFreeze, semanticHash } from './contracts.js';
import { REQUIRED_ELASTIC_DENTING_BENCHMARKS, validateElasticDentingProcedureContract } from './elastic-denting-procedure-contract.js';

const CUSTODY_FIELDS = Object.freeze(['solverVersion','solverSourceCommit','sourceArchiveHash','binaryHash','containerDigest','compiler','compilerFlags','linkedLibrariesHash','platform','threadCount']);
const CELL_DIMENSIONS = Object.freeze(['DOverT','indenterWidthOverD','indenterRadiusOverD','lengthOverD','pressureElasticRatio','boundaryDistanceOverSqrtRt']);

export function evaluateElasticDentingQualification({ contract, contactQualificationReceipt = null, solverCustody = {}, dimensionlessCellRegistry = [], benchmarkEvidence = [] }) {
  validateElasticDentingProcedureContract(contract);
  assertPlainData(solverCustody, '$solverCustody');
  assertArray(dimensionlessCellRegistry, '$dimensionlessCellRegistry');
  assertArray(benchmarkEvidence, '$benchmarkEvidence');
  const blockers = [];
  if (!contactQualificationReceipt || contactQualificationReceipt.contactProcedureQualified !== true || !HASH_PATTERN.test(contactQualificationReceipt.receiptHash ?? '')) blockers.push('CONTACT_QUALIFICATION_RECEIPT_MISSING_OR_UNQUALIFIED');
  for (const field of CUSTODY_FIELDS) { const value=solverCustody[field]; if (value===null||value===undefined||value===''||value==='UNRESOLVED') blockers.push(`SOLVER_CUSTODY_MISSING:${field}`); }
  const validCells = new Map();
  for (const cell of dimensionlessCellRegistry) {
    try { validateDimensionlessCell(cell); if (validCells.has(cell.id)) blockers.push(`CELL_DUPLICATE_ID:${cell.id}`); else validCells.set(cell.id, cell); }
    catch (error) { blockers.push(`CELL_INVALID:${cell?.id ?? 'UNKNOWN'}:${error.message}`); }
  }
  if (validCells.size === 0) blockers.push('DIMENSIONLESS_CELL_REGISTRY_EMPTY');
  const evidenceKeys = new Set();
  for (const evidence of benchmarkEvidence) {
    const key = `${evidence?.cellId}:${evidence?.id}`;
    if (evidenceKeys.has(key)) blockers.push(`BENCHMARK_DUPLICATE:${key}`);
    evidenceKeys.add(key);
  }
  for (const cell of validCells.values()) {
    for (const id of REQUIRED_ELASTIC_DENTING_BENCHMARKS) {
      const evidence = benchmarkEvidence.find((entry) => entry?.cellId === cell.id && entry?.id === id);
      if (!evidence) { blockers.push(`BENCHMARK_MISSING:${cell.id}:${id}`); continue; }
      try { validateElasticDentingEvidence(evidence, contract, validCells); if (evidence.passed !== true) blockers.push(`BENCHMARK_FAILED:${cell.id}:${id}`); }
      catch (error) { blockers.push(`BENCHMARK_INVALID:${cell.id}:${id}:${error.message}`); }
    }
  }
  for (const evidence of benchmarkEvidence) if (!validCells.has(evidence?.cellId)) blockers.push(`BENCHMARK_UNKNOWN_CELL:${evidence?.cellId ?? 'UNKNOWN'}`);
  const elasticDentingProcedureQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc03-report/v1',
    status: elasticDentingProcedureQualified ? 'NC03_QUALIFIED' : 'NC03_BLOCKED',
    elasticDentingProcedureHash: contract.elasticDentingProcedureHash,
    registeredCellCount: validCells.size,
    blockers: [...blockers].sort(),
    authority: {
      nc03ContractQualified: true,
      contactProcedureQualified: contactQualificationReceipt?.contactProcedureQualified === true,
      elasticDentingProcedureQualified,
      plasticMaterialQualified: false,
      plasticDentingProcedureQualified: false,
      codeAssessmentQualified: false,
      productionExecutionAuthorized: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

export function validateDimensionlessCell(cell) {
  assertPlainData(cell, '$dimensionlessCell');
  assertString(cell.id, '$dimensionlessCell.id');
  if (!HASH_PATTERN.test(cell.cellHash ?? '') || !HASH_PATTERN.test(cell.boundsEvidenceHash ?? '')) throw new TypeError('Cell and bounds evidence hashes are required.');
  if (cell.validated !== true) throw new TypeError('Cell must be validated.');
  assertPlainData(cell.bounds, '$dimensionlessCell.bounds');
  for (const dimension of CELL_DIMENSIONS) {
    const range = cell.bounds[dimension];
    if (!Array.isArray(range) || range.length !== 2) throw new TypeError(`Missing two-value range: ${dimension}.`);
    range.forEach((value,index)=>assertFiniteNumber(value,`$dimensionlessCell.bounds.${dimension}[${index}]`,(n)=>n>=0,'nonnegative'));
    if (range[1] < range[0]) throw new TypeError(`Invalid range order: ${dimension}.`);
  }
  return true;
}

function validateElasticDentingEvidence(evidence, contract, cells) {
  assertPlainData(evidence, '$elasticDentingEvidence');
  if (!REQUIRED_ELASTIC_DENTING_BENCHMARKS.includes(evidence.id)) throw new TypeError('Unknown elastic denting benchmark.');
  if (!cells.has(evidence.cellId)) throw new TypeError('Evidence references an unregistered cell.');
  for (const field of ['referenceHash','rawEvidenceHash']) if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  assertFiniteNumber(evidence.referenceUncertainty,'referenceUncertainty',(n)=>n>=0,'nonnegative');
  assertFiniteNumber(evidence.acceptanceTolerance,'acceptanceTolerance',(n)=>n>0,'positive');
  if (evidence.acceptanceTolerance < evidence.referenceUncertainty) throw new TypeError('Tolerance understates uncertainty.');
  assertFiniteNumber(evidence.observedDifference,'observedDifference',(n)=>n>=0,'nonnegative');
  if (evidence.observedDifference > evidence.acceptanceTolerance) throw new TypeError('Observed difference exceeds tolerance.');
  for (const [field, limit] of [['elasticRecoveryResidualRatio',contract.elasticRecoveryResidualLimitRatio],['globalEquilibriumResidual',contract.globalEquilibriumResidualLimit],['energyImbalance',contract.energyImbalanceLimit],['boundarySensitivity',contract.boundarySensitivityLimit],['meshSensitivity',contract.meshSensitivityLimit],['incrementSensitivity',contract.incrementSensitivityLimit]]) {
    assertFiniteNumber(evidence[field], field, (n)=>n>=0, 'nonnegative'); if (evidence[field] > limit) throw new TypeError(`${field} exceeds the contract limit.`);
  }
  validateSweep(evidence.boundarySweep, contract.boundaryExtensionScales.length, 'boundarySweep');
  validateSweep(evidence.meshSweep, contract.meshRefinementRatios.length, 'meshSweep');
  validateSweep(evidence.incrementSweep, contract.incrementRefinementRatios.length, 'incrementSweep');
  if (typeof evidence.passed !== 'boolean') throw new TypeError('Pass disposition is required.');
}
function validateSweep(value, minimum, path) { if (!Array.isArray(value) || value.length < minimum) throw new TypeError(`${path} is incomplete.`); value.forEach((entry,index)=>assertFiniteNumber(entry.value,`${path}[${index}].value`)); }
