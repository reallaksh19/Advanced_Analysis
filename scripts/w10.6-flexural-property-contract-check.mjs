import assert from 'node:assert/strict';
import { ENGINEERING_PROPERTY_SPECS } from '../src/core/shared-piping-model/property-specs.js';
import { AUDIT_CODES, FLEXURAL_BASIS } from '../src/core/vertical-beam-solver/index.js';
import { buildBeamFixture } from './w10.6-beam-fixtures.mjs';

const selected = process.argv[2] || 'all';
const checks = Object.freeze({
  aliases: checkAliases,
  precedence: checkPrecedence,
  invalid: checkInvalidAndMissingEvidence,
  circular: checkCircularDerivation,
  unsupported: checkUnsupportedTypes,
  immutability: checkImmutabilityAndStability,
});

console.log(`\n--- W10.6 Flexural Property Contract Checks · ${selected} ---\n`);
if (selected === 'all') Object.values(checks).forEach((check) => check());
else if (checks[selected]) checks[selected]();
else throw new TypeError(`Unknown W10.6 flexural-property check: ${selected}`);
console.log(`✅ W10.6 flexural-property ${selected} check passed.\n`);

function checkAliases() {
  assert.deepEqual(ENGINEERING_PROPERTY_SPECS.elasticModulusMpa.aliases, [
    'ELASTIC_MODULUS_MPA', 'YOUNGS_MODULUS_MPA', 'YOUNG_MODULUS_MPA', 'MODULUS_OF_ELASTICITY_MPA',
  ]);
  assert.deepEqual(ENGINEERING_PROPERTY_SPECS.secondMomentAreaMm4.aliases, [
    'SECOND_MOMENT_AREA_MM4', 'AREA_MOMENT_OF_INERTIA_MM4',
  ]);
  assert.deepEqual(ENGINEERING_PROPERTY_SPECS.flexuralRigidityNm2.aliases, [
    'FLEXURAL_RIGIDITY_N_M2', 'EI_N_M2',
  ]);
  const aliases = Object.values(ENGINEERING_PROPERTY_SPECS).flatMap((row) => row.aliases);
  ['E', 'I', 'MODULUS', 'INERTIA'].forEach((value) => assert.equal(aliases.includes(value), false));
}

function checkPrecedence() {
  const directEi = record({ ei: 3e6, eMpa: -1, iMm4: -1, odMm: 100, wallMm: 5 });
  assert.equal(directEi.qualification, 'READY');
  assert.equal(directEi.resolutionBasis, FLEXURAL_BASIS.DIRECT_EI);
  assert.equal(directEi.flexuralRigidityNm2, 3e6);

  const directI = record({ eMpa: 200000, iMm4: 1.25e7, odMm: 100, wallMm: 60 });
  assert.equal(directI.qualification, 'READY');
  assert.equal(directI.resolutionBasis, FLEXURAL_BASIS.EXPLICIT_E_I);
  assert.equal(directI.elasticModulusPa, 2e11);
  assert.ok(close(directI.secondMomentAreaM4, 1.25e-5, 1e-15));
  assert.ok(close(directI.flexuralRigidityNm2, 2.5e6, 1e-12));
}

function checkInvalidAndMissingEvidence() {
  assertBlock({}, AUDIT_CODES.MISSING_FLEXURAL_PROPERTY);
  assertBlock({ eMpa: -1, iMm4: 1e7 }, AUDIT_CODES.INVALID_ELASTIC_MODULUS);
  assertBlock({ eMpa: 200000, iMm4: 0 }, AUDIT_CODES.INVALID_SECOND_MOMENT);
  assertBlock({ ei: -1, eMpa: 200000, iMm4: 1e7 }, AUDIT_CODES.INVALID_FLEXURAL_RIGIDITY);
  assertBlock({ eMpa: 200000, odMm: 100, wallMm: 50 }, AUDIT_CODES.INVALID_CIRCULAR_SECTION);
  assertBlock({ eMpa: 200000, odMm: 0, wallMm: 5 }, AUDIT_CODES.INVALID_CIRCULAR_SECTION);
}

function checkCircularDerivation() {
  const row = record({ eMpa: 200000, odMm: 100, wallMm: 5 });
  const id = 0.09;
  const expectedI = Math.PI / 64 * (0.1 ** 4 - id ** 4);
  assert.equal(row.qualification, 'READY');
  assert.equal(row.resolutionBasis, FLEXURAL_BASIS.CIRCULAR_E_I);
  assert.ok(close(row.secondMomentAreaM4, expectedI, 1e-15));
  assert.ok(close(row.flexuralRigidityNm2, 2e11 * expectedI, 1e-8));
  assert.deepEqual(row.formulaTrace.map((item) => item.formulaId), [
    'CIRCULAR_HOLLOW_SECTION_SECOND_MOMENT_V1', 'FLEXURAL_RIGIDITY_FROM_E_AND_I_V1',
  ]);
  assert.equal(row.sourceEvidence.every((item) => item.sourcePath), true);
}

function checkUnsupportedTypes() {
  const unsupported = record({ eMpa: 200000, iMm4: 1e7 }, 'VALVE');
  assert.equal(unsupported.qualification, 'BLOCKED');
  assert.equal(unsupported.diagnostics[0].code, AUDIT_CODES.UNSUPPORTED_COMPONENT_FLEXURAL_MODEL);
  const direct = record({ ei: 2e6 }, 'VALVE');
  assert.equal(direct.qualification, 'READY');
  assert.equal(direct.resolutionBasis, FLEXURAL_BASIS.DIRECT_EI);
}

function checkImmutabilityAndStability() {
  const first = buildBeamFixture({ flexural: { ei: 2e6 }, loads: { EMPTY: [], OPE: [], HYD: [] } });
  const second = buildBeamFixture({ flexural: { ei: 2e6 }, loads: { EMPTY: [], OPE: [], HYD: [] } });
  assert.equal(first.foundation.flexuralProjection.semanticHash, second.foundation.flexuralProjection.semanticHash);
  assertDeepFrozen(first.foundation.flexuralProjection);
  assertDeepFrozen(first.foundation.beamModel);
  assert.throws(() => { first.foundation.flexuralProjection.records[0].flexuralRigidityNm2 = 1; }, TypeError);
}

function record(flexural, type = 'PIPE') {
  return buildBeamFixture({ lengthsM: [1], componentTypes: [type], flexural, loads: { EMPTY: [], OPE: [], HYD: [] } })
    .foundation.flexuralProjection.records[0];
}
function assertBlock(flexural, code) {
  const row = record(flexural);
  assert.equal(row.qualification, 'BLOCKED');
  assert.equal(row.diagnostics.some((item) => item.code === code), true);
}
function close(actual, expected, tolerance) { return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)); }
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(assertDeepFrozen);
}
