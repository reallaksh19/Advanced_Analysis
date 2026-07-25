import { createReviewProfile, REVIEW_STATUSES } from './review-contract.js';
import { qualifyReviewEvidence, ReviewQualificationError, sourceArtifactHashes, sourceArtifactIdentities } from './review-qualification.js';
import { createGeometryReview } from './review-geometry.js';
import { createResultReviews } from './review-results.js';
import { createQualifiedReviewResult, createRejectedReviewResult } from './review-result.js';

const STANDARD_LIMITATIONS = Object.freeze([
  'Two-dimensional linear elasticity only.',
  'Plane-stress or plane-strain formulation only.',
  'Small displacement and small strain only.',
  'Isotropic linear elasticity only.',
  'T3 and Q4 continuum elements only.',
  'Static analysis only.',
  'No contact, plasticity, geometric nonlinearity, buckling, dynamics, or thermal loading.',
  'No code-compliance or engineering-acceptance assessment is performed.',
  'Projected stress is non-authoritative review evidence.',
  'Convergence evidence does not establish physical validation.',
  'Sparse qualification is bounded and not unrestricted production-scale evidence.',
]);

export function createEngineeringReview(value, profileValue) {
  let profile;
  try {
    profile = createReviewProfile(profileValue);
    const qualified = qualifyReviewEvidence(value);
    return qualifiedReview(qualified, profile);
  } catch (error) {
    return rejectedReview(value, profile, error);
  }
}

function qualifiedReview(qualified, profile) {
  const { input, sourceArtifactIdentities: identities, sourceArtifactHashes: hashes, qualificationLedger } = qualified;
  const geometryReview = createGeometryReview(input.model, input.result, profile);
  const resultReviews = createResultReviews(input.model, input.result, input.adapterResult, input, profile);
  const diagnostics = sourceDiagnostics(input, identities);
  const limitations = sourceLimitations(input);
  return createQualifiedReviewResult({
    reviewIdentity: input.reviewIdentity,
    reviewVersion: input.reviewVersion,
    profileIdentity: profile.profileIdentity,
    sourceArtifactIdentities: identities,
    sourceArtifactHashes: hashes,
    analysisSummary: analysisSummary(input, identities, hashes),
    qualificationSummary: qualificationSummary(qualificationLedger),
    modelSummary: modelSummary(input.model),
    solverSummary: resultReviews.solverSummary,
    geometryReview,
    loadReview: resultReviews.loadReview,
    constraintReview: resultReviews.constraintReview,
    displacementReview: resultReviews.displacementReview,
    reactionReview: resultReviews.reactionReview,
    rawStressReview: resultReviews.rawStressReview,
    projectedStressReview: resultReviews.projectedStressReview,
    convergenceReview: resultReviews.convergenceReview,
    diagnostics,
    limitations,
  });
}

function rejectedReview(value, profile, error) {
  const input = value && typeof value === 'object' ? value : {};
  const status = error instanceof ReviewQualificationError ? error.status : REVIEW_STATUSES.INCONSISTENT;
  const identity = error instanceof ReviewQualificationError ? error.sourceArtifactIdentity : 'LFEA-006';
  let identities = null; let hashes = null;
  try { identities = sourceArtifactIdentities(input); hashes = sourceArtifactHashes(input); } catch { /* intentionally empty */ }
  return createRejectedReviewResult({
    status,
    reviewIdentity: typeof input.reviewIdentity === 'string' ? input.reviewIdentity : 'REJECTED_REVIEW',
    reviewVersion: typeof input.reviewVersion === 'string' ? input.reviewVersion : '1',
    profileIdentity: profile?.profileIdentity || null,
    sourceArtifactIdentities: identities,
    sourceArtifactHashes: hashes,
    diagnostics: [{ severity: 'ERROR', code: error.code || 'REVIEW_REJECTED', sourceArtifactIdentity: identity, message: error.message }],
    limitations: STANDARD_LIMITATIONS,
  });
}

