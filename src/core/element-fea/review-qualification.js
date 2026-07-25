import { deepFreeze } from '../shared-piping-model/immutable.js';
import { createContinuumModel } from './model.js';
import { validateContinuumResult } from './result.js';
import { validateMeshAdapterResult } from './mesh-package-result.js';
import { validateConvergenceResult } from './interpretation-result.js';
import { validateStressProjection } from './stress-projection.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3, RESULT_STATUS } from './constants.js';
import { PROJECTED_STRESS_AUTHORITY, REVIEW_STATUSES, compareIdentity, createReviewInput } from './review-contract.js';

const SUPPORTED_RESULTS = Object.freeze([CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3]);

export class ReviewQualificationError extends Error {
  constructor(code, message, status = REVIEW_STATUSES.INCONSISTENT, sourceArtifactIdentity = 'LFEA-006') {
    super(message);
    this.name = 'ReviewQualificationError';
    this.code = code;
    this.status = status;
    this.sourceArtifactIdentity = sourceArtifactIdentity;
  }
}

export function qualifyReviewEvidence(value) {
  const input = createReviewInput(value);
  const identities = sourceArtifactIdentities(input);
  const hashes = sourceArtifactHashes(input);
  qualifyRequiredChain(input, identities);
  qualifyConvergence(input, identities);
  qualifyProjection(input, identities);
  const ledger = qualificationLedger(input, identities, hashes);
  return deepFreeze({ input, sourceArtifactIdentities: identities, sourceArtifactHashes: hashes, qualificationLedger: ledger });
}

export function sourceArtifactIdentities(input) {
  return deepFreeze({
    adapterResult: `${input.adapterResult.sourcePackageIdentity}:ADAPTER_RESULT`,
    model: input.model.modelIdentity,
    result: `${input.result.modelIdentity}:${input.result.loadCaseIdentity}:${input.result.schema}`,
    convergenceStudy: input.convergenceStudy?.studyIdentity || null,
    convergenceResult: input.convergenceResult?.interpretationIdentity || null,
    stressProjection: input.stressProjection?.projectionIdentity || null,
  });
}

export function sourceArtifactHashes(input) {
  return deepFreeze({
    adapterResult: input.adapterResult.semanticHash,
    model: input.model.semanticHash,
    result: input.result.semanticHash,
    convergenceStudy: input.convergenceStudy?.semanticHash || null,
    convergenceResult: input.convergenceResult?.semanticHash || null,
    stressProjection: input.stressProjection?.semanticHash || null,
  });
}

function qualifyRequiredChain(input, identities) {
  const adapterValidation = validateMeshAdapterResult(input.adapterResult);
  if (!adapterValidation.ok || input.adapterResult.status !== 'ACCEPTED') fail('ADAPTER_NOT_ACCEPTED', adapterValidation.errors[0] || 'Review requires an accepted adapter result.', REVIEW_STATUSES.INCONSISTENT, identities.adapterResult);
  const model = safelyCreateModel(input.model, identities.model);
  if (model.semanticHash !== input.model.semanticHash) fail('MODEL_HASH_MISMATCH', 'Review model semantic hash is stale.', REVIEW_STATUSES.INCONSISTENT, identities.model);
  if (!SUPPORTED_RESULTS.includes(input.result.schema)) fail('UNSUPPORTED_RESULT_SCHEMA', 'Review result schema is unsupported.', REVIEW_STATUSES.UNQUALIFIED, identities.result);
  const resultValidation = validateContinuumResult(input.result);
  if (!resultValidation.ok) fail('RESULT_VALIDATION_FAILED', resultValidation.errors[0], REVIEW_STATUSES.UNQUALIFIED, identities.result);
  if (input.result.status !== RESULT_STATUS.QUALIFIED || input.result.qualifiedResults !== 'complete') fail('RESULT_NOT_QUALIFIED', 'Review requires a qualified complete solver result.', REVIEW_STATUSES.UNQUALIFIED, identities.result);
  if (input.adapterResult.qualifiedModelSemanticHash !== model.semanticHash) fail('ADAPTER_MODEL_HASH_MISMATCH', 'Adapter and model semantic hashes do not match.', REVIEW_STATUSES.INCONSISTENT, identities.adapterResult);
  if (input.adapterResult.sourcePackageSemanticHash !== model.sourceSemanticHash) fail('ADAPTER_MODEL_ANCESTRY_MISMATCH', 'Adapter and model source ancestry do not match.', REVIEW_STATUSES.INCONSISTENT, identities.adapterResult);
  if (input.result.modelSemanticHash !== model.semanticHash || input.result.modelEvidence?.semanticHash !== model.semanticHash) fail('MODEL_RESULT_HASH_MISMATCH', 'Model and result semantic hashes do not match.', REVIEW_STATUSES.INCONSISTENT, identities.result);
  requireResultSections(input.result, identities.result);
}

