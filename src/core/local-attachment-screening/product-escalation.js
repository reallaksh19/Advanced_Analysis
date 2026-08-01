import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  SCREENING_APPLICABILITY_KINDS,
  SCREENING_PRODUCT_RESULT_SCHEMA,
  mergedScreeningProductLimitations,
  normalizeScreeningProductRequest,
  screeningProductExpectedLocations,
  screeningProductLocationKey,
} from './product-escalation-contract.js';

export function evaluateLocalAttachmentScreeningProduct(input) {
  const request = normalizeScreeningProductRequest(input);
  const supplied = new Map(request.applicabilityEvidence.map((row) => [
    screeningProductLocationKey(row),
    row,
  ]));
  const assessments = screeningProductExpectedLocations(request.screeningResult)
    .map((location) => {
      const evidence = supplied.get(screeningProductLocationKey(location));
      return evidence ? assessEvidence(evidence) : missingEvidence(location);
    });
  const overallState = assessments.some((row) => row.state === 'BLOCKED')
    ? 'BLOCKED'
    : assessments.some((row) => row.state === 'ESCALATE')
      ? 'ESCALATE'
      : 'PASS';
  const base = {
    schema: SCREENING_PRODUCT_RESULT_SCHEMA,
    assessmentIdentity: request.assessmentIdentity,
    assessmentVersion: request.assessmentVersion,
    sourceAuthority: {
      screeningRequestSemanticHash:
        request.screeningResult.semanticHashes.screeningRequestSemanticHash,
      screeningResultPayloadSemanticHash:
        request.screeningResult.semanticHashes.screeningResultPayloadSemanticHash,
    },
    assessments,
    overallState,
    qualification: {
      state: 'ACCEPTED',
      engineeringLevel: 'NOMINAL_SCREENING_APPLICABILITY_AND_ESCALATION_ONLY',
      codeAssessmentProduced: false,
      releaseQualified: false,
    },
    limitations: mergedScreeningProductLimitations(request.limitations),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function assessEvidence(evidence) {
  const byKind = new Map(evidence.checks.map((check) => [check.kind, check]));
  const missing = SCREENING_APPLICABILITY_KINDS
    .filter((kind) => !byKind.has(kind));
  const unresolved = evidence.checks
    .filter((check) => check.status === 'UNRESOLVED');
  const failed = evidence.checks.filter((check) => check.status === 'FAIL');
  const state = missing.length || unresolved.length
    ? 'BLOCKED'
    : failed.length ? 'ESCALATE' : 'PASS';
  const reasons = [
    ...missing.map((kind) => `MISSING:${kind}`),
    ...unresolved.map((check) => `UNRESOLVED:${check.kind}`),
    ...failed.map((check) => `FAILED:${check.kind}`),
  ].sort();
  return {
    screeningCaseId: evidence.screeningCaseId,
    evaluationLocationId: evidence.evaluationLocationId,
    state,
    reasons: reasons.length ? reasons : ['ALL_APPLICABILITY_CHECKS_PASS'],
    checks: evidence.checks,
  };
}

function missingEvidence(location) {
  return {
    ...location,
    state: 'BLOCKED',
    reasons: ['MISSING_APPLICABILITY_EVIDENCE'],
    checks: [],
  };
}
