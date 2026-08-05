import { sha256Bytes } from './contracts.js';
import {
  DEFAULT_CODE_ASSESSMENT_PACKAGE,
  REQUIRED_CODE_ASSESSMENT_DOMAINS,
  REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS,
} from './code-assessment-package-contract.js';

const hash = (value) => sha256Bytes(Buffer.from(value));

export const PASSING_NC06_PLASTIC_DENTING_RECEIPT = Object.freeze({
  plasticDentingProcedureQualified: true,
  qualifiedCellIds: ['TEST-CELL-A'],
  receiptHash: hash('qualified-plastic-denting-receipt-nc06'),
});

export function createPassingAssessmentBasisRegistry() {
  return [{
    id: 'TEST-BASIS-A',
    standardId: 'OWNER_APPROVED_LOCAL_DENT_ASSESSMENT',
    edition: 'CONTROLLED_EDITION',
    addenda: 'NONE',
    jurisdiction: 'OWNER_CONTROLLED',
    clauseSetHash: hash('test-clause-set'),
    approvedSourceHash: hash('test-approved-source'),
    applicabilityStatementHash: hash('test-applicability-statement'),
    unitProfile: 'SI',
    ownerApprovalHash: hash('test-owner-approval'),
    licensedSourceRedistributionAuthorized: false,
  }];
}

export function createPassingCodeAssessmentDomainEvidence(
  bases = createPassingAssessmentBasisRegistry(),
) {
  return bases.flatMap((basis) => REQUIRED_CODE_ASSESSMENT_DOMAINS.map((id, index) => ({
    id,
    basisId: basis.id,
    referenceHash: hash(`code-reference:${basis.id}:${id}`),
    rawEvidenceHash: hash(`code-raw:${basis.id}:${id}`),
    reviewerRecordHash: hash(`code-review:${basis.id}:${id}`),
    referenceUncertainty: 0.001,
    acceptanceTolerance: 0.01,
    observedDifference: 0.002 + index * 0.00001,
    equationRelativeError: 1e-10,
    unitConversionRelativeError: 1e-14,
    uncertaintyMarginImpact: 0.01,
    unresolvedApplicabilityCount: 0,
    outOfDomainInputCount: 0,
    unmappedInputCount: 0,
    independentReviewerCount: 1,
    independentReferenceCaseCount: 3,
    rejectionTestsPassed: true,
    reportSectionCoverage: [...REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS],
    passed: true,
  })));
}

export const NC06_CONTRACT_FIXTURES = Object.freeze([
  { id: 'DEFAULT_CODE_ASSESSMENT_PACKAGE', contract: DEFAULT_CODE_ASSESSMENT_PACKAGE },
  {
    id: 'PASSING_CODE_ASSESSMENT_EVIDENCE_SHAPE',
    contract: DEFAULT_CODE_ASSESSMENT_PACKAGE,
    bases: createPassingAssessmentBasisRegistry(),
    evidence: createPassingCodeAssessmentDomainEvidence(),
  },
]);
