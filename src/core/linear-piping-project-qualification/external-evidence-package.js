import { exactKeys } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireLinearPipingQualifiedApplicationResult } from '../linear-piping-code-application/index.js';
import { requireCurrentLinearPipingPresentation } from '../linear-piping-presentation/index.js';
import { SELECTOR_KINDS, compareAscii, failQualification } from './contracts.js';
import { requireLinearPipingQualificationComparison } from './comparison.js';
import {
  RELEASE_REVIEW_DECISION,
  canonicalArtifactReference,
  requireExternalText,
  requireHash,
  requireHead,
  requirePerformanceEvidence,
  requireReleaseReviewDisposition,
  requireRollbackEvidence,
} from './external-evidence-contracts.js';

export const EXTERNAL_QUALIFICATION_PACKAGE_REQUEST_SCHEMA =
  'linear-piping-external-qualification-package-request/v1';
export const EXTERNAL_QUALIFICATION_PACKAGE_SCHEMA =
  'linear-piping-external-qualification-package/v1';
export const EXTERNAL_PACKAGE_STATUS = 'ELIGIBLE_FOR_RELEASE_REVIEW';
export const EXTERNAL_PACKAGE_INPUT_KEYS = Object.freeze([
  'schema', 'packageId', 'exactHead', 'applicationResult', 'presentation',
  'realModelReconciliation', 'commercialCorroboration', 'performanceEvidence',
  'rollbackEvidence', 'reviewDisposition', 'artifactReferences',
]);
export const EXTERNAL_PACKAGE_KEYS = Object.freeze([
  'schema', 'packageId', 'exactHead', 'applicationResultSemanticHash',
  'applicationResultEvidenceHash', 'presentationSemanticHash',
  'presentationEvidenceHash', 'requiredSelectorKinds', 'realModelReconciliation',
  'commercialCorroboration', 'performanceEvidence', 'rollbackEvidence',
  'reviewDisposition', 'artifactReferences', 'status', 'semanticHash', 'evidenceHash',
]);
export const EXTERNAL_ARTIFACT_MAP_KEYS = Object.freeze([
  'realModelReconciliation', 'commercialCorroboration', 'performanceEvidence',
  'rollbackEvidence', 'signedDisposition',
]);

