import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adapterPath = 'scripts/preproduction-thermal-liftoff-controlled-source-adapter.mjs';
const validatorPath = 'scripts/preproduction-thermal-liftoff-controlled-source-validator.mjs';
const adapter = await readFile(adapterPath, 'utf8');
const validator = await readFile(validatorPath, 'utf8');
const productionPaths = [
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-displacement-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-prerequisite-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-intake.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js',
];
const productionSource = (await Promise.all(productionPaths.map((path) => readFile(path, 'utf8')))).join('\n');
const qualificationSource = `${adapter}\n${validator}`;

// LFEA is permitted only as already-sealed evidence inside this scripts-only
// qualification adapter. The production-side TL contracts/runtime stay solver-independent.
assert.match(adapter, /requirePhysicalLoadCase/u);
assert.match(adapter, /requireSolverExecution/u);
assert.equal(adapter.includes('compileSolverExecution'), false, 'qualification adapter must never execute LFEA');
for (const token of ['linear-fea-solver', 'linear-fea-load-case', 'requireSolverExecution', 'compileSolverExecution']) {
  assert.equal(productionSource.includes(token), false, `production TL source may not depend on ${token}`);
}

// The adapter qualifies evidence only; it cannot silently cross into TL-03/TL-04,
// production registration, UI, seal/export, or old nonlinear runtimes.
for (const token of [
  'empirical-beam-contact-runtime',
  'empirical-restraint-network-runtime',
  'empirical-method-registry',
  'load-calc-consumer-view',
  'load-calc-consumer-controller',
  'EngineeringInputSeal',
  'seal/export',
]) {
  assert.equal(qualificationSource.includes(token), false, `controlled source adapter crossed boundary: ${token}`);
}
assert.equal(/Math\.max\s*\(\s*0\s*,/u.test(qualificationSource), false, 'negative reaction clamp prohibited');
for (const declaration of [
  'sourceSolverExecutedByAdapter: false',
  'srcRuntimeDependencyCreated: false',
  'reactionToleranceInferredFromSolver: false',
  'solverInternalTolerancePromoted: false',
  'localScreenExecutionPerformed: false',
  'activeSetRedistributionPerformed: false',
  'finalHotReactionPublicationPermitted: false',
  'productionCalculationConsumptionEnabled: false',
  'productionMethodRegistrationPermitted: false',
]) {
  assert.ok(adapter.includes(declaration), `${declaration} must remain explicit`);
}
assert.match(adapter, /loadCase\.primitives\.length !== 1/u, 'probe must be exactly one physical primitive');
assert.match(adapter, /primitive\.kind !== 'PRESCRIBED_MOVEMENT'/u, 'probe must be prescribed movement');
assert.match(adapter, /primitive\.dof !== 'UZ'/u, 'probe must be exact vertical DOF');
assert.match(adapter, /primitive\.value !== 0/u, 'zero probe must be exact zero');
assert.match(adapter, /primitive\.value > 0/u, 'displaced probe must be positive declared UZ movement');
assert.match(validator, /TL_CONTROLLED_SOURCE_ROW_CHILD_MISMATCH/u, 'independent child re-derivation must remain present');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-controlled-source-guard',
  status: 'PASS',
  qualificationAdapterUnderScriptsOnly: true,
  sealedLfeaEvidenceValidationPresent: true,
  sourceSolverExecutionInsideAdapter: false,
  productionTlLfeaDependency: false,
  arbitraryReactionDisplacementRatioPermitted: false,
  exactPrescribedUzProbeRequired: true,
  reactionToleranceInferredFromSolver: false,
  negativeReactionClampIntroduced: false,
  localScreenExecutionPerformed: false,
  activeSetRedistributionPerformed: false,
  productionRegistrationPermitted: false,
}, null, 2));
