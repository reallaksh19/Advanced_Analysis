import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adapter = await readFile('scripts/preproduction-thermal-liftoff-controlled-influence-adapter.mjs', 'utf8');
const validator = await readFile('scripts/preproduction-thermal-liftoff-controlled-influence-validator.mjs', 'utf8');
const tlRuntimePaths = [
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-displacement-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-prerequisite-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-intake.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set-authority.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js',
];
const tlRuntime = (await Promise.all(tlRuntimePaths.map((path) => readFile(path, 'utf8')))).join('\n');
const qualification = `${adapter}\n${validator}`;

assert.match(adapter, /requirePhysicalLoadCase/u);
assert.match(adapter, /requireSolverExecution/u);
assert.equal(adapter.includes('compileSolverExecution'), false, 'controlled influence adapter must validate receipts, never run LFEA');
for (const token of ['linear-fea-solver', 'linear-fea-load-case', 'requireSolverExecution', 'compileSolverExecution']) {
  assert.equal(tlRuntime.includes(token), false, `ordinary TL runtime may not depend on ${token}`);
}
for (const declaration of [
  'sourceSolverExecutedByAdapter: false',
  'srcRuntimeDependencyCreated: false',
  'localScalarStiffnessInferredFromMatrix: false',
  'matrixEvidenceAutomaticallyPromotedToProduction: false',
  'localScreenExecutionPerformed: false',
  'activeSetRedistributionPerformed: false',
  'productionCalculationConsumptionEnabled: false',
  'productionMethodRegistrationPermitted: false',
  'finalHotReactionPublicationPermitted: false',
]) assert.ok(adapter.includes(declaration), `${declaration} must remain explicit`);

assert.match(adapter, /loadCase\.primitives\.length !== 1/u, 'each source column must come from one exact load primitive');
assert.match(adapter, /primitive\.kind !== 'NODAL_FORCE_MOMENT'/u, 'source column must be a nodal-force probe');
assert.match(adapter, /primitive\.basis\?\.kind !== 'GLOBAL'/u, 'probe basis must be global');
assert.match(adapter, /primitive\.force\.fz > 0/u, 'forced source column must use positive global Z force');
assert.match(adapter, /primitive\.force\.fx !== 0/u, 'horizontal mixed force must be rejected');
assert.match(adapter, /primitive\.moment\.mx !== 0/u, 'mixed moment must be rejected');
assert.equal(/1\s*\/\s*.*matrix|inverse\s*\(/u.test(adapter), false, 'adapter must not turn matrix diagonals into local k or invent a matrix inverse');
assert.match(validator, /TL_CONTROLLED_INFLUENCE_MATRIX_COLUMN_MISMATCH/u, 'independent matrix/column re-derivation must remain present');
for (const token of ['empirical-method-registry', 'load-calc-consumer-view', 'load-calc-consumer-controller', 'EngineeringInputSeal']) {
  assert.equal(qualification.includes(token), false, `qualification-only influence batch crossed production boundary: ${token}`);
}

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-controlled-influence-guard',
  status: 'PASS',
  qualificationOnlyAdapter: true,
  sealedLfeaEvidenceValidationPresent: true,
  sourceSolverExecutionInsideAdapter: false,
  productionTlLfeaDependency: false,
  exactVerticalUnitForceProbeRequired: true,
  mixedForceMomentProbeRejected: true,
  localScalarStiffnessInferredFromMatrix: false,
  matrixInverseInventedByAdapter: false,
  activeSetRedistributionPerformed: false,
  productionRegistrationPermitted: false,
}, null, 2));