export function compileLinearPipingExternalQualificationPackage(input) {
  exactKeys(input, EXTERNAL_PACKAGE_INPUT_KEYS, 'externalQualificationPackageInput');
  if (input.schema !== EXTERNAL_QUALIFICATION_PACKAGE_REQUEST_SCHEMA) {
    failQualification('External package request is invalid.', 'PIPING_EXTERNAL_PACKAGE_REQUEST_INVALID');
  }
  const exactHead = requireHead(input.exactHead, 'externalQualificationPackageInput.exactHead');
  const applicationResult = requireLinearPipingQualifiedApplicationResult(input.applicationResult);
  const presentation = requireCurrentLinearPipingPresentation(input.presentation, applicationResult);
  const realModelReconciliation = requireComparison(
    input.realModelReconciliation,
    'REAL_MODEL_RECONCILIATION',
    applicationResult,
    presentation,
  );
  const commercialCorroboration = requireComparison(
    input.commercialCorroboration,
    'COMMERCIAL_CORROBORATION',
    applicationResult,
    presentation,
  );
  const parents = {
    applicationResultSemanticHash: applicationResult.semanticHash,
    applicationResultEvidenceHash: applicationResult.evidenceHash,
    presentationSemanticHash: presentation.semanticHash,
    presentationEvidenceHash: presentation.evidenceHash,
  };
  requireAuthorityEligibility(realModelReconciliation, commercialCorroboration, parents);
  const requiredSelectorKinds = deriveRequiredSelectorKinds(presentation);
  requireSelectorCoverage(realModelReconciliation, requiredSelectorKinds, 'realModelReconciliation');
  requireSelectorCoverage(commercialCorroboration, requiredSelectorKinds, 'commercialCorroboration');
  const performanceEvidence = requirePerformanceEvidence(input.performanceEvidence);
  requirePerformanceEligible(performanceEvidence, exactHead);
  const rollbackEvidence = requireRollbackEvidence(input.rollbackEvidence);
  requireRollbackEligible(rollbackEvidence, exactHead);
  const reviewDisposition = requireReleaseReviewDisposition(input.reviewDisposition);
  if (reviewDisposition.exactHead !== exactHead
    || reviewDisposition.decision !== RELEASE_REVIEW_DECISION) {
    failQualification('Release-review disposition is stale.', 'PIPING_EXTERNAL_PACKAGE_DISPOSITION_MISMATCH');
  }
  const artifactReferences = canonicalArtifactMap(input.artifactReferences, {
    realModelReconciliation,
    commercialCorroboration,
    performanceEvidence,
    rollbackEvidence,
    signedDisposition: reviewDisposition,
  });
  const draft = {
    schema: EXTERNAL_QUALIFICATION_PACKAGE_SCHEMA,
    packageId: requireExternalText(input.packageId, 'externalQualificationPackageInput.packageId'),
    exactHead,
    ...parents,
    requiredSelectorKinds,
    realModelReconciliation,
    commercialCorroboration,
    performanceEvidence,
    rollbackEvidence,
    reviewDisposition,
    artifactReferences,
    status: EXTERNAL_PACKAGE_STATUS,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(externalPackageSemanticProjection(draft));
  draft.evidenceHash = computeExternalPackageEvidenceHash(draft);
  return requireLinearPipingExternalQualificationPackage(draft);
}

export function requireLinearPipingExternalQualificationPackage(record) {
  exactKeys(record, EXTERNAL_PACKAGE_KEYS, 'externalQualificationPackage');
  if (record.schema !== EXTERNAL_QUALIFICATION_PACKAGE_SCHEMA
    || record.status !== EXTERNAL_PACKAGE_STATUS) {
    failQualification('External package is invalid.', 'PIPING_EXTERNAL_PACKAGE_INVALID');
  }
  requireExternalText(record.packageId, 'externalQualificationPackage.packageId');
  requireHead(record.exactHead, 'externalQualificationPackage.exactHead');
  for (const field of [
    'applicationResultSemanticHash', 'applicationResultEvidenceHash',
    'presentationSemanticHash', 'presentationEvidenceHash', 'semanticHash', 'evidenceHash',
  ]) requireHash(record[field], `externalQualificationPackage.${field}`);
  const requiredSelectorKinds = requireSelectorKindArray(record.requiredSelectorKinds);
  const realModelReconciliation = requireLinearPipingQualificationComparison(record.realModelReconciliation);
  const commercialCorroboration = requireLinearPipingQualificationComparison(record.commercialCorroboration);
  requireComparisonHashes(realModelReconciliation, record);
  requireComparisonHashes(commercialCorroboration, record);
  if (realModelReconciliation.qualificationKind !== 'REAL_MODEL_RECONCILIATION'
    || commercialCorroboration.qualificationKind !== 'COMMERCIAL_CORROBORATION'
    || realModelReconciliation.status !== 'PASS'
    || commercialCorroboration.status !== 'PASS') {
    failQualification('External comparisons are invalid.', 'PIPING_EXTERNAL_PACKAGE_COMPARISON_INVALID');
  }
  requireAuthorityEligibility(realModelReconciliation, commercialCorroboration, record);
  requireSelectorCoverage(realModelReconciliation, requiredSelectorKinds, 'realModelReconciliation');
  requireSelectorCoverage(commercialCorroboration, requiredSelectorKinds, 'commercialCorroboration');
  const performanceEvidence = requirePerformanceEvidence(record.performanceEvidence);
  requirePerformanceEligible(performanceEvidence, record.exactHead);
  const rollbackEvidence = requireRollbackEvidence(record.rollbackEvidence);
  requireRollbackEligible(rollbackEvidence, record.exactHead);
  const reviewDisposition = requireReleaseReviewDisposition(record.reviewDisposition);
  if (reviewDisposition.exactHead !== record.exactHead) {
    failQualification('External disposition head is stale.', 'PIPING_EXTERNAL_PACKAGE_DISPOSITION_MISMATCH');
  }
  const artifactReferences = canonicalArtifactMap(record.artifactReferences, {
    realModelReconciliation,
    commercialCorroboration,
    performanceEvidence,
    rollbackEvidence,
    signedDisposition: reviewDisposition,
  });
  const accepted = {
    ...record,
    requiredSelectorKinds,
    realModelReconciliation,
    commercialCorroboration,
    performanceEvidence,
    rollbackEvidence,
    reviewDisposition,
    artifactReferences,
  };
  if (record.semanticHash !== semanticHash(externalPackageSemanticProjection(accepted))
    || record.evidenceHash !== computeExternalPackageEvidenceHash(accepted)) {
    failQualification('External package hashes are stale.', 'PIPING_EXTERNAL_PACKAGE_HASH_MISMATCH');
  }
  return deepFreeze(accepted);
}

function requireComparison(record, expectedKind, applicationResult, presentation) {
  const accepted = requireLinearPipingQualificationComparison(record);
  if (accepted.qualificationKind !== expectedKind || accepted.status !== 'PASS') {
    failQualification('Required comparison is not passing.', 'PIPING_EXTERNAL_PACKAGE_COMPARISON_INVALID');
  }
  if (accepted.applicationResultSemanticHash !== applicationResult.semanticHash
    || accepted.applicationResultEvidenceHash !== applicationResult.evidenceHash
    || accepted.presentationSemanticHash !== presentation.semanticHash
    || accepted.presentationEvidenceHash !== presentation.evidenceHash) {
    failQualification('Comparison is stale against the current application.', 'PIPING_EXTERNAL_PACKAGE_COMPARISON_STALE');
  }
  return accepted;
}

function requireAuthorityEligibility(realModel, commercial, parents) {
  for (const comparison of [realModel, commercial]) {
    Object.entries(comparison.authority).forEach(([key, value]) => {
      if (typeof value === 'string' && key !== 'sourceSemanticHash') {
        requireExternalText(value, `qualificationAuthority.${key}`);
      }
    });
  }
  const realAuthority = realModel.authority;
  const commercialAuthority = commercial.authority;
  if (realAuthority.sourceSemanticHash === commercialAuthority.sourceSemanticHash
    || realAuthority.runId === commercialAuthority.runId
    || realAuthority.productOrMethod === commercialAuthority.productOrMethod) {
    failQualification('G8 and G9 authorities must be independent.', 'PIPING_EXTERNAL_PACKAGE_AUTHORITY_NOT_INDEPENDENT');
  }
  const prohibitedHashes = new Set([
    parents.applicationResultSemanticHash,
    parents.applicationResultEvidenceHash,
    parents.presentationSemanticHash,
    parents.presentationEvidenceHash,
    ...realModel.comparisons.map((row) => row.applicationValue.sourceSemanticHash),
    ...commercial.comparisons.map((row) => row.applicationValue.sourceSemanticHash),
  ]);
  if (prohibitedHashes.has(realAuthority.sourceSemanticHash)
    || prohibitedHashes.has(commercialAuthority.sourceSemanticHash)) {
    failQualification('Authority hash aliases application evidence.', 'PIPING_EXTERNAL_PACKAGE_AUTHORITY_NOT_INDEPENDENT');
  }
}

function deriveRequiredSelectorKinds(presentation) {
  const required = [];
  if (presentation.interfaceRows.length > 0) {
    required.push('INTERFACE_FORCE_LOCAL', 'INTERFACE_MOMENT_REFERENCE_LOCAL');
  }
  if (presentation.nozzleRows.length > 0) required.push('NOZZLE_UTILIZATION');
  if (presentation.codeRows.length > 0) required.push('B31_CALCULATED_STRESS', 'B31_UTILIZATION');
  if (required.length === 0) {
    failQualification('Presentation has no qualification quantities.', 'PIPING_EXTERNAL_PACKAGE_COVERAGE_EMPTY');
  }
  return deepFreeze(required.sort(compareAscii));
}

function requireSelectorKindArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    failQualification('Required selector kinds must be non-empty.', 'PIPING_EXTERNAL_PACKAGE_COVERAGE_INVALID');
  }
  const accepted = value.map((kind) => {
    if (!SELECTOR_KINDS.includes(kind)) {
      failQualification('Required selector kind is unsupported.', 'PIPING_EXTERNAL_PACKAGE_COVERAGE_INVALID');
    }
    return kind;
  }).sort(compareAscii);
  if (new Set(accepted).size !== accepted.length) {
    failQualification('Required selector kinds are duplicated.', 'PIPING_EXTERNAL_PACKAGE_COVERAGE_INVALID');
  }
  return deepFreeze(accepted);
}

