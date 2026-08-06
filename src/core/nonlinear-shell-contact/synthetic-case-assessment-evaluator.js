import { GIT_SHA_PATTERN, HASH_PATTERN, deepFreeze, semanticHash, verifySealedHash } from './contracts.js';
import {
  DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT, REQUIRED_NC07_DOMAINS,
  REQUIRED_REPORT_SECTIONS, validateSyntheticCaseAssessmentContract,
} from './synthetic-case-assessment-contract.js';

export function evaluateSyntheticCaseAssessment({
  contract = DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT,
  candidateExactHeadSha, implementationHash, upstreamBinding, caseRecord, evidence,
}) {
  validateSyntheticCaseAssessmentContract(contract);
  const blockers = [];
  if (!GIT_SHA_PATTERN.test(candidateExactHeadSha ?? '')) blockers.push('CANDIDATE_HEAD_INVALID');
  if (!HASH_PATTERN.test(implementationHash ?? '')) blockers.push('IMPLEMENTATION_HASH_INVALID');
  try { validateUpstream(upstreamBinding); } catch (error) { blockers.push(`UPSTREAM_BINDING_INVALID:${error.message}`); }
  try { validateCaseRecord(caseRecord, upstreamBinding); } catch (error) { blockers.push(`CASE_RECORD_INVALID:${error.message}`); }
  const rows = Array.isArray(evidence) ? evidence : [];
  const map = new Map(rows.map((row) => [row?.id, row]));
  if (map.size !== rows.length) blockers.push('EVIDENCE_DUPLICATE');
  for (const id of REQUIRED_NC07_DOMAINS) {
    const row = map.get(id);
    if (!row) { blockers.push(`EVIDENCE_MISSING:${id}`); continue; }
    try {
      verifySealedHash(row, 'evidenceHash');
      if (row.schema !== 'lafea-nc07-synthetic-case-evidence/v2' || row.exactHeadSha !== candidateExactHeadSha || row.implementationHash !== implementationHash || row.contractHash !== contract.syntheticCaseAssessmentContractHash || row.upstreamBindingHash !== upstreamBinding.semanticHash || row.caseRecordHash !== caseRecord.caseRecordHash) throw new Error('binding');
      checkDomain(id, row.metrics, contract);
    } catch (error) { blockers.push(`EVIDENCE_INVALID:${id}:${error.message}`); }
  }
  for (const row of rows) if (!REQUIRED_NC07_DOMAINS.includes(row?.id)) blockers.push(`EVIDENCE_UNKNOWN:${row?.id ?? 'UNKNOWN'}`);
  const qualified = blockers.length === 0;
  const payload = {
    schema: 'nonlinear-shell-contact-nc07-synthetic-report/v2',
    status: qualified ? 'NC07_SYNTHETIC_CASE_QUALIFIED' : 'NC07_BLOCKED',
    candidateExactHeadSha,
    syntheticCaseAssessmentContractHash: contract.syntheticCaseAssessmentContractHash,
    implementationHash,
    upstreamBindingHash: upstreamBinding?.semanticHash ?? null,
    registeredSyntheticCaseCount: caseRecord ? 1 : 0,
    qualifiedSyntheticCaseIds: qualified ? [caseRecord.id] : [],
    realAssetQualifiedCaseIds: [],
    evaluatedDomainCount: map.size,
    blockers: blockers.sort(),
    authority: {
      nc07ContractQualified: true,
      plasticDentingProcedureQualified: upstreamBinding?.plasticDentingProcedureQualified === true,
      codeAssessmentPackageQualified: upstreamBinding?.codeAssessmentPackageQualified === true,
      syntheticCaseAssessmentQualified: qualified,
      nc08Authorized: qualified,
      codeAssessmentQualified: false,
      realAssetAssessmentQualified: false,
      externalCodeComplianceQualified: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
      failurePressureQualified: false,
      moduleQualified: false,
      productionExecutionAuthorized: false,
      automaticAssetAcceptanceAuthorized: false,
      autonomousCaseDispositionAuthorized: false,
    },
  };
  return deepFreeze({ ...payload, reportSemanticHash: semanticHash(payload) });
}

