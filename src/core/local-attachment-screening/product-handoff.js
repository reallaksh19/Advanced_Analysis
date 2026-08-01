import { createValidatedLafeaAnalyticalHandoff } from '../lafea-analytical-handoff.js';
import {
  exactScreeningProductRecord,
  screeningProductError,
  validateAcceptedScreeningResult,
  validateLocalAttachmentScreeningProduct,
} from './product-escalation-contract.js';

export function createLocalAttachmentScreeningHandoff(input) {
  const row = exactScreeningProductRecord(input, [
    'handoffIdentity', 'handoffVersion', 'screeningResult', 'productResult',
    'screeningCaseId', 'evaluationLocationId', 'targetStageId', 'targetSource',
    'targetLoadBindings', 'sourceReference', 'limitations',
  ], 'handoff');
  const screeningResult = validateAcceptedScreeningResult(row.screeningResult);
  const productResult = validateLocalAttachmentScreeningProduct(row.productResult);
  if (productResult.sourceAuthority.screeningResultPayloadSemanticHash
    !== screeningResult.semanticHashes.screeningResultPayloadSemanticHash) {
    throw screeningProductError(
      'SCREENING_HANDOFF_PARENT_MISMATCH',
      'productResult.sourceAuthority',
    );
  }
  const assessment = productResult.assessments.find((candidate) => (
    candidate.screeningCaseId === row.screeningCaseId
    && candidate.evaluationLocationId === row.evaluationLocationId
  ));
  if (!assessment || assessment.state !== 'ESCALATE') {
    throw screeningProductError(
      'SCREENING_HANDOFF_ESCALATION_REQUIRED',
      'productResult.assessments',
    );
  }
  const caseResult = screeningResult.screeningCases.find(
    (candidate) => candidate.screeningCaseId === row.screeningCaseId,
  );
  if (!caseResult) {
    throw screeningProductError(
      'SCREENING_HANDOFF_CASE_MISSING',
      'screeningCaseId',
    );
  }
  return createValidatedLafeaAnalyticalHandoff({
    handoffIdentity: row.handoffIdentity,
    handoffVersion: row.handoffVersion,
    sourceStageId: 'LAFEA.2',
    sourceResultHash:
      screeningResult.semanticHashes.screeningResultPayloadSemanticHash,
    governingRecord: {
      screeningCaseId: assessment.screeningCaseId,
      evaluationLocationId: assessment.evaluationLocationId,
      productState: assessment.state,
      reasons: assessment.reasons,
    },
    resultant: {
      coordinateSystem: 'PIPE_LOCAL',
      referencePoint: commonTargetPoint(screeningResult, caseResult),
      force: caseResult.combinedForceLocal,
      moment: caseResult.combinedMomentLocal,
    },
    targetStageId: row.targetStageId,
    targetSource: row.targetSource,
    targetLoadBindings: row.targetLoadBindings,
    sourceReference: row.sourceReference,
    limitations: row.limitations,
  });
}

function commonTargetPoint(result, caseResult) {
  const loadMap = new Map(
    result.sourceEvidence.foundationResult.transformedLoadCases
      .map((load) => [load.identity, load]),
  );
  const points = caseResult.mechanicalTerms.map(
    (term) => loadMap.get(term.loadCaseId)?.targetPointGlobal,
  );
  if (!points.length || points.some((point) => !Array.isArray(point))) {
    throw screeningProductError(
      'SCREENING_HANDOFF_REFERENCE_POINT_MISSING',
      'screeningCases',
    );
  }
  const first = points[0];
  if (points.some((point) => point.some(
    (value, index) => value !== first[index],
  ))) {
    throw screeningProductError(
      'SCREENING_HANDOFF_MIXED_REFERENCE_POINTS',
      'screeningCases',
    );
  }
  return [...first];
}
