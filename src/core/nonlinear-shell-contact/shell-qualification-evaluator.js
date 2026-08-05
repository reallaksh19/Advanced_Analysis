import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertGitSha,
  assertHash,
  assertPlainData,
  assertString,
  deepFreeze,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';
import {
  SHELL_BENCHMARK_EVIDENCE_SCHEMA,
  SHELL_QUALIFICATION_REPORT_SCHEMA,
  validateShellFormulationContract,
} from './shell-formulation-contract.js';
import { SHELL_BENCHMARK_CATALOG, SHELL_BENCHMARK_CATALOG_HASH } from './shell-benchmark-catalog.js';

const FORBIDDEN_CALLER_FIELDS = Object.freeze([
  'pass', 'passed', 'status', 'disposition', 'authority', 'qualified', 'shellFormulationQualified', 'nc02Authorized',
]);

export function createSolverBridgeBinding(input) {
  assertPlainData(input, '$solverBridgeBindingInput');
  const payload = {
    schema: 'lafea-nc-solver-bridge-binding/v1',
    phase: 'NC-00',
    status: 'SOLVER_BRIDGE_QUALIFIED',
    exactHeadSha: input.exactHeadSha,
    mergeCommitSha: input.mergeCommitSha,
    workflowRunId: input.workflowRunId,
    artifactId: input.artifactId,
    artifactDigest: input.artifactDigest,
    summaryHash: input.summaryHash,
    authorityRecordHash: input.authorityRecordHash,
    deterministicExecutionHash: input.deterministicExecutionHash,
    validatorIdentity: input.validatorIdentity,
    validatorRevision: input.validatorRevision,
    solverCustodyQualified: input.solverCustodyQualified,
    solverBridgeQualified: input.solverBridgeQualified,
    nc01Authorized: input.nc01Authorized,
  };
  validateSolverBridgeBinding(payload);
  return sealWithHash(payload, 'semanticHash');
}

export function validateSolverBridgeBinding(value) {
  assertExactKeys(value, [
    'schema', 'phase', 'status', 'exactHeadSha', 'mergeCommitSha', 'workflowRunId', 'artifactId',
    'artifactDigest', 'summaryHash', 'authorityRecordHash', 'deterministicExecutionHash',
    'validatorIdentity', 'validatorRevision', 'solverCustodyQualified', 'solverBridgeQualified',
    'nc01Authorized',
  ], '$solverBridgeBinding', ['semanticHash']);
  if (value.schema !== 'lafea-nc-solver-bridge-binding/v1' || value.phase !== 'NC-00' || value.status !== 'SOLVER_BRIDGE_QUALIFIED') {
    throw new TypeError('NC-01 requires a normalized qualified NC-00 solver-bridge binding.');
  }
  assertGitSha(value.exactHeadSha, '$solverBridgeBinding.exactHeadSha');
  assertGitSha(value.mergeCommitSha, '$solverBridgeBinding.mergeCommitSha');
  assertString(value.workflowRunId, '$solverBridgeBinding.workflowRunId');
  assertString(value.artifactId, '$solverBridgeBinding.artifactId');
  assertHash(value.artifactDigest, '$solverBridgeBinding.artifactDigest');
  assertHash(value.summaryHash, '$solverBridgeBinding.summaryHash');
  assertHash(value.authorityRecordHash, '$solverBridgeBinding.authorityRecordHash');
  assertHash(value.deterministicExecutionHash, '$solverBridgeBinding.deterministicExecutionHash');
  assertString(value.validatorIdentity, '$solverBridgeBinding.validatorIdentity');
  assertGitSha(value.validatorRevision, '$solverBridgeBinding.validatorRevision');
  if (value.solverCustodyQualified !== true || value.solverBridgeQualified !== true || value.nc01Authorized !== true) {
    throw new TypeError('NC-00 authority does not authorize NC-01.');
  }
  if (value.semanticHash) verifySealedHash(value, 'semanticHash', '$solverBridgeBinding');
  return true;
}

export function createShellBenchmarkEvidence(input) {
  rejectCallerAuthority(input, '$benchmarkEvidenceInput');
  const payload = {
    schema: SHELL_BENCHMARK_EVIDENCE_SCHEMA,
    id: input.id,
    exactHeadSha: input.exactHeadSha,
    source: input.source,
    recovery: input.recovery,
    rawEvidenceHash: input.rawEvidenceHash,
    referenceHash: input.referenceHash,
    oracleHash: input.oracleHash,
    meshHash: input.meshHash,
    referenceUncertainty: input.referenceUncertainty,
    acceptanceTolerance: input.acceptanceTolerance,
    observedError: input.observedError,
    equilibriumResidual: input.equilibriumResidual,
    energyResidual: input.energyResidual,
    hourglassEnergyRatio: input.hourglassEnergyRatio,
    transverseShearEnergyRatio: input.transverseShearEnergyRatio,
    meshLevels: input.meshLevels,
    mutation: input.mutation,
  };
  validateShellBenchmarkEvidence(payload);
  return sealWithHash(payload, 'semanticHash');
}