function qualifyConvergence(input, identities) {
  const supplied = input.convergenceStudy !== null || input.convergenceResult !== null;
  if (!supplied) return;
  if (!input.convergenceStudy || !input.convergenceResult) fail('INCOMPLETE_CONVERGENCE_CHAIN', 'Convergence study and result must be supplied together.', REVIEW_STATUSES.INCONSISTENT, identities.convergenceStudy || identities.convergenceResult || 'CONVERGENCE');
  const study = input.convergenceStudy;
  if (study.schema !== 'fea-convergence-study/v1' || !Array.isArray(study.levels) || study.levels.length < 3) fail('CONVERGENCE_STUDY_INVALID', 'Convergence study structure is invalid.', REVIEW_STATUSES.INCONSISTENT, identities.convergenceStudy);
  const { semanticHash: declaredStudyHash, ...studyBase } = study;
  if (declaredStudyHash !== semanticHash(studyBase)) fail('CONVERGENCE_STUDY_INVALID', 'Convergence study semantic hash mismatch.', REVIEW_STATUSES.INCONSISTENT, identities.convergenceStudy);
  const validation = validateConvergenceResult(input.convergenceResult);
  if (!validation.ok) fail('CONVERGENCE_RESULT_INVALID', validation.errors[0], REVIEW_STATUSES.INCONSISTENT, identities.convergenceResult);
  if (input.convergenceResult.sourceStudySemanticHash !== study.semanticHash || input.convergenceResult.studyEvidence?.semanticHash !== study.semanticHash) fail('CONVERGENCE_RESULT_MISMATCH', 'Convergence result does not belong to the supplied study.', REVIEW_STATUSES.INCONSISTENT, identities.convergenceResult);
  const matches = study.levels.filter((level) => level.modelSemanticHash === input.model.semanticHash && level.resultSemanticHash === input.result.semanticHash);
  if (matches.length !== 1) fail('CONVERGENCE_CURRENT_LEVEL_MISMATCH', 'The supplied model/result must occur exactly once in the convergence study.', REVIEW_STATUSES.INCONSISTENT, identities.convergenceStudy);
  if (input.convergenceResult.quantityResults?.some((row) => row.sourceAuthority !== 'RAW_QUALIFIED_RESULT')) fail('CONVERGENCE_AUTHORITY_INVALID', 'Convergence evidence must retain raw qualified-result authority.', REVIEW_STATUSES.INCONSISTENT, identities.convergenceResult);
}