function requireSelectorCoverage(comparison, requiredKinds, field) {
  const actual = new Set(comparison.comparisons.map((row) => row.selector.kind));
  const missing = requiredKinds.filter((kind) => !actual.has(kind));
  if (missing.length > 0) {
    failQualification(`${field} coverage is incomplete.`, 'PIPING_EXTERNAL_PACKAGE_COVERAGE_INVALID', { missing });
  }
}

function requireComparisonHashes(comparison, packageRecord) {
  if (comparison.applicationResultSemanticHash !== packageRecord.applicationResultSemanticHash
    || comparison.applicationResultEvidenceHash !== packageRecord.applicationResultEvidenceHash
    || comparison.presentationSemanticHash !== packageRecord.presentationSemanticHash
    || comparison.presentationEvidenceHash !== packageRecord.presentationEvidenceHash) {
    failQualification('Comparison parents do not match the package.', 'PIPING_EXTERNAL_PACKAGE_COMPARISON_STALE');
  }
}

function requirePerformanceEligible(record, exactHead) {
  if (record.exactHead !== exactHead || record.exceededLimits.length > 0) {
    failQualification('Performance evidence is not eligible.', 'PIPING_EXTERNAL_PACKAGE_PERFORMANCE_INVALID');
  }
  const envelope = record.declaredEnvelope;
  const model = record.modelEnvelope;
  if (model.nodeCount > envelope.maxNodes
    || model.elementCount > envelope.maxElements
    || model.loadCaseCount > envelope.maxLoadCases
    || record.memoryEvidence.peakResidentBytes > envelope.maxPeakResidentBytes
    || record.stageTimings.some((row) => row.durationMs > envelope.maxStageDurationMs)) {
    failQualification('Performance envelope was exceeded.', 'PIPING_EXTERNAL_PACKAGE_PERFORMANCE_INVALID');
  }
}

