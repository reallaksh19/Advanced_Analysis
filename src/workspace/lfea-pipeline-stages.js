/**
 * Fail-closed staged LFEA execution.
 *
 * Every stage consumes only qualified predecessor evidence. Progress callbacks
 * expose stage boundaries; they never alter numerical inputs or results.
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
import {
  PREFLIGHT_STATUS,
  preflightMeshPackage,
} from './lfea-preflight.js';

export const LFEA_PIPELINE_STAGES = Object.freeze([
  'VALIDATE',
  'PREFLIGHT',
  'ADAPT',
  'SOLVE',
  'PROJECT',
  'REVIEW',
  'EXPORT',
]);

export function runLfeaPipelineStages(input) {
  const notify = typeof input.onProgress === 'function'
    ? input.onProgress
    : () => {};
  const evidence = {};
  try {
    notify(stageEvent('VALIDATE', 0));
    evidence.packageValue = normalizeLfeaMeshPackage(input.packageInput);
    const includeProjection = input.includeProjectedStress;

    notify(stageEvent('PREFLIGHT', 1));
    evidence.preflight = preflightMeshPackage(
      evidence.packageValue,
      input.adapterProfile,
      input.reviewProfile,
    );
    if (evidence.preflight.status === PREFLIGHT_STATUS.BLOCKED) {
      return failedExecution(
        'PREFLIGHT',
        evidence.preflight.blockers.map(capacityDiagnostic),
        evidence,
      );
    }

    notify(stageEvent('ADAPT', 2));
    evidence.adapterResult = adaptMeshPackage(
      evidence.packageValue,
      input.adapterProfile,
    );
    if (evidence.adapterResult.status !== 'ACCEPTED') {
      return failedExecution(
        'ADAPTER',
        evidence.adapterResult.diagnostics,
        evidence,
      );
    }
    evidence.model = evidence.adapterResult.qualifiedModel;

    notify(stageEvent('SOLVE', 3));
    evidence.result = solveContinuumModel(
      evidence.model,
      evidence.packageValue.analysisDefinition.loadCase.loadCaseId,
    );
    if (evidence.result.status !== 'QUALIFIED') {
      return failedExecution('SOLVER', evidence.result.diagnostics, evidence);
    }
    if (input.untilStage === 'SOLVE'
      || evidence.preflight.status === PREFLIGHT_STATUS.EXPORT_AT_RISK) {
      return solvedExecution(evidence);
    }

    notify(stageEvent('PROJECT', 4));
    evidence.stressProjection = includeProjection
      ? projectStress(evidence.model, evidence.result)
      : null;

    notify(stageEvent('REVIEW', 5));
    evidence.reviewInput = reviewInputFor(evidence, input);
    evidence.review = createEngineeringReview(
      evidence.reviewInput,
      input.reviewProfile,
    );
    if (evidence.review.status !== 'QUALIFIED_FOR_REVIEW') {
      return failedExecution('REVIEW', evidence.review.diagnostics, evidence);
    }

    notify(stageEvent('EXPORT', 6));
    evidence.evidenceExport = createEvidenceExport(
      evidence.review,
      evidence.reviewInput,
      input.reviewProfile,
    );
    if (evidence.evidenceExport.status !== 'QUALIFIED_EXPORT') {
      return failedExecution(
        'EXPORT',
        evidence.evidenceExport.diagnostics,
        evidence,
      );
    }
    notify(stageEvent('COMPLETE', LFEA_PIPELINE_STAGES.length));
    return qualifiedExecution(evidence);
  } catch (error) {
    return failedExecution('VALIDATION', [errorDiagnostic(error)], evidence);
  }
}

function capacityDiagnostic(blocker) {
  return {
    severity: 'ERROR',
    code: `LFEA_CAPACITY_${blocker.limitId}`,
    message: `${blocker.limitId} requested ${blocker.requested}; declared limit ${blocker.allowed}.`,
  };
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

function reviewInputFor(evidence, input) {
  const base = {
    schema: 'lfea-review-input/v1',
    reviewIdentity: `${evidence.model.modelIdentity}:WORKBENCH_REVIEW`,
    reviewVersion: '1',
    adapterResult: evidence.adapterResult,
    model: evidence.model,
    result: evidence.result,
    convergenceStudy: input.convergenceStudy ?? null,
    convergenceResult: input.convergenceResult ?? null,
    stressProjection: evidence.stressProjection,
    sourceReferences: evidence.packageValue.sourceReferences,
  };
  return createReviewInput({ ...base, semanticHash: semanticHash(base) });
}

function qualifiedExecution(evidence) {
  return deepFreeze({
    schema: 'lfea-workbench-execution/v1',
    status: 'QUALIFIED',
    failedStage: null,
    ...evidence,
    authorityPolicy: authorityPolicy(evidence.stressProjection),
    diagnostics: combinedDiagnostics(
      evidence.adapterResult,
      evidence.result,
      evidence.review,
    ),
  });
}

function solvedExecution(evidence) {
  return deepFreeze({
    schema: 'lfea-workbench-execution/v1',
    status: 'QUALIFIED',
    failedStage: null,
    ...evidence,
    stressProjection: null,
    reviewInput: null,
    review: null,
    evidenceExport: null,
    authorityPolicy: authorityPolicy(null),
    diagnostics: combinedDiagnostics(evidence.adapterResult, evidence.result),
  });
}

function failedExecution(failedStage, diagnostics, evidence) {
  const fields = [
    'packageValue',
    'adapterResult',
    'model',
    'result',
    'stressProjection',
    'reviewInput',
    'review',
    'evidenceExport',
    'preflight',
  ];
  const retained = Object.fromEntries(
    fields.map((field) => [field, evidence[field] ?? null]),
  );
  return deepFreeze({
    schema: 'lfea-workbench-execution/v1',
    status: 'FAILED',
    failedStage,
    ...retained,
    authorityPolicy: authorityPolicy(null),
    diagnostics: normalizedDiagnostics(diagnostics),
  });
}

function authorityPolicy(projection) {
  return {
    rawStress: 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS',
    projectedStress: projection
      ? 'NON_AUTHORITATIVE_REVIEW_PROJECTION'
      : 'NOT_GENERATED',
    projectedStressForConvergence: 'PROHIBITED',
  };
}

function stageEvent(stage, index) {
  return {
    stage,
    index,
    total: LFEA_PIPELINE_STAGES.length,
  };
}

function combinedDiagnostics(...artifacts) {
  return artifacts.flatMap((artifact) => artifact?.diagnostics ?? []);
}

function normalizedDiagnostics(rows) {
  return Array.isArray(rows) && rows.length
    ? rows
    : [{
      severity: 'ERROR',
      code: 'LFEA_PIPELINE_REJECTED',
      message: 'LFEA pipeline rejected without diagnostic evidence.',
    }];
}

function errorDiagnostic(error) {
  return {
    severity: 'ERROR',
    code: error?.code ?? 'LFEA_PIPELINE_FAILURE',
    message: error instanceof Error
      ? error.message
      : 'Unknown LFEA pipeline failure.',
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
