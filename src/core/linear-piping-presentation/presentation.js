import { exactKeys } from '../shared-analysis-contract/validation.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { validateLinearPipingAnalysisResult } from '../linear-piping-analysis-consumer/index.js';
import {
  requireLinearPipingInterfaceRecovery,
  requireLinearPipingInterfaceSet,
} from '../linear-piping-interface/index.js';
import {
  requireLinearPipingB31Application,
  requireLinearPipingQualifiedApplicationResult,
  requireNozzleAllowableAssessment,
} from '../linear-piping-code-application/index.js';
import {
  PIPING_PRESENTATION_SCHEMA,
  PRESENTATION_CURRENCY,
  compareAscii,
  computePresentationEvidenceHash,
  computePresentationSemanticHash,
  failPresentation,
  requireArray,
  requireLinearPipingPresentation,
} from './contracts.js';

export const PRESENTATION_INPUT_KEYS = Object.freeze([
  'applicationResult',
  'analysisResults',
  'interfaceSet',
  'interfaceRecoveries',
  'nozzleAssessments',
  'b31Application',
]);

export const ANALYSIS_ROW_KEYS = Object.freeze([
  'analysisIdentity',
  'analysisRevision',
  'status',
  'physicalLoadCaseHash',
  'executionHash',
  'recoveryHash',
  'analysisResultSemanticHash',
  'evidenceHash',
]);
export const INTERFACE_ROW_KEYS = Object.freeze([
  'interfaceId',
  'interfaceKind',
  'nodeId',
  'loadCaseId',
  'status',
  'frameSemanticHash',
  'reportingSignConvention',
  'units',
  'forceGlobal',
  'momentAtNodeGlobal',
  'forceLocal',
  'momentAtReferenceLocal',
  'referencePointGlobal',
  'leverReferenceToNodeLocal',
  'resultSemanticHash',
  'recoverySemanticHash',
  'recoveryEvidenceHash',
]);
export const NOZZLE_ROW_KEYS = Object.freeze([
  'profileId',
  'profileSemanticHash',
  'interfaceId',
  'loadCaseId',
  'reportingSignConvention',
  'units',
  'forceLocal',
  'momentAtReferenceLocal',
  'governingTerm',
  'interactionValue',
  'interactionLimit',
  'utilization',
  'assessmentStatus',
  'qualificationStatus',
  'semanticHash',
  'evidenceHash',
]);
export const CODE_ROW_KEYS = Object.freeze([
  'checkId',
  'category',
  'componentId',
  'codePointId',
  'combinationId',
  'status',
  'calculatedStress',
  'allowableStress',
  'utilization',
  'governingRuleId',
  'sourceRecoveryHashes',
  'semanticHash',
  'evidenceHash',
]);

