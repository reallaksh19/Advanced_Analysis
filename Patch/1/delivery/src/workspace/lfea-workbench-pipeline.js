/**
 * Qualified LFEA adapter, solver, review, and deterministic export pipeline.
 *
 * Each stage retains its own failure evidence. A later stage is never attempted
 * after a rejection, so no fallback can be mistaken for an authoritative result.
 */
import {
  adaptMeshPackage,
  createEngineeringReview,
  createEvidenceExport,
  createReviewInput,
  createStressProjection,
  solveContinuumModel,
} from '../core/element-fea/index.js';
import { semanticHash } from '../core/shared-piping-model/canonical-json.js';
import { normalizeLfeaMeshPackage } from './lfea-workbench-model.js';
import { preflightMeshPackage } from './lfea-preflight.js';

/**
 * Qualified default adapter capacity and geometry tolerances.
 *
 * @returns {Readonly<Record<string, unknown>>} Explicit adapter profile.
 */
export function createLfeaWorkbenchAdapterProfile() {
  return freeze({
    schema: 'lfea-mesh-adapter-profile/v1',
    profileIdentity: 'lfea-workbench-adapter-v1',
    coordinateAbsoluteTolerance: 1e-9,
    areaAbsoluteTolerance: 1e-12,
    jacobianAbsoluteTolerance: 1e-12,
    // Capacity is declared at a level the FULL evidence chain can actually
    // deliver. The previous 10 000/10 000 declaration was unreachable by more
    // than an order of magnitude: the export byte cap rejected models at around
    // 700 elements. See lfea-preflight.js::effectiveElementCeiling and
    // benchmark case BM-T5-CAPACITY-ENVELOPE.
    maximumNodes: 2400,
    maximumElements: 2000,
    maximumEdges: 50000,
    maximumRegions: 1000,
    maximumBoundaries: 1000,
    maximumPoints: 1000,
    maximumAssignments: 10000,
  });
}

/**
 * Explicit review and evidence-export display profile.
 *
 * @param {boolean} includeProjectedStress Whether to generate non-authoritative projection evidence.
 * @returns {Readonly<Record<string, unknown>>} Review profile.
 */
export function createLfeaWorkbenchReviewProfile(includeProjectedStress) {
  return freeze({
    schema: 'lfea-review-profile/v1',
    profileIdentity: includeProjectedStress
      ? 'lfea-workbench-review-projected-v1'
      : 'lfea-workbench-review-raw-v1',
    deformationScale: 10,
    coordinateDisplayPrecision: 6,
    displacementDisplayPrecision: 8,
    forceDisplayPrecision: 8,
    stressDisplayPrecision: 8,
    energyDisplayPrecision: 10,
    includeProjectedStress,
    includeConvergenceEvidence: false,
    includeSourceArtifacts: false,
    maximumExportRows: 400000,
    maximumExportBytes: 67108864,
  });
}

/**
 * Run mesh validation, adaptation, solve, projection, review, and evidence export.
 *
 * @param {unknown} packageInput Valid mesh package.
 * @param {{adapterProfile?:unknown,reviewProfile?:unknown,includeProjectedStress?:boolean}|undefined} options Explicit profiles.
 * @returns {Readonly<Record<string, unknown>>} Complete fail-closed execution evidence.
 */
