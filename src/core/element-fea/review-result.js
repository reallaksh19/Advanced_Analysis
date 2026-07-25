import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { ENGINEERING_REVIEW_SCHEMA, RAW_STRESS_AUTHORITY, REVIEW_STATUSES, normalizeLimitations, sortDiagnostics } from './review-contract.js';

export function createQualifiedReviewResult(input) {
  const base = {
    schema: ENGINEERING_REVIEW_SCHEMA,
    status: REVIEW_STATUSES.QUALIFIED,
    reviewIdentity: input.reviewIdentity,
    reviewVersion: input.reviewVersion,
    profileIdentity: input.profileIdentity,
    sourceArtifactIdentities: input.sourceArtifactIdentities,
    sourceArtifactHashes: input.sourceArtifactHashes,
    analysisSummary: { ...input.analysisSummary, reviewHash: null },
    qualificationSummary: input.qualificationSummary,
    modelSummary: input.modelSummary,
    solverSummary: input.solverSummary,
    geometryReview: input.geometryReview,
    loadReview: input.loadReview,
    constraintReview: input.constraintReview,
    displacementReview: input.displacementReview,
    reactionReview: input.reactionReview,
    rawStressReview: input.rawStressReview,
    projectedStressReview: input.projectedStressReview,
    convergenceReview: input.convergenceReview,
    diagnostics: sortDiagnostics(input.diagnostics || []),
    limitations: normalizeLimitations(input.limitations || []),
  };
  return finalize(base);
}

export function createRejectedReviewResult(input) {
  const unavailable = () => ({ status: 'UNAVAILABLE' });
  const base = {
    schema: ENGINEERING_REVIEW_SCHEMA,
    status: input.status || REVIEW_STATUSES.INCONSISTENT,
    reviewIdentity: input.reviewIdentity || 'REJECTED_REVIEW',
    reviewVersion: input.reviewVersion || '1',
    profileIdentity: input.profileIdentity || null,
    sourceArtifactIdentities: input.sourceArtifactIdentities || null,
    sourceArtifactHashes: input.sourceArtifactHashes || null,
    analysisSummary: { status: 'UNAVAILABLE', reviewHash: null },
    qualificationSummary: { status: 'REJECTED', rows: [] },
    modelSummary: unavailable(),
    solverSummary: unavailable(),
    geometryReview: { status: 'UNAVAILABLE', nodes: [], elements: [], extents: null },
    loadReview: { status: 'UNAVAILABLE', nodalForces: [], edgeTractions: [], edgePressures: [] },
    constraintReview: { status: 'UNAVAILABLE', rows: [] },
    displacementReview: { status: 'UNAVAILABLE', rows: [] },
    reactionReview: { status: 'UNAVAILABLE', rows: [] },
    rawStressReview: { status: 'UNAVAILABLE', authority: RAW_STRESS_AUTHORITY, rows: [], governing: null },
    projectedStressReview: { status: 'UNAVAILABLE', elementCornerValues: [], nodalValues: [] },
    convergenceReview: { status: 'UNAVAILABLE', levels: [], quantities: [] },
    diagnostics: sortDiagnostics(input.diagnostics || []),
    limitations: normalizeLimitations(input.limitations || []),
  };
  return finalize(base);
}

export function validateEngineeringReview(value) {
  const errors = [];
  if (value?.schema !== ENGINEERING_REVIEW_SCHEMA) errors.push('Invalid lfea-engineering-review/v1 schema.');
  if (!Object.values(REVIEW_STATUSES).includes(value?.status)) errors.push('Engineering-review status is invalid.');
  for (const key of requiredSections()) if (!Object.hasOwn(value || {}, key)) errors.push(`Engineering review is missing ${key}.`);
  if (value?.analysisSummary?.reviewHash !== value?.semanticHash) errors.push('Engineering-review self hash is inconsistent.');
  try { if (value?.semanticHash !== reviewSemanticHash(value)) errors.push('Engineering-review semantic hash mismatch.'); } catch (error) { errors.push(error.message); }
  if (value?.status === REVIEW_STATUSES.QUALIFIED) validateQualified(value, errors); else validateRejected(value, errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function reviewSemanticHash(value) {
  const { semanticHash: _hash, ...base } = value || {};
  const analysisSummary = { ...(base.analysisSummary || {}), reviewHash: null };
  return semanticHash({ ...base, analysisSummary });
}

function finalize(base) {
  const hash = semanticHash(base);
  const result = { ...base, analysisSummary: { ...base.analysisSummary, reviewHash: hash }, semanticHash: hash };
  return deepFreeze(result);
}

function validateQualified(value, errors) {
  if (value.diagnostics?.some((row) => row.severity === 'ERROR')) errors.push('Qualified review contains error diagnostics.');
  if (value.qualificationSummary?.rows?.some((row) => row.status === 'FAIL')) errors.push('Qualified review contains failed qualification evidence.');
  if (value.rawStressReview?.authority !== RAW_STRESS_AUTHORITY || !value.rawStressReview?.rows?.length) errors.push('Qualified review lacks authoritative raw-stress evidence.');
  if (!Array.isArray(value.geometryReview?.nodes) || !Array.isArray(value.displacementReview?.rows) || !Array.isArray(value.reactionReview?.rows)) errors.push('Qualified review datasets are invalid.');
}

function validateRejected(value, errors) {
  const exposed = value.geometryReview?.nodes?.length || value.loadReview?.nodalForces?.length || value.constraintReview?.rows?.length || value.displacementReview?.rows?.length || value.reactionReview?.rows?.length || value.rawStressReview?.rows?.length;
  if (exposed) errors.push('Rejected review exposes qualified datasets.');
  if (!value.diagnostics?.some((row) => row.severity === 'ERROR')) errors.push('Rejected review requires an error diagnostic.');
}

function requiredSections() {
  return ['schema','status','reviewIdentity','reviewVersion','profileIdentity','sourceArtifactIdentities','sourceArtifactHashes','analysisSummary','qualificationSummary','modelSummary','solverSummary','geometryReview','loadReview','constraintReview','displacementReview','reactionReview','rawStressReview','projectedStressReview','convergenceReview','diagnostics','limitations','semanticHash'];
}