function validateUpstream(value) {
  verifySealedHash(value, 'semanticHash');
  if (value.schema !== 'nonlinear-shell-contact-nc07-upstream-binding/v2') throw new Error('schema');
  if (value.plasticDentingProcedureQualified !== true || value.codeAssessmentPackageQualified !== true || value.nc07Authorized !== true) throw new Error('authority');
  if (value.qualifiedCellId !== 'NC05-CELL-DT40-LD2-PER0.04') throw new Error('cell');
  if (value.assessmentBasisId !== 'LAFEA-OP-DENT-001-REV0') throw new Error('basis');
  for (const key of ['nc05ReportHash','nc06ReportHash','nc05ArtifactDigest','nc06ArtifactDigest','assessmentBasisHash']) if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
}
function validateCaseRecord(value, upstream) {
  verifySealedHash(value, 'caseRecordHash');
  if (value.schema !== 'lafea-nc07-synthetic-case-record/v2') throw new Error('schema');
  if (value.caseNature !== 'SYNTHETIC_NON_PHYSICAL_DEMONSTRATION_ONLY') throw new Error('case nature');
  if (value.assetId !== 'SYNTHETIC-ASSET-DT40' || value.defectId !== 'SYNTHETIC-DENT-PER004') throw new Error('identity');
  if (value.assessmentBasisId !== upstream.assessmentBasisId || value.qualifiedCellId !== upstream.qualifiedCellId) throw new Error('upstream scope');
  if (value.inputSourceClass !== 'DETERMINISTIC_GENERATED_REGISTERED_CELL_VALUES') throw new Error('input source');
  if (value.reviewRecordClass !== 'SIMULATED_INDEPENDENT_TEST_ACTOR') throw new Error('review class');
  if (value.ownerDispositionRecordClass !== 'SIMULATED_REPOSITORY_OWNER_TEST_ACTOR') throw new Error('owner class');
  if (value.dispositionClass !== 'ENGINEERING_REVIEW_REQUIRED') throw new Error('disposition');
  if (value.realAssetDecisionAuthorized !== false || value.productionUseAuthorized !== false) throw new Error('authority');
  for (const key of ['inputSetHash','measurementRecordHash','modelReceiptHash','calculationLedgerHash','caseReportHash','reviewRecordHash','ownerDispositionHash','retentionRecordHash']) if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
}
function checkDomain(id, metrics, contract) {
  const zero = (key) => { if (metrics[key] !== 0) throw new Error(key); };
  const one = (key) => { if (metrics[key] !== 1) throw new Error(key); };
  const max = (key, limit) => { if (!Number.isFinite(metrics[key]) || metrics[key] < 0 || metrics[key] > limit) throw new Error(key); };
  switch (id) {
    case REQUIRED_NC07_DOMAINS[0]: one('nc05ReceiptBound'); one('nc06ReceiptBound'); zero('upstreamMismatchCount'); break;
    case REQUIRED_NC07_DOMAINS[1]: one('syntheticNatureDeclared'); one('identityHashMatch'); zero('physicalAssetClaimCount'); break;
    case REQUIRED_NC07_DOMAINS[2]: one('generatedInputProvenanceBound'); zero('unmappedInputCount'); zero('inferredPhysicalMeasurementCount'); max('unitConversionRelativeError', contract.maximumUnitConversionRelativeError); break;
    case REQUIRED_NC07_DOMAINS[3]: one('basisHashMatch'); one('applicabilityResolved'); zero('externalCodeClaimCount'); break;
    case REQUIRED_NC07_DOMAINS[4]: one('qualifiedCellMatch'); zero('nearestCellSubstitutionCount'); zero('outOfDomainInputCount'); break;
    case REQUIRED_NC07_DOMAINS[5]: one('calculationReproduced'); max('equationRelativeError', contract.maximumEquationRelativeError); max('ledgerRelativeDifference', contract.maximumLedgerRelativeDifference); break;
    case REQUIRED_NC07_DOMAINS[6]: if (!Number.isFinite(metrics.uncertaintyMarginImpact) || metrics.uncertaintyMarginImpact < contract.minimumNonBeneficialUncertaintyImpact) throw new Error('uncertaintyMarginImpact'); zero('beneficialUncertaintyViolationCount'); break;
    case REQUIRED_NC07_DOMAINS[7]: one('simulatedReviewerCount'); one('simulatedReviewerIndependenceConfirmed'); zero('humanApprovalClaimCount'); break;
    case REQUIRED_NC07_DOMAINS[8]: one('simulatedOwnerDispositionRecorded'); one('engineeringReviewRequired'); zero('automaticAcceptanceClaimCount'); zero('realAssetDecisionClaimCount'); break;
    case REQUIRED_NC07_DOMAINS[9]: if (metrics.reportSectionCoverageCount !== REQUIRED_REPORT_SECTIONS.length) throw new Error('reportSectionCoverageCount'); one('retentionHashMatch'); zero('missingTraceabilityCount'); break;
    default: throw new Error('unknown domain');
  }
}
