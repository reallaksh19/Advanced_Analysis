import assert from 'node:assert/strict';
import {
  buildModelLoadFoundation,
  createDefaultLoadCaseSet,
  validateEngineeringLoadSourceProjection,
  validateGravityProfile,
  validateLoadCaseSet,
  validateLoadCompositionProfile,
  validateModelLoadPrimitiveSet,
  validateModelLoadReadinessAudit,
} from '../src/core/model-loads/index.js';
import { component, evidence, pipeEvidence, sharedModel, topology } from './w10.4-model-load-fixtures.mjs';

const directPipe = component('PIPE-DIRECT', 'PIPE', {
  engineeringProperties: pipeEvidence({
    unitPipeWeightKgPerM: evidence(12, 'kg/m', 'DIRECT_PIPE'),
    insulationWeightKgPerM: evidence(0, 'kg/m', 'DIRECT_INSULATION'),
    fluidWeightOpeKgPerM: evidence(2, 'kg/m', 'DIRECT_OPE'),
    fluidWeightHydKgPerM: evidence(3, 'kg/m', 'DIRECT_HYD'),
  }),
});
const valve = component('VALVE-1', 'VALVE', {
  start: null, end: null, center: { x: 500, y: 0, z: 0 }, ports: [],
  engineeringProperties: { componentWeightKg: evidence(10, 'kg', 'VALVE_WEIGHT') },
  loadEvidence: {
    explicitPointMomentNm: evidence(25, 'N*m', 'MOMENT'),
    momentAxis: evidence('LOCAL_Z', '', 'MOMENT_AXIS'),
  },
});
const model = sharedModel([valve, directPipe]);
const result = buildModelLoadFoundation(model, topology(model));
assert(validateGravityProfile(result.gravityProfile).ok);
assert(validateLoadCaseSet(result.loadCaseSet).ok);
assert(validateLoadCompositionProfile(result.compositionProfile).ok);
assert(validateEngineeringLoadSourceProjection(result.loadSourceProjection).ok);
assert(validateModelLoadPrimitiveSet(result.loadPrimitiveSet).ok);
assert(validateModelLoadReadinessAudit(result.readinessAudit).ok);
assert(Object.isFrozen(result.loadPrimitiveSet.primitives));
assert.deepEqual(result.loadCaseSet.loadCases.map((row) => row.loadCaseId), ['EMPTY', 'HYD', 'OPE']);
assert.equal(result.gravityProfile.accelerationMPerS2, 9.80665);
assert(result.loadPrimitiveSet.primitives.every((row) => row.globalVector === null));
assert.equal(result.loadPrimitiveSet.primitives.filter((row) => row.primitiveType === 'EXPLICIT_POINT_MOMENT').length, 3);
assert.equal(result.readinessAudit.cases.every((row) => row.qualification === 'READY'), true);
assertReconciliation(result);

const derivedPipe = component('PIPE-DERIVED', 'PIPE', { engineeringProperties: pipeEvidence() });
const derived = build(derivedPipe);
assert(derived.loadPrimitiveSet.primitives.some((row) => row.formulaTrace.some((trace) => trace.formulaId === 'PIPE_METAL_MASS_PER_LENGTH_V1')));
assert(derived.loadPrimitiveSet.primitives.some((row) => row.formulaTrace.some((trace) => trace.formulaId === 'FLUID_MASS_PER_LENGTH_V1')));
assert(derived.loadPrimitiveSet.primitives.every((row) => row.formulaTrace.every((trace) => trace.fallbackUsed === false)));

const invalidWall = build(component('PIPE-BAD', 'PIPE', { engineeringProperties: pipeEvidence({ wallThicknessMm: evidence(50, 'mm', 'BAD_WALL') }) }));
assert(caseOf(invalidWall, 'EMPTY').blockers.includes('INVALID_SECTION_DIMENSIONS'));

const missingDensity = build(component('PIPE-NO-RHO', 'PIPE', { engineeringProperties: pipeEvidence({ materialDensityKgM3: undefined }) }));
assert(caseOf(missingDensity, 'EMPTY').blockers.includes('MISSING_PIPE_MASS_INPUT'));

const zeroInsulation = build(component('PIPE-ZERO-INS', 'PIPE', { engineeringProperties: pipeEvidence({ insulationThicknessMm: evidence(0, 'mm', 'ZERO_INS') }) }));
assert.equal(caseOf(zeroInsulation, 'EMPTY').qualification, 'READY');

const derivedInsulation = build(component('PIPE-INS', 'PIPE', { engineeringProperties: pipeEvidence({
  insulationThicknessMm: evidence(20, 'mm', 'INS_T'),
  insulationDensityKgM3: evidence(120, 'kg/m3', 'INS_RHO'),
}) }));
assert(derivedInsulation.loadPrimitiveSet.primitives.some((row) => row.formulaTrace.some((trace) => trace.formulaId === 'INSULATION_MASS_PER_LENGTH_V1')));

const opeMissing = build(component('PIPE-OPE-MISSING', 'PIPE', { engineeringProperties: pipeEvidence({ fluidDensityOpeKgM3: undefined }) }));
assert.equal(caseOf(opeMissing, 'EMPTY').qualification, 'READY');
assert.equal(caseOf(opeMissing, 'HYD').qualification, 'READY');
assert(caseOf(opeMissing, 'OPE').blockers.includes('MISSING_OPE_FLUID_INPUT'));