function analysisSummary(input, identities, hashes) {
  const model = input.model; const result = input.result;
  return {
    modelIdentity: model.modelIdentity,
    modelVersion: model.modelVersion,
    loadCaseIdentity: result.loadCaseIdentity,
    formulation: model.solverProfile.formulation,
    units: { ...model.solverProfile.units },
    coordinateConvention: 'RIGHT_HANDED_XY_V1',
    backendIdentity: result.schema === 'fea-continuum-result/v3' ? result.backendIdentity : result.backendTrace.backendIdentity,
    materialCount: model.materials.length,
    nodeCount: model.nodes.length,
    t3Count: model.elements.filter((row) => row.type === 'T3').length,
    q4Count: model.elements.filter((row) => row.type === 'Q4').length,
    activeDofCount: result.dofMap.length,
    freeDofCount: result.constraintPartition.freeDofIndices.length,
    constrainedDofCount: result.constraintPartition.constrainedDofIndices.length,
    sourcePackageIdentity: input.adapterResult.sourcePackageIdentity,
    adapterResultIdentity: identities.adapterResult,
    modelHash: hashes.model,
    resultHash: hashes.result,
  };
}

function qualificationSummary(rows) {
  const counts = { PASS: 0, FAIL: 0, NOT_APPLICABLE: 0, NOT_SUPPLIED: 0 };
  rows.forEach((row) => { counts[row.status] += 1; });
  return { status: 'QUALIFIED', counts, rows };
}

function modelSummary(model) {
  const materialIds = model.materials.map((row) => row.materialId);
  const thicknesses = [...new Set(model.elements.map((row) => row.thickness).filter((value) => value !== null))].sort((a, b) => a - b);
  return {
    modelIdentity: model.modelIdentity,
    nodeCount: model.nodes.length,
    elementCount: model.elements.length,
    materialCount: model.materials.length,
    materialIds,
    t3Count: model.elements.filter((row) => row.type === 'T3').length,
    q4Count: model.elements.filter((row) => row.type === 'Q4').length,
    formulation: model.solverProfile.formulation,
    planeStressThicknesses: thicknesses,
    outOfPlaneScale: model.solverProfile.formulation === 'PLANE_STRAIN' ? model.solverProfile.outOfPlaneScale : null,
  };
}

function sourceDiagnostics(input, identities) {
  const rows = [];
  appendDiagnostics(rows, input.adapterResult.diagnostics, identities.adapterResult);
  appendDiagnostics(rows, input.result.diagnostics, identities.result);
  appendDiagnostics(rows, input.convergenceResult?.diagnostics, identities.convergenceResult);
  if (!input.stressProjection) rows.push({ severity: 'INFORMATION', code: 'PROJECTED_STRESS_NOT_SUPPLIED', sourceArtifactIdentity: identities.model, message: 'Projected stress was not supplied; raw stress remains authoritative.' });
  if (!input.convergenceResult) rows.push({ severity: 'INFORMATION', code: 'CONVERGENCE_NOT_SUPPLIED', sourceArtifactIdentity: identities.model, message: 'Convergence evidence was not supplied.' });
  return rows;
}

function appendDiagnostics(target, rows, identity) {
  for (const row of rows || []) target.push({ severity: normalizedSeverity(row.severity), code: row.code || 'SOURCE_DIAGNOSTIC', sourceArtifactIdentity: identity, message: row.message });
}
function normalizedSeverity(value) {
  return ['ERROR','WARNING','INFORMATION'].includes(value) ? value : value === 'INFO' ? 'INFORMATION' : 'WARNING';
}
function sourceLimitations(input) {
  return [
    ...STANDARD_LIMITATIONS,
    ...(input.adapterResult.limitations || []),
    ...(input.model.limitations || []),
    ...(input.result.limitations || []),
    ...(input.stressProjection?.limitations || []),
    ...(input.convergenceStudy?.limitations || []),
    ...(input.convergenceResult?.limitations || []),
  ];
}
