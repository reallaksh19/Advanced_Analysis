import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const execution = await readFile('src/workspace/engineering-loads/preproduction-thermal-liftoff-governed-execution.js', 'utf8');
const presenter = await readFile('src/workspace/engineering-loads/preproduction-thermal-liftoff-presenter.js', 'utf8');
const check = await readFile('scripts/preproduction-thermal-liftoff-tl06-governed-check.mjs', 'utf8');
const combined = `${execution}\n${presenter}`;

assert.match(execution, /PREPRODUCTION_EXPLICIT_OPT_IN/u);
assert.match(execution, /explicitOptInRequired: true/u);
assert.match(execution, /assessPreproductionThermalLiftoffActiveSetCurrentness/u, 'TL-06 must require current TL-04 evidence');
assert.match(execution, /verifyBenchmarkEvidence/u, 'TL-06 must independently requalify TL-05 evidence');
assert.match(execution, /qualifyPreproductionThermalLiftoffBenchmark/u, 'TL-06 must rebuild each correlation from source evidence');
assert.match(execution, /buildPreproductionThermalLiftoffBenchmarkProgramme/u, 'TL-06 must rebuild the benchmark programme');
assert.match(execution, /screenedReactionN/u);
assert.match(execution, /screenedGapM/u);
assert.equal(/finalHotReactionN\s*:/u.test(execution), false, 'TL-06 must not publish a final hot reaction field');
assert.match(presenter, /STALE_SUPPRESSED/u);
assert.match(presenter, /rows: current \?/u, 'stale presenter must suppress rows');
assert.match(check, /stalePresentation\.rows, \[\]/u, 'dynamic qualification must prove stale row suppression');

for (const declaration of [
  'productionCalculationConsumptionEnabled: false',
  'productionMethodRegistrationPermitted: false',
  'defaultUiExposurePermitted: false',
  'sealExportEligibilityPermitted: false',
  'productionCutoverPermitted: false',
  'productionFinalReactionCalculated: false',
  'finalHotReactionPublicationPermitted: false',
]) assert.ok(execution.includes(declaration), `${declaration} must remain explicit`);
for (const token of [
  'empirical-method-registry',
  'load-calc-consumer-controller',
  'load-calc-consumer-view',
  'empirical-load-calc-scenario-view',
  'EngineeringInputSeal',
]) assert.equal(combined.includes(token), false, `TL-06 crossed forbidden production boundary: ${token}`);
assert.equal(/Math\.max\s*\(\s*0\s*,/u.test(combined), false, 'TL-06 must not clamp reactions');
assert.equal(execution.includes('alpha * deltaT'), false, 'TL-06 must not infer support movement from free expansion');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-tl06-governed-guard',
  status: 'PASS',
  explicitOptInRequired: true,
  currentTl04Required: true,
  tl05EvidenceIndependentlyRebuilt: true,
  staleRowsSuppressed: true,
  finalHotReactionFieldPublished: false,
  productionCalculationConsumptionEnabled: false,
  productionMethodRegistrationPermitted: false,
  defaultUiExposurePermitted: false,
  sealExportEligibilityPermitted: false,
  productionCutoverPermitted: false,
}, null, 2));