function qualifyProjection(input, identities) {
  const projection = input.stressProjection;
  if (!projection) return;
  const validation = validateStressProjection(projection);
  if (!validation.ok) fail('PROJECTION_INVALID', validation.errors[0], REVIEW_STATUSES.INCONSISTENT, identities.stressProjection);
  if (projection.sourceResultSemanticHash !== input.result.semanticHash || projection.sourceModelSemanticHash !== input.model.semanticHash) fail('PROJECTION_RESULT_MISMATCH', 'Stress projection source model/result hashes do not match the review chain.', REVIEW_STATUSES.INCONSISTENT, identities.stressProjection);
  if (projection.authority !== PROJECTED_STRESS_AUTHORITY || projection.status !== PROJECTED_STRESS_AUTHORITY) fail('PROJECTION_AUTHORITY_INVALID', 'Projected stress authority is invalid.', REVIEW_STATUSES.INCONSISTENT, identities.stressProjection);
  const restrictions = projection.consumerRestrictions || {};
  for (const key of ['convergence','singularityClassification','acceptanceChecks','designCodeChecks','governingMaximum','reactionOrEquilibrium','rawStressReplacement']) if (restrictions[key] !== 'PROHIBITED') fail('PROJECTION_USE_INVALID', `Projected stress use ${key} must remain prohibited.`, REVIEW_STATUSES.INCONSISTENT, identities.stressProjection);
  assertProjectionContributors(projection, input.result, identities.stressProjection);
}

function requireResultSections(result, identity) {
  const requiredObjects = ['constraintPartition','freeDofResidual','globalResidual','appliedLoadTotals','reactionTotals','equilibriumTotals','energyConsistency'];
  const requiredArrays = ['nodalDisplacements','reactions','elementStrainEnergy'];
  if (requiredObjects.some((key) => !result[key] || typeof result[key] !== 'object')) fail('RESULT_SECTION_MISSING', 'Qualified result is missing reaction, residual, equilibrium, or energy evidence.', REVIEW_STATUSES.UNQUALIFIED, identity);
  if (requiredArrays.some((key) => !Array.isArray(result[key]))) fail('RESULT_SECTION_MISSING', 'Qualified result is missing displacement, reaction, or energy arrays.', REVIEW_STATUSES.UNQUALIFIED, identity);
  const raw = result.schema === CONTINUUM_RESULT_SCHEMA ? Array.isArray(result.elementStresses) && result.elementStresses.length > 0 : Array.isArray(result.integrationPointResults) && result.integrationPointResults.length > 0;
  if (!raw) fail('RAW_STRESS_MISSING', 'Qualified result is missing authoritative raw-stress evidence.', REVIEW_STATUSES.UNQUALIFIED, identity);
  assertFiniteEvidence(result, identity);
}

function assertFiniteEvidence(result, identity) {
  for (const row of result.nodalDisplacements) finite(row.value, 'displacement', identity);
  for (const row of result.reactions) finite(row.value, 'reaction', identity);
  const rawRows = result.schema === CONTINUUM_RESULT_SCHEMA ? result.elementStresses : result.integrationPointResults;
  for (const row of rawRows) {
    const values = result.schema === CONTINUUM_RESULT_SCHEMA ? [...row.values, row.sigmaZ] : [...row.strain, ...row.stress, row.sigmaZ, row.vonMisesStress];
    values.forEach((value) => finite(value, 'raw stress', identity));
  }
}

function assertProjectionContributors(projection, result, identity) {
  const rawIds = new Set();
  if (result.schema === CONTINUUM_RESULT_SCHEMA) result.elementStresses.forEach((row) => rawIds.add(`${row.elementId}:T3_CONSTANT`));
  else result.integrationPointResults.forEach((row) => rawIds.add(`${row.elementId}:${row.integrationPointId}`));
  const contributors = [
    ...(projection.elementCornerValues || []).flatMap((row) => row.components || []).flatMap((row) => row.sourceIntegrationPointIds || []),
    ...(projection.nodalValues || []).flatMap((row) => row.sourceIntegrationPointIds || []),
  ];
  if (contributors.some((id) => !rawIds.has(id))) fail('PROJECTION_CONTRIBUTOR_MISSING', 'Projected stress references missing raw-stress contributors.', REVIEW_STATUSES.INCONSISTENT, identity);
}