export function compileLinearPipingPresentation(input) {
  exactKeys(input, PRESENTATION_INPUT_KEYS, 'linearPipingPresentationInput');
  const applicationResult = requireLinearPipingQualifiedApplicationResult(input.applicationResult);
  const analysisResults = requireArray(input.analysisResults, 'linearPipingPresentationInput.analysisResults')
    .map(validateLinearPipingAnalysisResult)
    .sort((left, right) => compareAscii(left.semanticHash, right.semanticHash));
  const interfaceSet = requireLinearPipingInterfaceSet(input.interfaceSet);
  const interfaceRecoveries = requireArray(
    input.interfaceRecoveries,
    'linearPipingPresentationInput.interfaceRecoveries',
  ).map(requireLinearPipingInterfaceRecovery)
    .sort((left, right) => compareAscii(left.semanticHash, right.semanticHash));
  const nozzleAssessments = requireArray(
    input.nozzleAssessments,
    'linearPipingPresentationInput.nozzleAssessments',
  ).map(requireNozzleAllowableAssessment)
    .sort((left, right) => compareAscii(left.interfaceId, right.interfaceId));
  const b31Application = requireLinearPipingB31Application(input.b31Application);

  requireCurrentApplicationChain({
    applicationResult,
    analysisResults,
    interfaceSet,
    interfaceRecoveries,
    nozzleAssessments,
    b31Application,
  });

  const analysisRows = analysisResults.map((result) => deepFreeze({
    analysisIdentity: result.analysisIdentity,
    analysisRevision: result.analysisRevision,
    status: result.status,
    physicalLoadCaseHash: result.parents.physicalLoadCaseHash,
    executionHash: result.execution.executionHash,
    recoveryHash: result.recovery.semanticHash,
    analysisResultSemanticHash: result.semanticHash,
    evidenceHash: result.evidenceHash,
  }));
  const interfaceRows = interfaceRecoveries.flatMap((recovery) => recovery.results.map((result) => deepFreeze({
    interfaceId: result.interfaceId,
    interfaceKind: result.interfaceKind,
    nodeId: result.nodeId,
    loadCaseId: recovery.loadCaseId,
    status: recovery.status,
    frameSemanticHash: result.frameSemanticHash,
    reportingSignConvention: result.reportingSignConvention,
    units: recovery.units,
    forceGlobal: result.forceGlobal,
    momentAtNodeGlobal: result.momentAtNodeGlobal,
    forceLocal: result.forceLocal,
    momentAtReferenceLocal: result.momentAtReferenceLocal,
    referencePointGlobal: result.referencePointGlobal,
    leverReferenceToNodeLocal: result.leverReferenceToNodeLocal,
    resultSemanticHash: result.semanticHash,
    recoverySemanticHash: recovery.semanticHash,
    recoveryEvidenceHash: recovery.evidenceHash,
  }))).sort(interfaceRowOrder);
  const nozzleRows = nozzleAssessments.map((assessment) => deepFreeze({
    profileId: assessment.profileId,
    profileSemanticHash: assessment.profileSemanticHash,
    interfaceId: assessment.interfaceId,
    loadCaseId: assessment.loadCaseId,
    reportingSignConvention: assessment.reportingSignConvention,
    units: assessment.units,
    forceLocal: assessment.forceLocal,
    momentAtReferenceLocal: assessment.momentAtReferenceLocal,
    governingTerm: assessment.governingTerm,
    interactionValue: assessment.interactionValue,
    interactionLimit: assessment.interactionLimit,
    utilization: assessment.utilization,
    assessmentStatus: assessment.assessmentStatus,
    qualificationStatus: assessment.qualificationStatus,
    semanticHash: assessment.semanticHash,
    evidenceHash: assessment.evidenceHash,
  }));
  const codeRows = b31Application.results.map((entry) => deepFreeze({
    checkId: entry.checkId,
    category: entry.codeResult.category,
    componentId: entry.codeResult.componentId,
    codePointId: entry.codeResult.codePointId,
    combinationId: entry.codeResult.combinationId,
    status: entry.codeResult.status,
    calculatedStress: entry.codeResult.calculatedStress,
    allowableStress: entry.codeResult.allowableStress,
    utilization: entry.codeResult.utilization,
    governingRuleId: entry.codeResult.governingRuleId,
    sourceRecoveryHashes: entry.sourceRecoveryHashes,
    semanticHash: entry.codeResult.semanticHash,
    evidenceHash: entry.codeResult.evidenceHash,
  })).sort((left, right) => compareAscii(left.checkId, right.checkId));

  const draft = {
    schema: PIPING_PRESENTATION_SCHEMA,
    applicationId: applicationResult.applicationId,
    applicationResultSemanticHash: applicationResult.semanticHash,
    applicationResultEvidenceHash: applicationResult.evidenceHash,
    currency: PRESENTATION_CURRENCY,
    status: applicationResult.status,
    exportEligibility: applicationResult.status === 'QUALIFIED'
      && applicationResult.notConfigured.length === 0
      ? 'ENGINEERING_EXPORT_ALLOWED'
      : 'AUDIT_ONLY_CONDITIONAL',
    summary: deepFreeze({
      analysisCount: analysisRows.length,
      interfaceResultCount: interfaceRows.length,
      nozzleAssessmentCount: nozzleRows.length,
      codeCheckCount: codeRows.length,
      ...applicationResult.assessmentSummary,
    }),
    analysisRows: deepFreeze(analysisRows),
    interfaceRows: deepFreeze(interfaceRows),
    nozzleRows: deepFreeze(nozzleRows),
    codeRows: deepFreeze(codeRows),
    notConfigured: applicationResult.notConfigured,
    limitations: applicationResult.limitations,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computePresentationSemanticHash(draft);
  draft.evidenceHash = computePresentationEvidenceHash(draft);
  return requireLinearPipingPresentation(draft);
}

function requireCurrentApplicationChain(input) {
  requireExactHashList(
    input.applicationResult.analysisResultSemanticHashes,
    input.analysisResults.map((row) => row.semanticHash),
    'PIPING_PRESENTATION_ANALYSIS_STALE',
  );
  requireExactHashList(
    input.applicationResult.analysisEvidenceHashes,
    input.analysisResults.map((row) => row.evidenceHash),
    'PIPING_PRESENTATION_ANALYSIS_EVIDENCE_STALE',
  );
  if (input.applicationResult.interfaceSetSemanticHash !== input.interfaceSet.semanticHash) {
    failPresentation('Interface set is stale against the application result.', 'PIPING_PRESENTATION_INTERFACE_SET_STALE');
  }
  requireExactHashList(
    input.applicationResult.interfaceRecoverySemanticHashes,
    input.interfaceRecoveries.map((row) => row.semanticHash),
    'PIPING_PRESENTATION_INTERFACE_RECOVERY_STALE',
  );
  requireExactHashList(
    input.applicationResult.interfaceRecoveryEvidenceHashes,
    input.interfaceRecoveries.map((row) => row.evidenceHash),
    'PIPING_PRESENTATION_INTERFACE_EVIDENCE_STALE',
  );
  requireExactHashList(
    input.applicationResult.nozzleAssessmentSemanticHashes,
    input.nozzleAssessments.map((row) => row.semanticHash),
    'PIPING_PRESENTATION_NOZZLE_STALE',
  );
  requireExactHashList(
    input.applicationResult.nozzleAssessmentEvidenceHashes,
    input.nozzleAssessments.map((row) => row.evidenceHash),
    'PIPING_PRESENTATION_NOZZLE_EVIDENCE_STALE',
  );
  if (input.applicationResult.b31ApplicationSemanticHash !== input.b31Application.semanticHash
    || input.applicationResult.b31ApplicationEvidenceHash !== input.b31Application.evidenceHash) {
    failPresentation('B31 application is stale against the application result.', 'PIPING_PRESENTATION_B31_STALE');
  }
}

function requireExactHashList(expected, actual, code) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    failPresentation('Current parent hash set does not match the sealed application result.', code, {
      expected,
      actual,
    });
  }
}

function interfaceRowOrder(left, right) {
  return compareAscii(left.interfaceId, right.interfaceId)
    || compareAscii(left.loadCaseId, right.loadCaseId)
    || compareAscii(left.recoverySemanticHash, right.recoverySemanticHash);
}
