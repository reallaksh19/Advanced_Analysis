import {
  HASH_PATTERN,
  assertArray,
  assertBoolean,
  assertExactKeys,
  assertFiniteNumber,
  assertId,
  assertPlainData,
  assertString,
  deepFreeze,
  semanticHash,
} from './contracts.js';
import {
  REQUIRED_CODE_ASSESSMENT_DOMAINS,
  REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS,
  validateCodeAssessmentPackageContract,
} from './code-assessment-package-contract.js';

export function evaluateCodeAssessmentPackageQualification({
  contract,
  plasticDentingQualificationReceipt = null,
  assessmentBasisRegistry = [],
  domainEvidence = [],
}) {
  validateCodeAssessmentPackageContract(contract);
  assertArray(assessmentBasisRegistry, '$assessmentBasisRegistry');
  assertArray(domainEvidence, '$domainEvidence');
  const blockers = [];
  validateNc05Receipt(plasticDentingQualificationReceipt, blockers);

  const bases = new Map();
  for (const basis of assessmentBasisRegistry) {
    try {
      validateAssessmentBasis(basis);
      if (bases.has(basis.id)) blockers.push(`ASSESSMENT_BASIS_DUPLICATE_ID:${basis.id}`);
      else bases.set(basis.id, basis);
    } catch (error) {
      blockers.push(`ASSESSMENT_BASIS_INVALID:${basis?.id ?? 'UNKNOWN'}:${error.message}`);
    }
  }
  if (bases.size === 0) blockers.push('ASSESSMENT_BASIS_REGISTRY_EMPTY');

  const evidenceKeys = new Set();
  for (const evidence of domainEvidence) {
    const key = `${evidence?.basisId}:${evidence?.id}`;
    if (evidenceKeys.has(key)) blockers.push(`DOMAIN_EVIDENCE_DUPLICATE:${key}`);
    evidenceKeys.add(key);
  }

  for (const basis of bases.values()) {
    for (const id of REQUIRED_CODE_ASSESSMENT_DOMAINS) {
      const evidence = domainEvidence.find((entry) => entry?.basisId === basis.id && entry?.id === id);
      if (!evidence) {
        blockers.push(`DOMAIN_EVIDENCE_MISSING:${basis.id}:${id}`);
        continue;
      }
      try {
        validateDomainEvidence(evidence, contract, bases);
        if (evidence.passed !== true) blockers.push(`DOMAIN_EVIDENCE_FAILED:${basis.id}:${id}`);
      } catch (error) {
        blockers.push(`DOMAIN_EVIDENCE_INVALID:${basis.id}:${id}:${error.message}`);
      }
    }
  }
  for (const evidence of domainEvidence) {
    if (!bases.has(evidence?.basisId)) blockers.push(`DOMAIN_EVIDENCE_UNKNOWN_BASIS:${evidence?.basisId ?? 'UNKNOWN'}`);
  }

  const codeAssessmentPackageQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc06-report/v1',
    status: codeAssessmentPackageQualified ? 'NC06_PACKAGE_QUALIFIED' : 'NC06_BLOCKED',
    codeAssessmentPackageHash: contract.codeAssessmentPackageHash,
    registeredBasisCount: bases.size,
    blockers: [...blockers].sort(),
    authority: {
      nc06ContractQualified: true,
      plasticDentingProcedureQualified: plasticDentingQualificationReceipt?.plasticDentingProcedureQualified === true,
      codeAssessmentPackageQualified,
      codeAssessmentQualified: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
      productionExecutionAuthorized: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

export function validateAssessmentBasis(value) {
  assertPlainData(value, '$assessmentBasis');
  assertExactKeys(value, [
    'id', 'standardId', 'edition', 'addenda', 'jurisdiction', 'clauseSetHash',
    'approvedSourceHash', 'applicabilityStatementHash', 'unitProfile',
    'ownerApprovalHash', 'licensedSourceRedistributionAuthorized',
  ], '$assessmentBasis');
  assertId(value.id, '$assessmentBasis.id');
  for (const field of ['standardId', 'edition', 'addenda', 'jurisdiction', 'unitProfile']) {
    assertString(value[field], `$assessmentBasis.${field}`);
  }
  for (const field of ['clauseSetHash', 'approvedSourceHash', 'applicabilityStatementHash', 'ownerApprovalHash']) {
    if (!HASH_PATTERN.test(value[field] ?? '')) throw new TypeError(`${field} must be a governed hash.`);
  }
  assertBoolean(value.licensedSourceRedistributionAuthorized, '$assessmentBasis.licensedSourceRedistributionAuthorized');
  if (value.licensedSourceRedistributionAuthorized !== false) {
    throw new TypeError('NC-06 must not redistribute licensed assessment source text.');
  }
  return true;
}

function validateNc05Receipt(receipt, blockers) {
  if (!receipt || receipt.plasticDentingProcedureQualified !== true || !HASH_PATTERN.test(receipt.receiptHash ?? '')) {
    blockers.push('PLASTIC_DENTING_QUALIFICATION_RECEIPT_MISSING_OR_UNQUALIFIED');
    return;
  }
  if (!Array.isArray(receipt.qualifiedCellIds) || receipt.qualifiedCellIds.length === 0) {
    blockers.push('PLASTIC_DENTING_RECEIPT_QUALIFIED_CELL_SET_EMPTY');
  } else if (new Set(receipt.qualifiedCellIds).size !== receipt.qualifiedCellIds.length) {
    blockers.push('PLASTIC_DENTING_RECEIPT_QUALIFIED_CELL_SET_DUPLICATE');
  }
}

function validateDomainEvidence(evidence, contract, bases) {
  assertPlainData(evidence, '$codeAssessmentDomainEvidence');
  assertExactKeys(evidence, [
    'id', 'basisId', 'referenceHash', 'rawEvidenceHash', 'reviewerRecordHash',
    'referenceUncertainty', 'acceptanceTolerance', 'observedDifference',
    'equationRelativeError', 'unitConversionRelativeError',
    'uncertaintyMarginImpact', 'unresolvedApplicabilityCount',
    'outOfDomainInputCount', 'unmappedInputCount', 'independentReviewerCount',
    'independentReferenceCaseCount', 'rejectionTestsPassed',
    'reportSectionCoverage', 'passed',
  ], '$codeAssessmentDomainEvidence');
  if (!REQUIRED_CODE_ASSESSMENT_DOMAINS.includes(evidence.id)) throw new TypeError('Unknown code-assessment evidence domain.');
  if (!bases.has(evidence.basisId)) throw new TypeError('Evidence references an unregistered assessment basis.');
  for (const field of ['referenceHash', 'rawEvidenceHash', 'reviewerRecordHash']) {
    if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  }
  assertFiniteNumber(evidence.referenceUncertainty, 'referenceUncertainty', (n) => n >= 0, 'nonnegative');
  assertFiniteNumber(evidence.acceptanceTolerance, 'acceptanceTolerance', (n) => n > 0, 'positive');
  if (evidence.acceptanceTolerance < evidence.referenceUncertainty) throw new TypeError('Tolerance understates reference uncertainty.');
  assertFiniteNumber(evidence.observedDifference, 'observedDifference', (n) => n >= 0, 'nonnegative');
  if (evidence.observedDifference > evidence.acceptanceTolerance) throw new TypeError('Observed difference exceeds tolerance.');
  assertFiniteNumber(evidence.equationRelativeError, 'equationRelativeError', (n) => n >= 0, 'nonnegative');
  if (evidence.equationRelativeError > contract.maximumEquationRelativeError) throw new TypeError('Equation reproduction error exceeds the contract limit.');
  assertFiniteNumber(evidence.unitConversionRelativeError, 'unitConversionRelativeError', (n) => n >= 0, 'nonnegative');
  if (evidence.unitConversionRelativeError > contract.maximumUnitConversionRelativeError) throw new TypeError('Unit conversion error exceeds the contract limit.');
  assertFiniteNumber(evidence.uncertaintyMarginImpact, 'uncertaintyMarginImpact');
  if (evidence.uncertaintyMarginImpact < contract.minimumNonBeneficialUncertaintyImpact) throw new TypeError('Uncertainty treatment beneficially changes the acceptance margin.');
  for (const field of ['unresolvedApplicabilityCount', 'outOfDomainInputCount', 'unmappedInputCount']) {
    assertFiniteNumber(evidence[field], field, Number.isInteger, 'integer');
    if (evidence[field] !== 0) throw new TypeError(`${field} must be zero.`);
  }
  assertFiniteNumber(evidence.independentReviewerCount, 'independentReviewerCount', Number.isInteger, 'integer');
  if (evidence.independentReviewerCount < contract.minimumIndependentReviewerCount) throw new TypeError('Independent reviewer count is insufficient.');
  assertFiniteNumber(evidence.independentReferenceCaseCount, 'independentReferenceCaseCount', Number.isInteger, 'integer');
  if (evidence.independentReferenceCaseCount < contract.minimumIndependentReferenceCaseCount) throw new TypeError('Independent reference-case count is insufficient.');
  assertBoolean(evidence.rejectionTestsPassed, 'rejectionTestsPassed');
  if (evidence.rejectionTestsPassed !== true) throw new TypeError('Domain-limit rejection tests did not pass.');
  validateExactCoverage(evidence.reportSectionCoverage, REQUIRED_CODE_ASSESSMENT_REPORT_SECTIONS, 'reportSectionCoverage');
  assertBoolean(evidence.passed, 'passed');
}

function validateExactCoverage(value, required, path) {
  assertArray(value, path, { min: required.length });
  if (value.length !== required.length || value.some((entry, index) => entry !== required[index])) {
    throw new TypeError(`${path} must preserve complete canonical report-section coverage.`);
  }
}
