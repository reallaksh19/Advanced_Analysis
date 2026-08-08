import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authority = await readFile('src/workspace/engineering-loads/preproduction-thermal-liftoff-benchmark-authority.js', 'utf8');
const oracle = await readFile('scripts/preproduction-thermal-liftoff-tl05-exhaustive-oracle.mjs', 'utf8');
const check = await readFile('scripts/preproduction-thermal-liftoff-tl05-correlation-check.mjs', 'utf8');
const combined = `${authority}\n${oracle}`;

// The independent reference must not call, import or wrap the candidate TL-04
// active-set execution algorithm. It may consume only the validated intake.
assert.match(oracle, /requirePreproductionThermalLiftoffActiveSetIntake/u);
assert.equal(oracle.includes("from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js'"), false, 'reference oracle must not import candidate TL-04 implementation');
assert.equal(oracle.includes('calculatePreproductionThermalLiftoffActiveSet'), false, 'reference oracle must not call candidate TL-04 implementation');
assert.match(oracle, /for \(let mask = 1; mask < \(1 << ids\.length\); mask \+= 1\)/u, 'reference must exhaustively enumerate contact subsets');
assert.match(oracle, /admissible\.length !== 1/u, 'reference must require a unique admissible complementarity state');
assert.match(oracle, /candidateActiveSetAlgorithmReused: false/u, 'reference independence must remain explicit');

// TL-05 accuracy controls must be explicit authority, never borrowed from
// source-solver internal tolerances or hidden defaults.
assert.match(authority, /PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_SCHEMA/u);
assert.match(authority, /solverInternalToleranceAutomaticallyPromotable: false/u);
assert.match(authority, /hiddenDefaultPermitted: false/u);
assert.match(authority, /reactionAbsoluteToleranceN/u);
assert.match(authority, /gapAbsoluteToleranceM/u);
assert.match(authority, /forceResidualToleranceN/u);
assert.match(authority, /momentResidualToleranceNmm/u);
assert.match(authority, /complementarityToleranceNM/u);

// Promotion requires both cold-parity and nonlinear contact-change scenarios.
assert.match(authority, /ZERO_MOVEMENT_COLD_PARITY/u);
assert.match(authority, /NONLINEAR_CONTACT_CHANGE_RECONTACT/u);
assert.match(authority, /PREPRODUCTION_TL05_REQUIRED_SCENARIO_MISSING/u);
assert.match(check, /releaseEventCount, 2/u);
assert.match(check, /recontactEventCount, 1/u);

// No production cutover/registration/UI/seal/export/final-hot claim is granted.
for (const declaration of [
  'productionCalculationConsumptionEnabled: false',
  'productionMethodRegistrationPermitted: false',
  'defaultUiExposurePermitted: false',
  'sealExportEligibilityPermitted: false',
  'finalHotReactionPublicationPermitted: false',
  'productionCutoverPermitted: false',
]) assert.ok(authority.includes(declaration), `${declaration} must remain explicit`);
for (const token of [
  'empirical-method-registry',
  'load-calc-consumer-view',
  'load-calc-consumer-controller',
  'EngineeringInputSeal',
  'empirical-beam-contact-runtime',
  'linear-fea-solver',
]) assert.equal(combined.includes(token), false, `TL-05 authority/oracle crossed forbidden boundary: ${token}`);
assert.equal(/Math\.max\s*\(\s*0\s*,/u.test(combined), false, 'negative reaction clamping remains prohibited');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-tl05-correlation-guard',
  status: 'PASS',
  independentExhaustiveReference: true,
  candidateActiveSetAlgorithmReused: false,
  uniqueComplementarityStateRequired: true,
  explicitAccuracyAuthorityRequired: true,
  zeroMovementScenarioRequired: true,
  nonlinearReleaseRecontactScenarioRequired: true,
  productionCutoverPermitted: false,
  productionRegistrationPermitted: false,
  defaultUiExposurePermitted: false,
  sealExportEligibilityPermitted: false,
  finalHotReactionPublicationPermitted: false,
}, null, 2));