function qualificationLedger(input, identities, hashes) {
  const suppliedProjection = input.stressProjection !== null;
  const suppliedConvergence = input.convergenceStudy !== null && input.convergenceResult !== null;
  const rows = [
    row('ADAPTER_QUALIFICATION','PASS','lfea-mesh-adapter-result/v1',identities.adapterResult,hashes.adapterResult,'adapterResult.status','Accepted adapter result qualified.'),
    row('MODEL_QUALIFICATION','PASS','fea-continuum-model/v1',identities.model,hashes.model,'model.semanticHash','Canonical continuum model requalified.'),
    row('SOLVER_TERMINATION','PASS',input.result.schema,identities.result,hashes.result,'result.status','Qualified solver termination retained.'),
    row('TRUE_RESIDUAL_QUALIFICATION','PASS',input.result.schema,identities.result,hashes.result,'result.freeDofResidual','Qualified residual evidence retained.'),
    row('REACTION_RECOVERY','PASS','ORIGINAL_SYSTEM_R_EQUALS_KU_MINUS_F',identities.result,hashes.result,'result.reactions','Original-system reactions retained.'),
    row('FORCE_BALANCE','PASS','QUALIFIED_RESULT_EQUILIBRIUM',identities.result,hashes.result,'result.equilibriumTotals.fx/fy','Qualified force-balance evidence retained.'),
    row('MOMENT_BALANCE','PASS','QUALIFIED_RESULT_EQUILIBRIUM',identities.result,hashes.result,'result.equilibriumTotals.mz','Qualified moment-balance evidence retained.'),
    row('STRAIN_ENERGY_CONSISTENCY','PASS','QUALIFIED_RESULT_ENERGY',identities.result,hashes.result,'result.energyConsistency','Qualified strain-energy evidence retained.'),
    row('RAW_STRESS_AVAILABILITY','PASS','AUTHORITATIVE_RAW_RESULT',identities.result,hashes.result,'result raw stress arrays','Authoritative raw stress is available.'),
    row('PROJECTION_AUTHORITY',suppliedProjection?'PASS':'NOT_SUPPLIED',PROJECTED_STRESS_AUTHORITY,identities.stressProjection,hashes.stressProjection,suppliedProjection?'stressProjection.authority':null,suppliedProjection?'Non-authoritative projection supplied.':'Projected stress was not supplied.'),
    row('CONVERGENCE_AVAILABILITY',suppliedConvergence?'PASS':'NOT_SUPPLIED','fea-convergence-result/v1',identities.convergenceResult,hashes.convergenceResult,suppliedConvergence?'convergenceResult.semanticHash':null,suppliedConvergence?'Qualified convergence evidence supplied.':'Convergence evidence was not supplied.'),
    row('CROSS_ARTIFACT_ANCESTRY','PASS','LFEA-006_CROSS_ARTIFACT_CHAIN_V1',identities.model,hashes.model,'review input hashes','All supplied artifacts form one exact evidence chain.'),
  ];
  return rows.sort((a, b) => compareIdentity(a.qualificationId, b.qualificationId));
}

function row(qualificationId, status, authority, identity, hash, evidenceReference, message) {
  return { qualificationId, status, authority, sourceArtifactIdentity: identity, sourceArtifactSemanticHash: hash, evidenceReference, message };
}
function safelyCreateModel(value, identity) {
  try { return createContinuumModel(value); } catch (error) { fail('MODEL_VALIDATION_FAILED', error.message, REVIEW_STATUSES.INCONSISTENT, identity); }
}
function finite(value, label, identity) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('NONFINITE_REVIEW_VALUE', `Qualified ${label} evidence contains a non-finite value.`, REVIEW_STATUSES.UNQUALIFIED, identity);
}
function fail(code, message, status, identity) {
  throw new ReviewQualificationError(code, message, status, identity);
}
