import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const execution = await readFile('src/workspace/engineering-loads/preproduction-thermal-liftoff-governed-execution.js', 'utf8');
const presenter = await readFile('src/workspace/engineering-loads/preproduction-thermal-liftoff-presenter.js', 'utf8');
const check = await readFile('scripts/preproduction-thermal-liftoff-tl06-governed-check.mjs', 'utf8');
const runtime = `${execution}\n${presenter}`;

assert.match(execution, /PREPRODUCTION_EXPLICIT_OPT_IN/u);
assert.match(execution, /explicitOptInRequired: true/u);
assert.match(execution, /assessPreproductionThermalLiftoffActiveSetCurrentness/u, 'TL-06 must require current TL-04 evidence');
assert.match(execution, /requirePreproductionThermalLiftoffCorrelation/u, 'TL-06 must validate the current TL-05 receipt');
assert.match(execution, /assessPreproductionThermalLiftoffCorrelationCurrentness/u, 'TL-06 must require current TL-05 source bindings');
assert.match(execution, /correlatePreproductionThermalLiftoffBenchmarkProgramme/u, 'TL-06 must replay the complete TL-05 correlation');
assert.match(execution, /PREPRODUCTION_TL06_TL05_REPLAY_MISMATCH/u, 'full TL-05 replay hash comparison must remain present');
assert.match(execution, /TL-B_EXHAUSTIVE_ORACLE_CORRELATED_V1|PREPRODUCTION_TL05_CORRELATION_CLASS/u);
assert.match(execution, /screenedReactionN/u);
assert.match(execution, /screenedGapM/u);
assert.equal(/finalHotReactionN\s*:/u.test(execution), false, 'TL-06 must not publish a final hot reaction field');
assert.match(presenter, /STALE_SUPPRESSED/u);
assert.match(presenter, /rows: current \?/u, 'stale presenter must suppress numerical rows');
assert.match(check, /stalePresentation\.rows, \[\]/u, 'dynamic qualification must prove stale row suppression');
assert.match(check, /candidateExecutionId = 'FORGED-TL05-CANDIDATE-ID'/u, 'dynamic qualification must prove full source replay catches a self-rehashed logical forgery');

for (const declaration of [
  'productionCalculationConsumptionEnabled: false',
  'productionMethodRegistrationPermitted: false',
  'defaultUiExposurePermitted: false',
  'sealExportEligibilityPermitted: false',
  'productionCutoverPermitted: false',
  'defaultCutoverPerformed: false',
  'productionFinalReactionCalculated: false',
  'finalHotReactionPublicationPermitted: false',
  'generalAccuracyClaimPermitted: false',
  'outputFittingPermitted: false',
]) assert.ok(execution.includes(declaration), `${declaration} must remain explicit`);

for (const token of [
  'preproduction-thermal-liftoff-benchmark-authority',
  'preproduction-thermal-liftoff-tl05-exhaustive-oracle',
  'empirical-method-registry',
  'load-calc-consumer-controller',
  'load-calc-consumer-view',
  'empirical-load-calc-scenario-view',
  'EngineeringInputSeal',
  'analysis-authority-overlay',
  'linear-fea-solver',
]) assert.equal(runtime.includes(token), false, `TL-06 crossed forbidden runtime boundary: ${token}`);
assert.equal(/Math\.max\s*\(\s*0\s*,/u.test(runtime), false, 'TL-06 must not clamp reactions');
assert.equal(execution.includes('alpha * deltaT'), false, 'TL-06 must not infer support movement from free expansion');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-tl06-governed-guard',
  status: 'PASS',
  explicitOptInRequired: true,
  currentTl04Required: true,
  currentTl05Required: true,
  completeTl05SourceReplayRequired: true,
  staleRowsSuppressed: true,
  finalHotReactionFieldPublished: false,
  productionCalculationConsumptionEnabled: false,
  productionMethodRegistrationPermitted: false,
  defaultUiExposurePermitted: false,
  sealExportEligibilityPermitted: false,
  productionCutoverPermitted: false,
}, null, 2));
