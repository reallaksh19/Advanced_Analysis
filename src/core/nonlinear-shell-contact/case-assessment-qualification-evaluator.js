import {
  HASH_PATTERN,
  assertArray,
  assertBoolean,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertId,
  assertPlainData,
  deepFreeze,
  semanticHash,
} from './contracts.js';
import {
  REQUIRED_CASE_ASSESSMENT_DOMAINS,
  REQUIRED_CASE_REPORT_SECTIONS,
  validateCaseAssessmentReceiptContract,
} from './case-assessment-receipt-contract.js';

export function evaluateCaseAssessmentQualification({
  contract,
  codeAssessmentPackageReceipt = null,
  plasticDentingQualificationReceipt = null,
  caseRegistry = [],
  domainEvidence = [],
}) {
  validateCaseAssessmentReceiptContract(contract);
  assertArray(caseRegistry, '$caseRegistry');
  assertArray(domainEvidence, '$domainEvidence');
  const blockers = [];
  const packageBasisIds = validateNc06Receipt(codeAssessmentPackageReceipt, blockers);
  const qualifiedCellIds = validateNc05Receipt(plasticDentingQualificationReceipt, blockers);

  const cases = new Map();
  for (const assessmentCase of caseRegistry) {
    try {
      validateCaseRegistration(assessmentCase);
      if (cases.has(assessmentCase.id)) blockers.push(`CASE_DUPLICATE_ID:${assessmentCase.id}`);
      else cases.set(assessmentCase.id, assessmentCase);
      if (packageBasisIds.size && !packageBasisIds.has(assessmentCase.assessmentBasisId)) {
        blockers.push(`CASE_UNQUALIFIED_ASSESSMENT_BASIS:${assessmentCase.id}:${assessmentCase.assessmentBasisId}`);
      }
      if (qualifiedCellIds.size && !qualifiedCellIds.has(assessmentCase.qualifiedCellId)) {
        blockers.push(`CASE_UNQUALIFIED_NC05_CELL:${assessmentCase.id}:${assessmentCase.qualifiedCellId}`);
      }
    } catch (error) {
      blockers.push(`CASE_INVALID:${assessmentCase?.id ?? 'UNKNOWN'}:${error.message}`);
    }
  }
  if (cases.size === 0) blockers.push('CASE_REGISTRY_EMPTY');

  const evidenceKeys = new Set();
  for (const evidence of domainEvidence) {
    const key = `${evidence?.caseId}:${evidence?.id}`;
    if (evidenceKeys.has(key)) blockers.push(`CASE_EVIDENCE_DUPLICATE:${key}`);
    evidenceKeys.add(key);
  }

  for (const assessmentCase of cases.values()) {
    for (const id of REQUIRED_CASE_ASSESSMENT_DOMAINS) {
      const evidence = domainEvidence.find((entry) => entry?.caseId === assessmentCase.id && entry?.id === id);
      if (!evidence) {
        blockers.push(`CASE_EVIDENCE_MISSING:${assessmentCase.id}:${id}`);
        continue;
      }
      try {
        validateCaseEvidence(evidence, contract, cases);
        if (evidence.passed !== true) blockers.push(`CASE_EVIDENCE_FAILED:${assessmentCase.id}:${id}`);
      } catch (error) {
        blockers.push(`CASE_EVIDENCE_INVALID:${assessmentCase.id}:${id}:${error.message}`);
      }
    }
  }
  for (const evidence of domainEvidence) {
    if (!cases.has(evidence?.caseId)) blockers.push(`CASE_EVIDENCE_UNKNOWN_CASE:${evidence?.caseId ?? 'UNKNOWN'}`);
  }

  const codeAssessmentQualified = blockers.length === 0;
  const qualifiedCaseIds = codeAssessmentQualified ? [...cases.keys()].sort() : [];
  const report = {
    schema: 'nonlinear-shell-contact-nc07-report/v1',
    status: codeAssessmentQualified ? 'NC07_CASE_ASSESSMENT_QUALIFIED' : 'NC07_BLOCKED',
    caseAssessmentReceiptContractHash: contract.caseAssessmentReceiptContractHash,
    registeredCaseCount: cases.size,
    qualifiedCaseIds,
    blockers: [...blockers].sort(),
    authority: {
      nc07ContractQualified: true,
      codeAssessmentPackageQualified: codeAssessmentPackageReceipt?.codeAssessmentPackageQualified === true,
      plasticDentingProcedureQualified: plasticDentingQualificationReceipt?.plasticDentingProcedureQualified === true,
      codeAssessmentQualified,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
      moduleQualified: false,
      productionExecutionAuthorized: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

export function validateCaseRegistration(value) {
  assertPlainData(value, '$caseRegistration');
  assertExactKeys(value, [
    'id', 'assetId', 'defectId', 'assessmentBasisId', 'qualifiedCellId',
    'inputSetHash', 'measurementRecordHash', 'modelReceiptHash',
    'calculationLedgerHash', 'reportHash', 'ownerDispositionHash',
    'independentReviewHash', 'retentionRecordHash', 'dispositionClass',
  ], '$caseRegistration');
  for (const field of ['id', 'assetId', 'defectId', 'assessmentBasisId', 'qualifiedCellId']) {
    assertId(value[field], `$caseRegistration.${field}`);
  }
  for (const field of [
    'inputSetHash', 'measurementRecordHash', 'modelReceiptHash',
    'calculationLedgerHash', 'reportHash', 'ownerDispositionHash',
    'independentReviewHash', 'retentionRecordHash',
  ]) {
    if (!HASH_PATTERN.test(value[field] ?? '')) throw new TypeError(`${field} must be a governed hash.`);
  }
  assertEnum(value.dispositionClass, [
    'ACCEPTED_WITH_LIMITATIONS',
    'REJECTED',
    'ENGINEERING_REVIEW_REQUIRED',
  ], '$caseRegistration.dispositionClass');
  return true;
}

function validateNc06Receipt(receipt, blockers) {
  const basisIds = new Set();
  if (!receipt || receipt.codeAssessmentPackageQualified !== true || !HASH_PATTERN.test(receipt.receiptHash ?? '')) {
    blockers.push('NC06_PACKAGE_RECEIPT_MISSING_OR_UNQUALIFIED');
    return basisIds;
  }
  if (!Array.isArray(receipt.qualifiedBasisIds) || receipt.qualifiedBasisIds.length === 0) {
    blockers.push('NC06_PACKAGE_RECEIPT_QUALIFIED_BASIS_SET_EMPTY');
    return basisIds;
  }
  for (const id of receipt.qualifiedBasisIds) {
    try { assertId(id, 'qualifiedBasisId'); } catch (error) { blockers.push(`NC06_PACKAGE_RECEIPT_BASIS_INVALID:${error.message}`); continue; }
    if (basisIds.has(id)) blockers.push(`NC06_PACKAGE_RECEIPT_BASIS_DUPLICATE:${id}`);
    basisIds.add(id);
  }
  return basisIds;
}

function validateNc05Receipt(receipt, blockers) {
  const cellIds = new Set();
  if (!receipt || receipt.plasticDentingProcedureQualified !== true || !HASH_PATTERN.test(receipt.receiptHash ?? '')) {
    blockers.push('NC05_PLASTIC_DENTING_RECEIPT_MISSING_OR_UNQUALIFIED');
    return cellIds;
  }
  if (!Array.isArray(receipt.qualifiedCellIds) || receipt.qualifiedCellIds.length === 0) {
    blockers.push('NC05_PLASTIC_DENTING_RECEIPT_QUALIFIED_CELL_SET_EMPTY');
    return cellIds;
  }
  for (const id of receipt.qualifiedCellIds) {
    try { assertId(id, 'qualifiedCellId'); } catch (error) { blockers.push(`NC05_PLASTIC_DENTING_RECEIPT_CELL_INVALID:${error.message}`); continue; }
    if (cellIds.has(id)) blockers.push(`NC05_PLASTIC_DENTING_RECEIPT_CELL_DUPLICATE:${id}`);
    cellIds.add(id);
  }
  return cellIds;
}

function validateCaseEvidence(evidence, contract, cases) {
  assertPlainData(evidence, '$caseAssessmentEvidence');
  assertExactKeys(evidence, [
    'id', 'caseId', 'referenceHash', 'rawEvidenceHash', 'reviewerRecordHash',
    'ownerApprovalHash', 'referenceUncertainty', 'acceptanceTolerance',
    'observedDifference', 'equationRelativeError', 'unitConversionRelativeError',
    'ledgerRelativeDifference', 'uncertaintyMarginImpact',
    'inputHashMismatchCount', 'unresolvedApplicabilityCount',
    'outOfDomainInputCount', 'unmappedInputCount', 'independentReviewerCount',
    'calculationReproduced', 'reviewerIndependenceConfirmed',
    'ownerDispositionRecorded', 'reportSectionCoverage', 'passed',
  ], '$caseAssessmentEvidence');
  if (!REQUIRED_CASE_ASSESSMENT_DOMAINS.includes(evidence.id)) throw new TypeError('Unknown case-assessment evidence domain.');
  if (!cases.has(evidence.caseId)) throw new TypeError('Evidence references an unregistered case.');
  for (const field of ['referenceHash', 'rawEvidenceHash', 'reviewerRecordHash', 'ownerApprovalHash']) {
    if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  }
  assertFiniteNumber(evidence.referenceUncertainty, 'referenceUncertainty', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.acceptanceTolerance, 'acceptanceTolerance', (n) => n > 0, 'positive');
  if (evidence.acceptanceTolerance < evidence.referenceUncertainty) throw new TypeError('Tolerance understates uncertainty.');
  assertFiniteNumber(evidence.observedDifference, 'observedDifference', (n) => n >= 0, 'nonnegative');
  if (evidence.observedDifference > evidence.acceptanceTolerance) throw new TypeError('Observed difference exceeds tolerance.');
  assertFiniteNumber(evidence.equationRelativeError, 'equationRelativeError', (n) => n >= 0, 'nonnegative');
  if (evidence.equationRelativeError > contract.maximumEquationRelativeError) throw new TypeError('Equation reproduction error exceeds the contract limit.');
  assertFiniteNumber(evidence.unitConversionRelativeError, 'unitConversionRelativeError', (n) => n >= 0, 'nonnegative');
  if (evidence.unitConversionRelativeError > contract.maximumUnitConversionRelativeError) throw new TypeError('Unit conversion error exceeds the contract limit.');
  assertFiniteNumber(evidence.ledgerRelativeDifference, 'ledgerRelativeDifference', (n) => n >= 0, 'nonnegative');
  if (evidence.ledgerRelativeDifference > contract.maximumLedgerRelativeDifference) throw new TypeError('Calculation-ledger reproduction differs beyond the contract limit.');
  assertFiniteNumber(evidence.uncertaintyMarginImpact, 'uncertaintyMarginImpact');
  if (evidence.uncertaintyMarginImpact < contract.minimumNonBeneficialUncertaintyImpact) throw new TypeError('Uncertainty beneficially changes the assessment margin.');
  for (const field of ['inputHashMismatchCount', 'unresolvedApplicabilityCount', 'outOfDomainInputCount', 'unmappedInputCount']) {
    assertFiniteNumber(evidence[field], field, Number.isInteger, 'integer');
    if (evidence[field] !== 0) throw new TypeError(`${field} must be zero.`);
  }
  assertFiniteNumber(evidence.independentReviewerCount, 'independentReviewerCount', Number.isInteger, 'integer');
  if (evidence.independentReviewerCount < contract.minimumIndependentReviewerCount) throw new TypeError('Independent reviewer count is insufficient.');
  for (const field of ['calculationReproduced', 'reviewerIndependenceConfirmed', 'ownerDispositionRecorded', 'passed']) {
    assertBoolean(evidence[field], field);
    if (evidence[field] !== true) throw new TypeError(`${field} must be true.`);
  }
  validateExactCoverage(evidence.reportSectionCoverage, REQUIRED_CASE_REPORT_SECTIONS, 'reportSectionCoverage');
}

function validateExactCoverage(value, required, path) {
  assertArray(value, path, { min: required.length });
  if (value.length !== required.length || value.some((entry, index) => entry !== required[index])) {
    throw new TypeError(`${path} must preserve complete canonical report-section coverage.`);
  }
}
