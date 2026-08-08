import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const guardedPaths = [
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js',
];
const source = (await Promise.all(guardedPaths.map((path) => readFile(path, 'utf8')))).join('\n');
const prohibitedImports = [
  'authorized-empirical-thermal-liftoff-screen.js',
  'empirical-thermal-liftoff-local-screen.js',
  'analysis-authority-overlay',
  'linear-fea',
  'vertical-beam-solver',
  'support-load-distribution-v3.js',
  'empirical-formula-register',
  'method-basis-register',
];
for (const token of prohibitedImports) {
  assert.equal(source.includes(`from './${token}`) || source.includes(`from '../${token}`) || source.includes(token + "';"), false, `prohibited TL-04 runtime import: ${token}`);
}
assert.equal(/Math\.max\s*\(\s*0\s*,/u.test(source), false, 'negative-reaction clamping is prohibited');
assert.match(source, /REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE/u, 'TL-04 V1 must require reduced flexibility authority');
assert.match(source, /stiffnessSubmatrixReductionPermitted:\s*false/u, 'generic stiffness submatrix reduction must remain prohibited');
assert.match(source, /stiffnessSubmatrixReductionPerformed:\s*false/u, 'solver must not claim stiffness submatrix reduction');
assert.match(source, /gravitySourceRecalculationPermitted:\s*false/u, 'cold gravity source recalculation must remain prohibited');
assert.match(source, /gravitySourceRecalculated:\s*false/u, 'solver must preserve the authorized cold gravity source receipt');
assert.match(source, /negativeReactionClampingPermitted:\s*false/u, 'negative reaction clamping permission must remain false');
assert.match(source, /negativeReactionClamped:\s*false/u, 'negative reaction clamping must remain false');
assert.match(source, /finalHotReactionPublicationPermitted:\s*false/u, 'production hot-reaction publication must remain disabled');
assert.match(source, /productionCalculationConsumptionEnabled:\s*false/u, 'production consumption must remain disabled');
assert.match(source, /productionMethodRegistrationPermitted:\s*false/u, 'production registration must remain disabled');
assert.match(source, /gravityContributionRebracketingPerformed:\s*true/u, 'TL-04 must explicitly re-bracket the authorized gravity ledger');
assert.match(source, /recontactEvaluated:\s*true/u, 'TL-04 must explicitly evaluate re-contact');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-active-set-source-guard',
  status: 'PASS',
  historicalTlRuntimeImported: false,
  stagedJsonAuthorityOverlayImported: false,
  linearFeaImported: false,
  verticalBeamSolverImported: false,
  gravityCalculatorImported: false,
  formulaOrMethodRegisterImported: false,
  reducedFlexibilityAuthorityRequired: true,
  stiffnessSubmatrixReductionPermitted: false,
  gravitySourceRecalculationPermitted: false,
  gravityContributionRebracketingRequired: true,
  recontactEvaluationRequired: true,
  negativeReactionClampIntroduced: false,
  finalHotReactionPublicationPermitted: false,
  productionRegistrationPermitted: false,
}, null, 2));