function requireRollbackEligible(record, exactHead) {
  if (record.qualifiedHead !== exactHead
    || record.restoredApplicationPath !== true
    || record.preservedProjectData !== true
    || record.postRollbackChecks.some((row) => row.status !== 'PASS')) {
    failQualification('Rollback evidence is not eligible.', 'PIPING_EXTERNAL_PACKAGE_ROLLBACK_INVALID');
  }
}

function canonicalArtifactMap(source, records) {
  exactKeys(source, EXTERNAL_ARTIFACT_MAP_KEYS, 'externalQualificationPackage.artifactReferences');
  const entries = Object.fromEntries(EXTERNAL_ARTIFACT_MAP_KEYS.map((key) => {
    const reference = canonicalArtifactReference(source[key], `artifactReferences.${key}`);
    const record = records[key];
    if (reference.recordSemanticHash !== record.semanticHash
      || reference.recordEvidenceHash !== record.evidenceHash) {
      failQualification('Artifact reference does not match its record.', 'PIPING_EVIDENCE_ARTIFACT_REFERENCE_MISMATCH');
    }
    return [key, reference];
  }));
  const paths = Object.values(entries).map((row) => row.path);
  if (new Set(paths).size !== paths.length) {
    failQualification('Evidence artifact paths must be unique.', 'PIPING_EVIDENCE_ARTIFACT_REFERENCE_DUPLICATE');
  }
  return deepFreeze(entries);
}

export function externalPackageSemanticProjection(record) {
  return {
    schema: record.schema,
    packageId: record.packageId,
    exactHead: record.exactHead,
    applicationResultSemanticHash: record.applicationResultSemanticHash,
    applicationResultEvidenceHash: record.applicationResultEvidenceHash,
    presentationSemanticHash: record.presentationSemanticHash,
    presentationEvidenceHash: record.presentationEvidenceHash,
    requiredSelectorKinds: record.requiredSelectorKinds,
    realModelReconciliationSemanticHash: record.realModelReconciliation.semanticHash,
    commercialCorroborationSemanticHash: record.commercialCorroboration.semanticHash,
    performanceEvidenceSemanticHash: record.performanceEvidence.semanticHash,
    rollbackEvidenceSemanticHash: record.rollbackEvidence.semanticHash,
    reviewDispositionSemanticHash: record.reviewDisposition.semanticHash,
    artifactReferences: record.artifactReferences,
    status: record.status,
  };
}

export function computeExternalPackageEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    evidenceHashes: [
      record.realModelReconciliation.evidenceHash,
      record.commercialCorroboration.evidenceHash,
      record.performanceEvidence.evidenceHash,
      record.rollbackEvidence.evidenceHash,
      record.reviewDisposition.evidenceHash,
    ],
    artifactContentHashes: EXTERNAL_ARTIFACT_MAP_KEYS.map(
      (key) => record.artifactReferences[key].contentHash,
    ),
  });
}
