import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authorityPath = 'src/workspace/engineering-loads/preproduction-support-contact-authority.js';
const bridgePath = 'src/workspace/engineering-loads/preproduction-support-contact-tl-bridge.js';
const authoritySource = await readFile(authorityPath, 'utf8');
const bridgeSource = await readFile(bridgePath, 'utf8');
const combined = `${authoritySource}\n${bridgeSource}`;

for (const forbidden of [
  /support-load-distribution/gu,
  /authorized-empirical-load-execution/gu,
  /empirical-method-registry/gu,
  /empirical-thermal-liftoff-local-screen/gu,
  /empirical-thermal-liftoff-stiffness-registry/gu,
  /empirical-thermal-liftoff-displacement-intake/gu,
  /analysis-authority-overlay/gu,
  /calculateSupportLoadDistribution\s*\(/gu,
  /calculateAuthorizedEmpiricalLoadExecution\w*\s*\(/gu,
  /Math\.max\s*\(\s*0\s*,\s*[^)]*reaction/giu,
]) {
  assert.equal(forbidden.test(combined), false, `preproduction contact batch contains forbidden mechanics/runtime pattern: ${forbidden}`);
}

for (const required of [
  "'engineering-preproduction-support-contact-authority/v1'",
  "'empirical-thermal-liftoff-support-contact-authority/v1'",
  'productionCalculationConsumptionEnabled: false',
  'gravityMutationPermitted: false',
  'gapMechanicsExecuted: false',
  'springMechanicsExecuted: false',
  'frictionMechanicsExecuted: false',
  'liftOffExecuted: false',
  'activeSetRedistributionEnabled: false',
  'tl02StiffnessPromotionPermitted: false',
  'reactionToleranceAuthorityCreated: false',
  'supportMovementAuthorityCreated: false',
  'localScreenExecutionPerformed: false',
  'fullCaseExecutionPermitted: false',
  'activeSetRedistributionPerformed: false',
  'productionMethodRegistrationPermitted: false',
]) {
  assert.ok(combined.includes(required), `missing explicit preproduction boundary: ${required}`);
}

assert.ok(authoritySource.includes("'UNQUALIFIED_APPLICABILITY_REQUIRED'"));
assert.ok(authoritySource.includes("'POSITIVE_OPEN_PIPE_TO_SUPPORT'"));
assert.ok(authoritySource.includes("'GLOBAL_XYZ_Z_UP'"));
assert.ok(bridgeSource.includes("sourceRevision: 'engineering-preproduction-support-contact-authority/v1'"));

console.log(JSON.stringify({
  check: 'preproduction-support-contact-source-guard',
  status: 'PASS',
  runtimeMechanicsImported: false,
  gravityExecutionImported: false,
  stagedJsonAuthorityOverlayImported: false,
  negativeReactionClampingIntroduced: false,
  tl02StiffnessPromotionPermitted: false,
  reactionToleranceAuthorityCreated: false,
  supportMovementAuthorityCreated: false,
  localScreenExecutionPerformed: false,
  activeSetRedistributionPerformed: false,
  productionRegistrationPermitted: false,
}, null, 2));
