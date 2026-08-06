import { deepFreeze, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import { calculateOwnerProcedure, canonicalizeInput, relativeDifference } from '../nc06-package/engine.mjs';
import { oracleLedger } from '../nc06-package/oracle.mjs';
import { REPORT_SECTIONS } from '../nc06-package/config.mjs';
import { REQUIRED_REPORT_SECTIONS } from '../../src/core/nonlinear-shell-contact/synthetic-case-assessment-contract.js';
import { CASE_DEFINITION_HASH, SYNTHETIC_CASE } from './config.mjs';
import { reviewSyntheticCase } from './review-oracle.mjs';

export function executeSyntheticCase(upstreamBinding, exactHeadSha) {
  const canonical = canonicalizeInput('M_MPA', SYNTHETIC_CASE.input);
  const ledger = calculateOwnerProcedure(canonical);
  const oracleRaw = oracleLedger(canonical);
  const oracle = { schema: 'lafea-nc07-independent-oracle/v2', raw: oracleRaw };
  const comparisonKeys = ['depthRatio','permanentFraction','pressureElasticRatio','diameterToThickness','lengthToDiameter'];
  const equationRelativeError = Math.max(...comparisonKeys.map((key) => relativeDifference(ledger.raw[key], oracle.raw[key])));
  const calculationLedger = seal({ schema:'lafea-nc07-calculation-ledger/v2', caseId:SYNTHETIC_CASE.id, exactHeadSha, basisHash:upstreamBinding.assessmentBasisHash, canonicalInputHash:semanticHash(canonical), ledger, oracle, equationRelativeError }, 'calculationLedgerHash');
  const measurementRecord = seal({ schema:'lafea-nc07-generated-input-record/v2', caseId:SYNTHETIC_CASE.id, sourceClass:SYNTHETIC_CASE.inputSourceClass, generatedFrom:'NC06_REGISTERED_INPUT_CONSTANTS', caseDefinitionHash:CASE_DEFINITION_HASH, canonicalInputHash:semanticHash(canonical), physicalMeasurementClaimed:false }, 'measurementRecordHash');
  const modelReceipt = seal({ schema:'lafea-nc07-model-receipt/v2', caseId:SYNTHETIC_CASE.id, nc05ReportHash:upstreamBinding.nc05ReportHash, nc06ReportHash:upstreamBinding.nc06ReportHash, qualifiedCellId:upstreamBinding.qualifiedCellId, assessmentBasisId:upstreamBinding.assessmentBasisId }, 'modelReceiptHash');
  const reviewOracle = reviewSyntheticCase({ caseNature:SYNTHETIC_CASE.caseNature, dispositionClass:'ENGINEERING_REVIEW_REQUIRED', realAssetDecisionAuthorized:false, productionUseAuthorized:false, equationRelativeError });
  const reviewRecord = seal({ schema:'lafea-nc07-simulated-review/v2', caseId:SYNTHETIC_CASE.id, recordClass:reviewOracle.reviewerClass, actorId:'SIMULATED-REVIEWER-A', independenceMode:reviewOracle.independenceMode, humanApprovalClaimed:reviewOracle.humanApprovalClaimed, findings:reviewOracle.findings, conclusion:reviewOracle.conclusion }, 'reviewRecordHash');
  const ownerDisposition = seal({ schema:'lafea-nc07-simulated-owner-disposition/v2', caseId:SYNTHETIC_CASE.id, recordClass:'SIMULATED_REPOSITORY_OWNER_TEST_ACTOR', actorId:'SIMULATED-OWNER-A', dispositionClass:'ENGINEERING_REVIEW_REQUIRED', realAssetDecisionAuthorized:false, automaticAcceptanceAuthorized:false, productionUseAuthorized:false }, 'ownerDispositionHash');
  const caseReport = seal({ schema:'lafea-nc07-synthetic-case-report/v2', caseId:SYNTHETIC_CASE.id, caseNature:SYNTHETIC_CASE.caseNature, sections:[...REQUIRED_REPORT_SECTIONS], packageReportSections:[...REPORT_SECTIONS], limitations:[...SYNTHETIC_CASE.limitations], calculationLedgerHash:calculationLedger.calculationLedgerHash, measurementRecordHash:measurementRecord.measurementRecordHash, modelReceiptHash:modelReceipt.modelReceiptHash, reviewRecordHash:reviewRecord.reviewRecordHash, ownerDispositionHash:ownerDisposition.ownerDispositionHash, dispositionClass:'ENGINEERING_REVIEW_REQUIRED' }, 'caseReportHash');
  const retentionRecord = seal({ schema:'lafea-nc07-retention-record/v2', caseId:SYNTHETIC_CASE.id, exactHeadSha, artifactClass:'REPOSITORY_TEST_ARTIFACT', retainedHashes:[measurementRecord.measurementRecordHash,modelReceipt.modelReceiptHash,calculationLedger.calculationLedgerHash,reviewRecord.reviewRecordHash,ownerDisposition.ownerDispositionHash,caseReport.caseReportHash].sort(), realAssetRecord:false }, 'retentionRecordHash');
  const caseRecord = seal({ schema:'lafea-nc07-synthetic-case-record/v2', id:SYNTHETIC_CASE.id, caseNature:SYNTHETIC_CASE.caseNature, assetId:SYNTHETIC_CASE.assetId, defectId:SYNTHETIC_CASE.defectId, assessmentBasisId:SYNTHETIC_CASE.assessmentBasisId, qualifiedCellId:SYNTHETIC_CASE.qualifiedCellId, inputSourceClass:SYNTHETIC_CASE.inputSourceClass, reviewRecordClass:reviewRecord.recordClass, ownerDispositionRecordClass:ownerDisposition.recordClass, dispositionClass:'ENGINEERING_REVIEW_REQUIRED', inputSetHash:semanticHash(canonical), measurementRecordHash:measurementRecord.measurementRecordHash, modelReceiptHash:modelReceipt.modelReceiptHash, calculationLedgerHash:calculationLedger.calculationLedgerHash, caseReportHash:caseReport.caseReportHash, reviewRecordHash:reviewRecord.reviewRecordHash, ownerDispositionHash:ownerDisposition.ownerDispositionHash, retentionRecordHash:retentionRecord.retentionRecordHash, realAssetDecisionAuthorized:false, productionUseAuthorized:false }, 'caseRecordHash');
  return deepFreeze({ canonical, calculationLedger, measurementRecord, modelReceipt, reviewRecord, ownerDisposition, caseReport, retentionRecord, caseRecord, equationRelativeError });
}
function seal(payload, hashField) { return deepFreeze({ ...payload, [hashField]: semanticHash(payload) }); }