export function executeLfeaWorkbench(packageInput, options) {
  const configuration = options ?? {};
  try {
    const packageValue = normalizeLfeaMeshPackage(packageInput);
    const adapterProfile = configuration.adapterProfile ?? createLfeaWorkbenchAdapterProfile();
    const includeProjectedStress = configuration.includeProjectedStress ?? true;
    const reviewProfile = configuration.reviewProfile
      ?? createLfeaWorkbenchReviewProfile(includeProjectedStress);
    const preflight = preflightMeshPackage(packageValue, adapterProfile, reviewProfile);
    const adapterResult = adaptMeshPackage(packageValue, adapterProfile);
    if (adapterResult.status !== 'ACCEPTED') {
      return failure('ADAPTER', adapterResult.diagnostics, { packageValue, adapterResult, preflight });
    }
    const model = adapterResult.qualifiedModel;
    const result = solveContinuumModel(model, packageValue.analysisDefinition.loadCase.loadCaseId);
    if (result.status !== 'QUALIFIED') {
      return failure('SOLVER', result.diagnostics, { packageValue, adapterResult, model, result, preflight });
    }
    const stressProjection = includeProjectedStress ? projectStress(model, result) : null;
    const reviewInput = reviewInputFor(packageValue, adapterResult, model, result, stressProjection);
    const review = createEngineeringReview(reviewInput, reviewProfile);
    if (review.status !== 'QUALIFIED_FOR_REVIEW') {
      return failure('REVIEW', review.diagnostics, { packageValue, adapterResult, model, result, stressProjection, reviewInput, review, preflight });
    }
    const evidenceExport = createEvidenceExport(review, reviewInput, reviewProfile);
    if (evidenceExport.status !== 'QUALIFIED_EXPORT') {
      return failure('EXPORT', evidenceExport.diagnostics, { packageValue, adapterResult, model, result, stressProjection, reviewInput, review, evidenceExport, preflight });
    }
    return freeze({
      schema: 'lfea-workbench-execution/v1',
      status: 'QUALIFIED',
      failedStage: null,
      packageValue,
      adapterResult,
      model,
      result,
      stressProjection,
      reviewInput,
      review,
      evidenceExport,
      preflight,
      authorityPolicy: authorityPolicy(stressProjection),
      diagnostics: combinedDiagnostics(adapterResult, result, review),
    });
  } catch (error) {
    return failure('VALIDATION', [errorDiagnostic(error)], {});
  }
}

function projectStress(model, result) {
  return createStressProjection({
    projectionIdentity: `${model.modelIdentity}:WORKBENCH_PROJECTION`,
    projectionVersion: '1',
    sourceSemanticHash: model.sourceSemanticHash,
    model,
    result,
    components: ['SIGMA_Z', 'SX', 'SY', 'TXY'],
    declaredDiscontinuities: [],
  });
}

function reviewInputFor(packageValue, adapterResult, model, result, stressProjection) {
  const base = {
    schema: 'lfea-review-input/v1',
    reviewIdentity: `${model.modelIdentity}:WORKBENCH_REVIEW`,
    reviewVersion: '1',
    adapterResult,
    model,
    result,
    convergenceStudy: null,
    convergenceResult: null,
    stressProjection,
    sourceReferences: packageValue.sourceReferences,
  };
  return createReviewInput({ ...base, semanticHash: semanticHash(base) });
}

function failure(failedStage, diagnostics, evidence) {
  return freeze({
    schema: 'lfea-workbench-execution/v1',
    status: 'FAILED',
    failedStage,
    packageValue: evidence.packageValue ?? null,
    adapterResult: evidence.adapterResult ?? null,
    model: evidence.model ?? null,
    result: evidence.result ?? null,
    stressProjection: evidence.stressProjection ?? null,
    reviewInput: evidence.reviewInput ?? null,
    review: evidence.review ?? null,
    evidenceExport: evidence.evidenceExport ?? null,
    preflight: evidence.preflight ?? null,
    authorityPolicy: authorityPolicy(null),
    diagnostics: normalizedDiagnostics(diagnostics),
  });
}

function authorityPolicy(projection) {
  return {
    rawStress: 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS',
    projectedStress: projection ? 'NON_AUTHORITATIVE_REVIEW_PROJECTION' : 'NOT_GENERATED',
    projectedStressForConvergence: 'PROHIBITED',
  };
}

function combinedDiagnostics(...artifacts) {
  return artifacts.flatMap((artifact) => artifact?.diagnostics ?? []);
}

function normalizedDiagnostics(rows) {
  return Array.isArray(rows) && rows.length
    ? rows
    : [{ severity: 'ERROR', code: 'LFEA_PIPELINE_REJECTED', message: 'LFEA pipeline rejected without diagnostic evidence.' }];
}

function errorDiagnostic(error) {
  return {
    severity: 'ERROR',
    code: error?.code ?? 'LFEA_PIPELINE_FAILURE',
    message: error instanceof Error ? error.message : 'Unknown LFEA pipeline failure.',
  };
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
