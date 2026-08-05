import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import {
  createCodeAssessmentPackageContract,
  validateCodeAssessmentPackageContract,
} from './code-assessment-package-contract.js';
import {
  evaluateCodeAssessmentPackageQualification,
} from './code-assessment-qualification-evaluator.js';
import {
  PASSING_NC06_PLASTIC_DENTING_RECEIPT,
  createPassingAssessmentBasisRegistry,
  createPassingCodeAssessmentDomainEvidence,
} from './nc06-fixtures.js';

export function runNc06NegativeControls() {
  const results = [];
  const rejects = (id, mutate) => {
    const record = clonePlain(createCodeAssessmentPackageContract());
    mutate(record);
    delete record.codeAssessmentPackageHash;
    assert.throws(() => validateCodeAssessmentPackageContract(record));
    results.push({ id, passed: true });
  };

  rejects('REJECT_UNQUALIFIED_UPSTREAM_DEPENDENCY', (r) => { r.upstreamDependency = 'UNQUALIFIED_MODEL'; });
  rejects('REJECT_UNPINNED_ASSESSMENT_BASIS', (r) => { r.assessmentBasisPolicy = 'LATEST_EDITION'; });
  rejects('REJECT_SOURCE_TEXT_REDISTRIBUTION_POLICY', (r) => { r.sourceCustodyPolicy = 'COPY_LICENSED_TEXT'; });
  rejects('REJECT_OPEN_APPLICABILITY', (r) => { r.applicabilityPolicy = 'ASSUME_APPLICABLE'; });
  rejects('REJECT_IMPLICIT_UNITS', (r) => { r.unitPolicy = 'IMPLICIT_UNITS'; });
  rejects('REJECT_OUTPUT_FITTED_INPUTS', (r) => { r.inputMappingPolicy = 'ALLOW_OUTPUT_FITTING'; });
  rejects('REJECT_UNBOUND_EQUATIONS', (r) => { r.equationPolicy = 'UNVERSIONED_FORMULAS'; });
  rejects('REJECT_EXTRAPOLATION', (r) => { r.extrapolationPolicy = 'ALLOW_ENGINEERING_JUDGMENT_EXTRAPOLATION'; });
  rejects('REJECT_NO_UNCERTAINTY', (r) => { r.uncertaintyPolicy = 'IGNORE_UNCERTAINTY'; });
  rejects('REJECT_INTERMEDIATE_ROUNDING', (r) => { r.roundingPolicy = 'ROUND_EACH_STEP'; });
  rejects('REJECT_PASS_WITH_GAPS', (r) => { r.acceptancePolicy = 'PASS_WITH_OPEN_ITEMS'; });
  rejects('REJECT_NO_INDEPENDENT_REVIEW', (r) => { r.minimumIndependentReviewerCount = 0; });
  rejects('REJECT_TOO_FEW_REFERENCE_CASES', (r) => { r.minimumIndependentReferenceCaseCount = 2; });
  rejects('REJECT_LOOSE_EQUATION_TOLERANCE', (r) => { r.maximumEquationRelativeError = 0.01; });
  rejects('REJECT_LOOSE_UNIT_TOLERANCE', (r) => { r.maximumUnitConversionRelativeError = 0.001; });
  rejects('REJECT_BENEFICIAL_UNCERTAINTY', (r) => { r.minimumNonBeneficialUncertaintyImpact = -0.1; });
  rejects('REJECT_AUTOMATIC_CODE_COMPLIANCE', (r) => { r.automaticCodeComplianceAuthorized = true; });
  rejects('REJECT_FFS_AUTHORITY', (r) => { r.fitnessForServiceAuthorized = true; });
  rejects('REJECT_REMAINING_STRENGTH_AUTHORITY', (r) => { r.remainingStrengthAuthorized = true; });
  rejects('REJECT_FAILURE_PRESSURE_AUTHORITY', (r) => { r.failurePressureAuthorized = true; });
  rejects('REJECT_PRODUCTION_EXECUTION', (r) => { r.productionExecutionAuthorized = true; });
  rejects('REJECT_MERGE_AUTHORITY', (r) => { r.mergeAuthorized = true; });

  const base = {
    contract: createCodeAssessmentPackageContract(),
    plasticDentingQualificationReceipt: PASSING_NC06_PLASTIC_DENTING_RECEIPT,
    assessmentBasisRegistry: createPassingAssessmentBasisRegistry(),
    domainEvidence: createPassingCodeAssessmentDomainEvidence(),
  };

  for (const [id, input] of [
    ['BLOCK_MISSING_NC05_RECEIPT', { ...base, plasticDentingQualificationReceipt: null }],
    ['BLOCK_EMPTY_QUALIFIED_CELL_SET', { ...base, plasticDentingQualificationReceipt: { ...PASSING_NC06_PLASTIC_DENTING_RECEIPT, qualifiedCellIds: [] } }],
    ['BLOCK_EMPTY_BASIS_REGISTRY', { ...base, assessmentBasisRegistry: [], domainEvidence: [] }],
    ['BLOCK_MISSING_DOMAIN_EVIDENCE', { ...base, domainEvidence: base.domainEvidence.slice(1) }],
  ]) {
    const report = evaluateCodeAssessmentPackageQualification(input);
    assert.equal(report.authority.codeAssessmentPackageQualified, false);
    results.push({ id, passed: true });
  }

  const basisRedistribution = clonePlain(base.assessmentBasisRegistry);
  basisRedistribution[0].licensedSourceRedistributionAuthorized = true;
  assert.equal(evaluateCodeAssessmentPackageQualification({ ...base, assessmentBasisRegistry: basisRedistribution }).authority.codeAssessmentPackageQualified, false);
  results.push({ id: 'BLOCK_LICENSED_SOURCE_REDISTRIBUTION', passed: true });

  for (const [id, field, value] of [
    ['BLOCK_UNRESOLVED_APPLICABILITY', 'unresolvedApplicabilityCount', 1],
    ['BLOCK_OUT_OF_DOMAIN_INPUT', 'outOfDomainInputCount', 1],
    ['BLOCK_UNMAPPED_INPUT', 'unmappedInputCount', 1],
    ['BLOCK_INSUFFICIENT_REVIEW', 'independentReviewerCount', 0],
    ['BLOCK_INSUFFICIENT_REFERENCE_CASES', 'independentReferenceCaseCount', 2],
    ['BLOCK_REJECTION_TEST_FAILURE', 'rejectionTestsPassed', false],
    ['BLOCK_BENEFICIAL_UNCERTAINTY', 'uncertaintyMarginImpact', -0.01],
    ['BLOCK_EQUATION_REPRODUCTION_ERROR', 'equationRelativeError', 1e-3],
    ['BLOCK_UNIT_CONVERSION_ERROR', 'unitConversionRelativeError', 1e-6],
  ]) {
    const evidence = clonePlain(base.domainEvidence);
    evidence[0][field] = value;
    assert.equal(evaluateCodeAssessmentPackageQualification({ ...base, domainEvidence: evidence }).authority.codeAssessmentPackageQualified, false);
    results.push({ id, passed: true });
  }

  const missingReportSection = clonePlain(base.domainEvidence);
  missingReportSection[0].reportSectionCoverage.pop();
  assert.equal(evaluateCodeAssessmentPackageQualification({ ...base, domainEvidence: missingReportSection }).authority.codeAssessmentPackageQualified, false);
  results.push({ id: 'BLOCK_INCOMPLETE_REPORT_TRACEABILITY', passed: true });

  const passing = evaluateCodeAssessmentPackageQualification(base);
  assert.equal(passing.authority.codeAssessmentPackageQualified, true);
  assert.equal(passing.authority.codeAssessmentQualified, false);
  assert.equal(passing.authority.productionExecutionAuthorized, false);
  results.push({ id: 'PACKAGE_QUALIFICATION_CANNOT_QUALIFY_CASE', passed: true });

  return results;
}