export function validateShellBenchmarkEvidence(value, catalogEntry, expectedHeadSha) {
  assertPlainData(value, '$benchmarkEvidence');
  rejectCallerAuthority(value, '$benchmarkEvidence');
  assertExactKeys(value, [
    'schema', 'id', 'exactHeadSha', 'source', 'recovery', 'rawEvidenceHash', 'referenceHash',
    'oracleHash', 'meshHash', 'referenceUncertainty', 'acceptanceTolerance', 'observedError',
    'equilibriumResidual', 'energyResidual', 'hourglassEnergyRatio', 'transverseShearEnergyRatio',
    'meshLevels', 'mutation',
  ], '$benchmarkEvidence', ['semanticHash']);
  assertEnum(value.schema, [SHELL_BENCHMARK_EVIDENCE_SCHEMA], '$benchmarkEvidence.schema');
  assertString(value.id, '$benchmarkEvidence.id');
  assertGitSha(value.exactHeadSha, '$benchmarkEvidence.exactHeadSha');
  if (expectedHeadSha && value.exactHeadSha !== expectedHeadSha) throw new TypeError('Benchmark evidence is stale for the candidate head.');
  assertEnum(value.source, ['EXTERNAL_SOLVER_EXECUTION'], '$benchmarkEvidence.source');
  assertEnum(value.recovery, ['FIXED_PHYSICAL_COORDINATE_SECTION_INTEGRATION_POINT'], '$benchmarkEvidence.recovery');
  ['rawEvidenceHash', 'referenceHash', 'oracleHash', 'meshHash'].forEach((field) => assertHash(value[field], `$benchmarkEvidence.${field}`));
  assertFiniteNumber(value.referenceUncertainty, '$benchmarkEvidence.referenceUncertainty', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(value.acceptanceTolerance, '$benchmarkEvidence.acceptanceTolerance', (n) => n > 0, 'positive');
  assertFiniteNumber(value.observedError, '$benchmarkEvidence.observedError', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(value.equilibriumResidual, '$benchmarkEvidence.equilibriumResidual', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(value.energyResidual, '$benchmarkEvidence.energyResidual', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(value.hourglassEnergyRatio, '$benchmarkEvidence.hourglassEnergyRatio', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(value.transverseShearEnergyRatio, '$benchmarkEvidence.transverseShearEnergyRatio', (n) => n >= 0, 'nonnegative');
  if (value.acceptanceTolerance < value.referenceUncertainty) throw new TypeError('Acceptance tolerance understates reference uncertainty.');
  assertArray(value.meshLevels, '$benchmarkEvidence.meshLevels', { min: catalogEntry?.minimumMeshLevels ?? 4 });
  let previousGlobal = Infinity;
  let previousProbe = Infinity;
  for (const [index, row] of value.meshLevels.entries()) {
    assertExactKeys(row, ['globalH', 'probeLocalH', 'quantity'], `$benchmarkEvidence.meshLevels[${index}]`);
    assertFiniteNumber(row.globalH, `meshLevels[${index}].globalH`, (n) => n > 0, 'positive');
    assertFiniteNumber(row.probeLocalH, `meshLevels[${index}].probeLocalH`, (n) => n > 0, 'positive');
    assertFiniteNumber(row.quantity, `meshLevels[${index}].quantity`);
    if (!(row.globalH < previousGlobal) || !(row.probeLocalH < previousProbe)) throw new TypeError('Mesh levels must strictly refine physical global and probe-local h.');
    previousGlobal = row.globalH;
    previousProbe = row.probeLocalH;
  }
  assertExactKeys(value.mutation, ['id', 'baselineError', 'mutatedError'], '$benchmarkEvidence.mutation');
  assertString(value.mutation.id, '$benchmarkEvidence.mutation.id');
  assertFiniteNumber(value.mutation.baselineError, '$benchmarkEvidence.mutation.baselineError', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(value.mutation.mutatedError, '$benchmarkEvidence.mutation.mutatedError', (n) => n >= 0, 'nonnegative');
  if (catalogEntry && (value.id !== catalogEntry.id || value.mutation.id !== catalogEntry.requiredMutation)) {
    throw new TypeError('Benchmark or required negative-mutation identity mismatch.');
  }
  if (value.semanticHash) verifySealedHash(value, 'semanticHash', '$benchmarkEvidence');
  return true;
}

export function evaluateShellQualification({ contract, upstreamReceipt, candidateExactHeadSha, benchmarkEvidence = [] }) {
  validateShellFormulationContract(contract);
  assertGitSha(candidateExactHeadSha, '$candidateExactHeadSha');
  const blockers = [];
  try {
    validateSolverBridgeBinding(upstreamReceipt);
  } catch (error) {
    blockers.push(`UPSTREAM_RECEIPT_INVALID:${error.message}`);
  }
  assertArray(benchmarkEvidence, '$benchmarkEvidence');
  const evidenceById = new Map();
  for (const entry of benchmarkEvidence) {
    if (evidenceById.has(entry?.id)) blockers.push(`BENCHMARK_DUPLICATE:${entry?.id ?? 'UNKNOWN'}`);
    evidenceById.set(entry?.id, entry);
  }
  for (const catalogEntry of SHELL_BENCHMARK_CATALOG) {
    const evidence = evidenceById.get(catalogEntry.id);
    if (!evidence) {
      blockers.push(`BENCHMARK_MISSING:${catalogEntry.id}`);
      continue;
    }
    try {
      validateShellBenchmarkEvidence(evidence, catalogEntry, candidateExactHeadSha);
      if (evidence.observedError > evidence.acceptanceTolerance) blockers.push(`ERROR_EXCEEDS_TOLERANCE:${catalogEntry.id}`);
      if (evidence.equilibriumResidual > 1e-5) blockers.push(`EQUILIBRIUM_RESIDUAL:${catalogEntry.id}`);
      if (evidence.energyResidual > 1e-3) blockers.push(`ENERGY_RESIDUAL:${catalogEntry.id}`);
      if (evidence.hourglassEnergyRatio > contract.integrationControls.hourglassEnergyRatioLimit) blockers.push(`HOURGLASS_ENERGY:${catalogEntry.id}`);
      if (evidence.transverseShearEnergyRatio > contract.integrationControls.transverseShearEnergyRatioLimit) blockers.push(`TRANSVERSE_SHEAR_ENERGY:${catalogEntry.id}`);
      if (evidence.mutation.baselineError > evidence.acceptanceTolerance || evidence.mutation.mutatedError <= evidence.acceptanceTolerance) blockers.push(`NEGATIVE_MUTATION_NOT_DETECTED:${catalogEntry.id}`);
    } catch (error) {
      blockers.push(`BENCHMARK_INVALID:${catalogEntry.id}:${error.message}`);
    }
  }
  for (const id of evidenceById.keys()) if (!SHELL_BENCHMARK_CATALOG.some((entry) => entry.id === id)) blockers.push(`BENCHMARK_UNREGISTERED:${id}`);
  const qualified = blockers.length === 0;
  const payload = {
    schema: SHELL_QUALIFICATION_REPORT_SCHEMA,
    status: qualified ? 'NC01_QUALIFIED' : 'NC01_BLOCKED',
    candidateExactHeadSha,
    shellFormulationHash: contract.shellFormulationHash,
    benchmarkCatalogHash: SHELL_BENCHMARK_CATALOG_HASH,
    upstreamReceiptSemanticHash: upstreamReceipt?.semanticHash ?? null,
    evaluatedBenchmarkCount: benchmarkEvidence.length,
    blockers: [...blockers].sort(),
    authority: {
      nc01ContractQualified: true,
      shellFormulationQualified: qualified,
      nc02Authorized: qualified,
      contactProcedureQualified: false,
      elasticDentingProcedureQualified: false,
      plasticMaterialQualified: false,
      plasticDentingProcedureQualified: false,
      codeAssessmentQualified: false,
      moduleQualified: false,
      productionExecutionAuthorized: false,
      automaticAssetAcceptanceAuthorized: false,
      autonomousCaseDispositionAuthorized: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
    },
  };
  return deepFreeze(sealWithHash(payload, 'reportSemanticHash'));
}

function rejectCallerAuthority(value, path) {
  if (!value || typeof value !== 'object') return;
  const forbidden = FORBIDDEN_CALLER_FIELDS.filter((field) => Object.hasOwn(value, field));
  if (forbidden.length) throw new TypeError(`${path} contains caller-controlled disposition fields: ${forbidden.join(', ')}.`);
}
