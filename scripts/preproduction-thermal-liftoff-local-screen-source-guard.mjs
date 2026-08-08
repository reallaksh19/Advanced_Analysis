import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const localScreenPath =
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js';
const executionPath =
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-execution.js';
const sources = await Promise.all([
  readFile(localScreenPath, 'utf8'),
  readFile(executionPath, 'utf8'),
]);
const [localScreenSource, executionSource] = sources;
const joined = sources.join('\n');

for (const forbiddenImport of [
  'empirical-thermal-liftoff-local-screen.js',
  'authorized-empirical-thermal-liftoff-screen.js',
  'empirical-beam-contact-runtime.js',
  'empirical-restraint-network-runtime.js',
  'empirical-coupled-restraint-network-runtime.js',
  'support-load-distribution-v3.js',
  'empirical-method-registry.js',
  'load-calc-consumer-controller.js',
  'load-calc-consumer-view.js',
]) {
  assert.equal(
    joined.includes(`'./${forbiddenImport}'`) || joined.includes(`'../${forbiddenImport}'`),
    false,
    `forbidden runtime/integration import: ${forbiddenImport}`,
  );
}

assert.match(
  executionSource,
  /requireAuthorizedEmpiricalLoadExecutionV8/u,
  'TL-03 must validate the actual V8 authorized cold-gravity receipt',
);
assert.equal(
  executionSource.includes('calculateAuthorizedEmpiricalLoadExecutionV8'),
  false,
  'TL-03 must not recalculate gravity',
);
assert.equal(
  /Math\.max\s*\(\s*0\s*,/u.test(joined),
  false,
  'negative local trial reserve must never be clamped',
);
for (const forbiddenCall of [
  /solvePlanarRestContact\s*\(/u,
  /solveActiveSet\s*\(/u,
  /releaseContact\s*\(/u,
  /recontact\s*\(/u,
  /redistribute(?:Gravity|Reaction|Load)?\s*\(/u,
]) {
  assert.equal(forbiddenCall.test(joined), false, `TL-04 call prohibited: ${forbiddenCall}`);
}

assert.match(
  localScreenSource,
  /localTrialContactReserveN\s*=\s*coldGravityReactionN\s*-\s*localUpliftDemandN/u,
  'TL-03 governing reserve equation must remain explicit',
);
assert.match(
  localScreenSource,
  /localTrialContactReserveN\s*>\s*reactionToleranceN/u,
  'TL-03 classification threshold must remain explicit',
);
assert.match(executionSource, /finality:\s*'NON_FINAL_NO_REDISTRIBUTION'/u);
assert.match(executionSource, /localScreenExecutionPerformed:\s*true/u);
assert.match(executionSource, /activeSetRedistributionPerformed:\s*false/u);
assert.match(executionSource, /recontactPerformed:\s*false/u);
assert.match(executionSource, /finalHotReactionPublicationPermitted:\s*false/u);
assert.match(executionSource, /productionCalculationConsumptionEnabled:\s*false/u);
assert.match(executionSource, /productionMethodRegistrationPermitted:\s*false/u);
assert.match(executionSource, /defaultUiExposurePermitted:\s*false/u);
assert.match(executionSource, /negativeTrialReserveClampingPermitted:\s*false/u);
assert.match(executionSource, /historicalRuntimeImported:\s*false/u);

for (const boundaryPath of [
  'src/workspace/engineering-loads/empirical-method-registry.js',
  'src/workspace/load-calc-consumer-controller.js',
  'src/workspace/load-calc-consumer-view.js',
]) {
  const source = await readFile(boundaryPath, 'utf8');
  assert.equal(
    source.includes('preproduction-thermal-liftoff-local-screen'),
    false,
    `${boundaryPath} must not import the preproduction TL-03 execution`,
  );
  assert.equal(
    source.includes('THERMAL_LIFTOFF_ACTIVE_SET_V1'),
    false,
    `${boundaryPath} must not register/expose the preproduction lift-off method`,
  );
}

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-local-screen-source-guard',
  status: 'PASS',
  historicalRuntimeImported: false,
  coldGravityRecalculated: false,
  negativeReactionClampingIntroduced: false,
  activeSetRedistributionImported: false,
  productionRegistrationIntroduced: false,
  loadCalcUiWiringIntroduced: false,
}, null, 2));
