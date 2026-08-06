export function reviewSyntheticReferenceBuild({ buildReplayIdentical, referenceDifference, securityFailureCount, artifactBytes, operationCount, limits }) {
  const findings = [];
  if (!buildReplayIdentical) findings.push('BUILD_REPLAY_MISMATCH');
  if (!Number.isFinite(referenceDifference) || referenceDifference > limits.maximumReferenceRelativeDifference) findings.push('REFERENCE_REGRESSION_FAILED');
  if (securityFailureCount !== 0) findings.push('SECURITY_CONTROL_FAILED');
  if (!Number.isInteger(artifactBytes) || artifactBytes <= 0 || artifactBytes > limits.maximumArtifactBytes) findings.push('ARTIFACT_RESOURCE_BOUND_FAILED');
  if (!Number.isInteger(operationCount) || operationCount <= 0 || operationCount > limits.maximumGovernedOperationCount) findings.push('OPERATION_RESOURCE_BOUND_FAILED');
  return Object.freeze({
    schema: 'lafea-nc08-simulated-release-review/v1',
    actorClass: 'SIMULATED_INDEPENDENT_RELEASE_TEST_ACTOR',
    humanApprovalClaimed: false,
    productionReleaseAuthorized: false,
    syntheticReferenceUseAuthorized: findings.length === 0,
    changeControl: 'NEW_EXACT_HEAD_RECEIPT_REQUIRED_FOR_ANY_GOVERNED_BYTE_CHANGE',
    findings,
    conclusion: findings.length === 0 ? 'SYNTHETIC_REFERENCE_BUILD_TEST_COMPLETE' : 'BLOCKED',
  });
}
