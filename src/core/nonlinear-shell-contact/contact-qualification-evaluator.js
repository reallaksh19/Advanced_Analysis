import {
  GIT_SHA_PATTERN,
  HASH_PATTERN,
  assertArray,
  assertExactKeys,
  assertFiniteNumber,
  assertPlainData,
  deepFreeze,
  semanticHash,
  verifySealedHash,
} from './contracts.js';
import { REQUIRED_CONTACT_BENCHMARKS, validateContactProcedureContract } from './contact-procedure-contract.js';

const EVIDENCE_SCHEMA = 'nonlinear-shell-contact-contact-benchmark-evidence/v2';
const FORBIDDEN_CALLER_FIELDS = Object.freeze(['passed','authority','status','disposition','qualified']);

export function createNc01QualificationBinding(input) {
  const payload = {
    schema: 'nonlinear-shell-contact-nc01-upstream-binding/v1',
    phase: 'NC-01',
    exactHeadSha: input.exactHeadSha,
    mergeCommitSha: input.mergeCommitSha,
    workflowRunId: String(input.workflowRunId),
    artifactId: String(input.artifactId),
    artifactDigest: input.artifactDigest,
    reportSemanticHash: input.reportSemanticHash,
    runSemanticHash: input.runSemanticHash,
    rawArtifactHash: input.rawArtifactHash,
    validatorIdentity: input.validatorIdentity,
    validatorRevision: input.validatorRevision,
    shellFormulationQualified: input.shellFormulationQualified,
    nc02Authorized: input.nc02Authorized,
  };
  validateNc01QualificationBinding(payload, { requireHash: false });
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function validateNc01QualificationBinding(value, { requireHash = true } = {}) {
  assertPlainData(value, '$nc01Binding');
  assertExactKeys(value, [
    'schema','phase','exactHeadSha','mergeCommitSha','workflowRunId','artifactId',
    'artifactDigest','reportSemanticHash','runSemanticHash','rawArtifactHash',
    'validatorIdentity','validatorRevision','shellFormulationQualified','nc02Authorized',
  ], '$nc01Binding', ['semanticHash']);
  if (value.schema !== 'nonlinear-shell-contact-nc01-upstream-binding/v1' || value.phase !== 'NC-01') throw new TypeError('Wrong NC-01 binding schema or phase.');
  for (const field of ['exactHeadSha','mergeCommitSha','validatorRevision']) if (!GIT_SHA_PATTERN.test(value[field] ?? '')) throw new TypeError(`${field} must be an exact Git SHA.`);
  for (const field of ['artifactDigest','reportSemanticHash','runSemanticHash','rawArtifactHash']) if (!HASH_PATTERN.test(value[field] ?? '')) throw new TypeError(`${field} must be a governed hash.`);
  if (!/^\d+$/u.test(value.workflowRunId) || !/^\d+$/u.test(value.artifactId)) throw new TypeError('Workflow and artifact IDs must be decimal identities.');
  if (typeof value.validatorIdentity !== 'string' || value.validatorIdentity.length === 0) throw new TypeError('Validator identity is required.');
  if (value.shellFormulationQualified !== true || value.nc02Authorized !== true) throw new TypeError('NC-01 does not authorize NC-02.');
  if (requireHash) verifySealedHash(value, 'semanticHash', '$nc01Binding');
  return true;
}

export function evaluateContactQualification({ contract, upstreamBinding, candidateExactHeadSha, benchmarkEvidence }) {
  validateContactProcedureContract(contract);
  validateNc01QualificationBinding(upstreamBinding);
  if (!GIT_SHA_PATTERN.test(candidateExactHeadSha ?? '')) throw new TypeError('Candidate exact head is required.');
  assertArray(benchmarkEvidence, '$benchmarkEvidence');
  const blockers = [];
  const ids = benchmarkEvidence.map((entry) => entry?.id);
  if (ids.length !== new Set(ids).size) blockers.push('BENCHMARK_DUPLICATE_ID');
  const byId = new Map(benchmarkEvidence.map((entry) => [entry?.id, entry]));
  for (const id of REQUIRED_CONTACT_BENCHMARKS) {
    const evidence = byId.get(id);
    if (!evidence) { blockers.push(`BENCHMARK_MISSING:${id}`); continue; }
    try {
      const derived = validateContactEvidence(evidence, contract, candidateExactHeadSha);
      blockers.push(...derived.map((reason) => `${reason}:${id}`));
    } catch (error) {
      blockers.push(`BENCHMARK_INVALID:${id}:${error.message}`);
    }
  }
  for (const id of ids) if (id && !REQUIRED_CONTACT_BENCHMARKS.includes(id)) blockers.push(`BENCHMARK_UNKNOWN:${id}`);
  const qualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc02-report/v2',
    status: qualified ? 'NC02_QUALIFIED' : 'NC02_BLOCKED',
    candidateExactHeadSha,
    contactProcedureHash: contract.contactProcedureHash,
    upstreamReceiptSemanticHash: upstreamBinding.semanticHash,
    evaluatedBenchmarkCount: benchmarkEvidence.length,
    blockers: [...blockers].sort(),
    authority: {
      nc02ContractQualified: true,
      shellFormulationQualified: true,
      contactProcedureQualified: qualified,
      nc03Authorized: qualified,
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
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

export function validateContactEvidence(evidence, contract, candidateExactHeadSha) {
  assertPlainData(evidence, '$contactEvidence');
  for (const field of FORBIDDEN_CALLER_FIELDS) if (Object.hasOwn(evidence, field)) throw new TypeError(`Caller-controlled field ${field} is forbidden.`);
  verifySealedHash(evidence, 'semanticHash', '$contactEvidence');
  assertExactKeys(evidence, [
    'schema','id','exactHeadSha','solverHash','implementationHash','source','rawEvidenceHash',
    'referenceHash','oracleHash','referenceUncertainty','acceptanceTolerance','observedError',
    'signedGapRange','contactNormal','pressureRange','activeSetCount','penetrationRatio',
    'contactResultant','contactEnergy','tangentialTractionMax','contactWorkImbalance',
    'globalEquilibriumResidual','closestPointIdentity','surfaceParameterCoordinates',
    'orientationEvidence','penaltySweep','incrementSweep','meshLevels','stateSequence','mutation',
  ], '$contactEvidence', ['semanticHash']);
  if (evidence.schema !== EVIDENCE_SCHEMA || !REQUIRED_CONTACT_BENCHMARKS.includes(evidence.id)) throw new TypeError('Unknown contact evidence schema or benchmark.');
  if (evidence.exactHeadSha !== candidateExactHeadSha) throw new TypeError('Evidence is stale for the candidate exact head.');
  if (evidence.source !== 'EXTERNAL_SOLVER_EXECUTION') throw new TypeError('External solver execution is required.');
  for (const field of ['solverHash','implementationHash','rawEvidenceHash','referenceHash','oracleHash']) if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  assertFiniteNumber(evidence.referenceUncertainty, 'referenceUncertainty', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.acceptanceTolerance, 'acceptanceTolerance', (n) => n > 0, 'positive');
  assertFiniteNumber(evidence.observedError, 'observedError', (n) => n >= 0, 'nonnegative');
  if (evidence.acceptanceTolerance < evidence.referenceUncertainty) throw new TypeError('Tolerance understates uncertainty.');
  for (const [field, limit] of [
    ['penetrationRatio', contract.penetrationRatioLimit],
    ['contactWorkImbalance', contract.contactWorkImbalanceLimit],
    ['globalEquilibriumResidual', contract.globalEquilibriumResidualLimit],
  ]) {
    assertFiniteNumber(evidence[field], field, (n) => n >= 0, 'nonnegative');
    if (evidence[field] > limit) return [`${field.toUpperCase()}_LIMIT`];
  }
  validateVector(evidence.contactNormal, 'contactNormal', 3);
  if (Math.abs(Math.hypot(...evidence.contactNormal) - 1) > 1e-12) throw new TypeError('Contact normal must be a unit vector.');
  validateVector(evidence.contactResultant, 'contactResultant', 3);
  validateRange(evidence.signedGapRange, 'signedGapRange');
  validateRange(evidence.pressureRange, 'pressureRange');
  if (evidence.pressureRange[0] < -1e-12) throw new TypeError('Tensile contact pressure is forbidden.');
  assertFiniteNumber(evidence.activeSetCount, 'activeSetCount', (n) => Number.isInteger(n) && n >= 0, 'nonnegative integer');
  assertFiniteNumber(evidence.contactEnergy, 'contactEnergy');
  assertFiniteNumber(evidence.tangentialTractionMax, 'tangentialTractionMax', (n) => n >= 0, 'nonnegative');
  const pressureScale = Math.max(Math.abs(evidence.pressureRange[1]), 1);
  const blockers = [];
  if (evidence.observedError > evidence.acceptanceTolerance) blockers.push('ERROR_EXCEEDS_TOLERANCE');
  if (evidence.tangentialTractionMax / pressureScale > contract.tangentialTractionRatioLimit) blockers.push('TANGENTIAL_TRACTION');
  validateSweep(evidence.penaltySweep, contract.penaltySensitivityScales.length, 'penaltySweep');
  validateSweep(evidence.incrementSweep, contract.incrementSensitivityScales.length, 'incrementSweep');
  validateMesh(evidence.meshLevels, contract.meshLevelCount);
  if (evidence.id === REQUIRED_CONTACT_BENCHMARKS[1]) {
    if (evidence.activeSetCount !== 0 || evidence.pressureRange[1] > 1e-12 || Math.hypot(...evidence.contactResultant) > 1e-8) blockers.push('FALSE_TENSILE_CONTACT');
  }
  if (evidence.id === REQUIRED_CONTACT_BENCHMARKS[6]) {
    const states = evidence.stateSequence.map((row) => row.active);
    if (states.length !== 3 || states[0] !== true || states[1] !== false || states[2] !== true) blockers.push('RECONTACT_SEQUENCE');
  }
  if (evidence.id === REQUIRED_CONTACT_BENCHMARKS[8]) {
    if (evidence.observedError > contract.penaltyResultantSpreadLimit) blockers.push('PENALTY_SENSITIVITY');
    const penetrations = evidence.penaltySweep.map((row) => row.penetrationRatio);
    if (!(penetrations[0] >= penetrations[1] && penetrations[1] >= penetrations[2])) blockers.push('PENALTY_MONOTONICITY');
  }
  if (evidence.id === REQUIRED_CONTACT_BENCHMARKS[9] && evidence.observedError > contract.meshResultantSpreadLimit) blockers.push('MESH_CONVERGENCE');
  assertPlainData(evidence.mutation, '$contactEvidence.mutation');
  assertExactKeys(evidence.mutation, ['id','baselineError','mutatedError'], '$contactEvidence.mutation');
  assertFiniteNumber(evidence.mutation.baselineError, 'mutation.baselineError', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.mutation.mutatedError, 'mutation.mutatedError', (n) => n >= 0, 'nonnegative');
  if (evidence.mutation.baselineError > evidence.acceptanceTolerance || evidence.mutation.mutatedError <= evidence.acceptanceTolerance) blockers.push('NEGATIVE_MUTATION_NOT_DETECTED');
  return blockers;
}

function validateVector(value, path, length) {
  assertArray(value, path, { min: length });
  if (value.length !== length) throw new TypeError(`${path} must have ${length} components.`);
  value.forEach((entry, i) => assertFiniteNumber(entry, `${path}[${i}]`));
}
function validateRange(value, path) {
  validateVector(value, path, 2);
  if (value[0] > value[1]) throw new TypeError(`${path} is not ordered.`);
}
function validateSweep(value, minimum, path) {
  assertArray(value, path, { min: minimum });
  value.forEach((row, i) => { assertPlainData(row, `${path}[${i}]`); for (const field of Object.keys(row)) if (typeof row[field] === 'number') assertFiniteNumber(row[field], `${path}[${i}].${field}`); });
}
function validateMesh(value, count) {
  assertArray(value, 'meshLevels', { min: count });
  if (value.length !== count) throw new TypeError(`Exactly ${count} mesh levels are required.`);
  let previousGlobal = Infinity, previousLocal = Infinity;
  for (const [i, row] of value.entries()) {
    assertFiniteNumber(row.globalH, `meshLevels[${i}].globalH`, (n) => n > 0, 'positive');
    assertFiniteNumber(row.probeLocalH, `meshLevels[${i}].probeLocalH`, (n) => n > 0, 'positive');
    if (!(row.globalH < previousGlobal && row.probeLocalH < previousLocal)) throw new TypeError('Mesh levels must strictly refine global and probe-local h.');
    previousGlobal = row.globalH; previousLocal = row.probeLocalH;
  }
}