const hydMissing = build(component('PIPE-HYD-MISSING', 'PIPE', { engineeringProperties: pipeEvidence({ fluidDensityHydKgM3: undefined }) }));
assert.equal(caseOf(hydMissing, 'EMPTY').qualification, 'READY');
assert.equal(caseOf(hydMissing, 'OPE').qualification, 'READY');
assert(caseOf(hydMissing, 'HYD').blockers.includes('MISSING_HYD_FLUID_INPUT'));

for (const type of ['VALVE', 'FLANGE', 'TEE', 'REDUCER']) {
  const lumped = build(component(`L-${type}`, type, { start: null, end: null, center: { x: 0, y: 0, z: 0 }, ports: [],
    engineeringProperties: { componentWeightKg: evidence(5, 'kg', `${type}_MASS`) } }));
  assert.equal(lumped.loadPrimitiveSet.primitives.filter((row) => row.primitiveType === 'POINT_GRAVITY_LOAD').length, 3);
}

const zeroValve = build(component('VALVE-ZERO', 'VALVE', { start: null, end: null, center: { x: 0, y: 0, z: 0 }, ports: [],
  engineeringProperties: { componentWeightKg: evidence(0, 'kg', 'ZERO_MASS') } }));
assert(zeroValve.loadPrimitiveSet.primitives.some((row) => row.pointMassKg === 0));

const missingCog = build(component('VALVE-NO-COG', 'VALVE', { start: null, end: null, center: null, ports: [],
  engineeringProperties: { componentWeightKg: evidence(5, 'kg', 'MASS') } }));
assert(caseOf(missingCog, 'EMPTY').blockers.includes('MISSING_COMPONENT_COG'));

const doubleCount = build(component('PIPE-DOUBLE', 'PIPE', { engineeringProperties: pipeEvidence({
  unitPipeWeightKgPerM: evidence(10, 'kg/m', 'LINEAR'), componentWeightKg: evidence(20, 'kg', 'POINT'),
}) }));
assert(caseOf(doubleCount, 'EMPTY').blockers.includes('DOUBLE_COUNT_CONFLICT'));

const unknown = build(component('UNKNOWN-1', 'MYSTERY', { start: null, end: null, center: { x: 0, y: 0, z: 0 }, ports: [], engineeringProperties: {} }));
assert(caseOf(unknown, 'EMPTY').blockers.includes('UNSUPPORTED_COMPONENT_TYPE'));

const negative = build(component('PIPE-NEG', 'PIPE', { engineeringProperties: pipeEvidence({ unitPipeWeightKgPerM: evidence(-1, 'kg/m', 'NEG') }) }));
assert(caseOf(negative, 'EMPTY').blockers.includes('INVALID_NEGATIVE_VALUE'));

const lengthConflict = build(component('PIPE-LENGTH-CONFLICT', 'PIPE', {
  compatibilityEvidence: { sourceLengthMm: evidence(2000, 'mm', 'DECLARED_LENGTH') },
  engineeringProperties: pipeEvidence(),
}));
assert(caseOf(lengthConflict, 'EMPTY').blockers.includes('GEOMETRY_LENGTH_CONFLICT'));
assert.equal(lengthConflict.loadPrimitiveSet.primitives.some((row) => row.componentKey === 'PIPE-LENGTH-CONFLICT'), false);

const lumpedLinear = build(component('VALVE-LINEAR-MASS', 'VALVE', {
  center: { x: 500, y: 0, z: 0 },
  engineeringProperties: { unitPipeWeightKgPerM: evidence(5, 'kg/m', 'INVALID_LINEAR_VALVE_MASS') },
}));
assert(caseOf(lumpedLinear, 'EMPTY').blockers.includes('LUMPED_LINEAR_MASS_CONFLICT'));
assert.equal(lumpedLinear.loadPrimitiveSet.primitives.some((row) => row.componentKey === 'VALVE-LINEAR-MASS'), false);

const reversedCases = createDefaultLoadCaseSet(['OPE', 'EMPTY', 'HYD']);
assert.equal(reversedCases.semanticHash, createDefaultLoadCaseSet().semanticHash);
const reorderedModel = sharedModel([directPipe, valve]);
assert.equal(buildModelLoadFoundation(reorderedModel, topology(reorderedModel)).loadPrimitiveSet.semanticHash, result.loadPrimitiveSet.semanticHash);
console.log('W10.4 model-load contract checks passed.');

function build(item) { const current = sharedModel([item]); return buildModelLoadFoundation(current, topology(current)); }
function caseOf(current, id) { return current.readinessAudit.cases.find((row) => row.loadCaseId === id); }
function assertReconciliation(current) {
  for (const row of current.readinessAudit.cases) {
    const primitives = current.loadPrimitiveSet.primitives.filter((item) => item.loadCaseId === row.loadCaseId);
    const mass = primitives.reduce((sum, item) => sum + (item.pointMassKg ?? ((item.massPerLengthKgM || 0) * (item.sourceLengthM || 0))), 0);
    const force = primitives.reduce((sum, item) => sum + (item.pointForceN ?? ((item.forcePerLengthNM || 0) * (item.sourceLengthM || 0))), 0);
    assert.equal(row.totalMassKg, mass);
    assert.equal(row.totalForceN, force);
  }
}
