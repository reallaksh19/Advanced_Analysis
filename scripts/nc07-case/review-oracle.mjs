// Deliberately independent review rule set for the synthetic demonstration case.
export function reviewSyntheticCase({ caseNature, dispositionClass, realAssetDecisionAuthorized, productionUseAuthorized, equationRelativeError }) {
  const findings = [];
  if (caseNature !== 'SYNTHETIC_NON_PHYSICAL_DEMONSTRATION_ONLY') findings.push('CASE_NATURE_INVALID');
  if (dispositionClass !== 'ENGINEERING_REVIEW_REQUIRED') findings.push('DISPOSITION_TOO_PERMISSIVE');
  if (realAssetDecisionAuthorized !== false) findings.push('REAL_ASSET_AUTHORITY_PRESENT');
  if (productionUseAuthorized !== false) findings.push('PRODUCTION_AUTHORITY_PRESENT');
  if (!Number.isFinite(equationRelativeError) || equationRelativeError > 1e-12) findings.push('CALCULATION_REPRODUCTION_FAILED');
  return Object.freeze({
    reviewerClass: 'SIMULATED_INDEPENDENT_TEST_ACTOR',
    independenceMode: 'SEPARATE_DETERMINISTIC_RULE_CHECK',
    humanApprovalClaimed: false,
    findings,
    conclusion: findings.length === 0 ? 'TEST_RECORD_COMPLETE' : 'TEST_RECORD_BLOCKED',
  });
}
