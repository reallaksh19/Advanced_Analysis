#!/usr/bin/env node

/**
 * LFEA B-3.0 physical load-case contract check.
 *
 * Covers `src/core/linear-fea-load-case/`: the section 7.1 load primitives, the
 * section 7.2 case and combination architecture, the section 2.1 position of
 * `physicalLoadCaseHash`, the section 5.4 thermal-strain approximation
 * boundary, the section 6 prescribed-slot binding and the prohibition on any
 * undeclared numerical policy.
 */

import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHYSICAL_LOAD_CASE_RECORD_KEYS,
  compilePhysicalLoadCase,
  requireLoadPrimitive,
  requirePhysicalLoadCase,
  sealLoadCaseCombination,
  sealLoadCaseProfile,
} from '../src/core/linear-fea-load-case/index.js';
import {
  clone,
  distributedLoadPrimitive,
  distributedWeightPrimitive,
  equivalentStaticPrimitive,
  gravityPrimitive,
  loadCaseInput,
  loadCaseProfile,
  modelReference,
  nodalForcePrimitive,
  prescribedMovementPrimitive,
  pressurePrimitive,
  temperaturePrimitive,
  thermalCaseInput,
  weightCaseInput,
} from './lfea-b3.0-load-case-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertDeepFrozen(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  if (Array.isArray(value)) value.forEach((child, index) => assertDeepFrozen(child, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
}

function profileWithout(field) {
  const draft = {
    schema: 'fea-linear-load-case-profile/v1',
    profileId: 'LINEAR-LOAD-CASE-R1',
    primitiveImmutabilityRule: 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1',
    thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    combinationSemanticsRule: 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1',
    codeCombinationRule: 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1',
    gravitationalAcceleration: { value: 9.80665, source: 'LFEA-B3.0-FIXTURE-PROFILE' },
    directionUnitTolerance: { value: 1e-12, source: 'LFEA-B3.0-FIXTURE-PROFILE' },
    semanticHash: '',
  };
  delete draft[field];
  return draft;
}

console.log('\n--- LFEA B-3.0 physical load-case check ---');

const loadCase = compilePhysicalLoadCase(loadCaseInput());

test('B30-T01', 'Compilation produces a sealed physical load-case package', () => {
  assert.deepEqual(Object.keys(loadCase).sort(), [...PHYSICAL_LOAD_CASE_RECORD_KEYS].sort());
  assert.equal(loadCase.schema, 'fea-linear-physical-load-case/v1');
  assert.equal(loadCase.primitives.length, 8);
  assert.deepEqual(
    [...new Set(loadCase.primitives.map((primitive) => primitive.kind))].sort(),
    [
      'DISTRIBUTED_LOAD',
      'DISTRIBUTED_WEIGHT',
      'EQUIVALENT_STATIC',
      'GRAVITY',
      'NODAL_FORCE_MOMENT',
      'PRESCRIBED_MOVEMENT',
      'PRESSURE',
      'TEMPERATURE',
    ],
  );
  assert.equal(loadCase.units.force, 'N');
  assertDeepFrozen(loadCase);
  requirePhysicalLoadCase(clone(loadCase));
});

test('B30-T02', 'physicalLoadCaseHash is a pure function of load-case content', () => {
  const stiffer = modelReference({
    constraintDeclarations: [
      { declarationId: 'C-N120-UX', kind: 'NODAL_RESTRAINT', nodeId: 'N-000120', dof: 'UX', behavior: 'FIXED' },
      { declarationId: 'C-N122-UZ', kind: 'PARTIAL_RELEASE_SPRING', nodeId: 'N-000122', dof: 'UZ', stiffness: 9e6 },
    ],
  });
  assert.notEqual(stiffer.stiffnessStateHash, loadCase.modelReference.stiffnessStateHash);
  const rebound = compilePhysicalLoadCase(loadCaseInput({ modelReference: stiffer }));
  assert.equal(
    rebound.physicalLoadCaseHash,
    loadCase.physicalLoadCaseHash,
    'the stiffness state must not fold into the load-case content hash',
  );
  assert.notEqual(
    rebound.semanticHash,
    loadCase.semanticHash,
    'the accepted record still binds the model it was declared against',
  );
  assert.equal(loadCase.modelReference.stiffnessStateHash.startsWith('fnv1a64:'), true);
});

test('B30-T03', 'Repeated compilation is byte-identical and primitive order is irrelevant', () => {
  const repeat = compilePhysicalLoadCase(loadCaseInput());
  assert.equal(canonicalStringify(repeat), canonicalStringify(loadCase));
  const shuffled = loadCaseInput();
  shuffled.primitives.reverse();
  const reordered = compilePhysicalLoadCase(shuffled);
  assert.equal(canonicalStringify(reordered), canonicalStringify(loadCase));
});

test('B30-T04', 'Every primitive is independently hash-bound and immutable', () => {
  for (const primitive of loadCase.primitives) {
    assert.match(primitive.semanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
    assert.equal(primitive.schema, 'fea-linear-load-primitive/v1');
    requireLoadPrimitive(clone(primitive));
    const tampered = clone(primitive);
    tampered.semanticHash = 'fnv1a64:0000000000000000';
    expectCode(() => requireLoadPrimitive(tampered), 'LOAD_CASE_HASH_MISMATCH');
  }
  const changed = compilePhysicalLoadCase(loadCaseInput({
    primitives: [
      gravityPrimitive(),
      distributedWeightPrimitive({ massPerUnitLength: 18.5 }),
      pressurePrimitive(),
      temperaturePrimitive(),
      nodalForcePrimitive(),
      distributedLoadPrimitive(),
      equivalentStaticPrimitive(),
      prescribedMovementPrimitive(),
    ],
  }));
  const before = loadCase.primitives.map((primitive) => primitive.semanticHash);
  const after = changed.primitives.map((primitive) => primitive.semanticHash);
  assert.equal(before.filter((hash, index) => hash !== after[index]).length, 1);
  assert.notEqual(changed.physicalLoadCaseHash, loadCase.physicalLoadCaseHash);
});

test('B30-T05', 'A primitive may not name an entity the mechanical model lacks', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [nodalForcePrimitive({ nodeId: 'N-999999' })] })),
    'LOAD_CASE_NODE_UNKNOWN',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [pressurePrimitive({ elementId: 'E-999999' })] })),
    'LOAD_CASE_ELEMENT_UNKNOWN',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [temperaturePrimitive({ stiffnessEvaluationMaterialStateId: 'MAT-ABSENT' })],
    })),
    'LOAD_CASE_MATERIAL_STATE_UNKNOWN',
  );
});

test('B30-T06', 'Prescribed movement binds a named slot the model declares', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [prescribedMovementPrimitive({ prescribedSlotId: 'C-NO-SUCH-SLOT' })],
    })),
    'LOAD_CASE_PRESCRIBED_SLOT_UNKNOWN',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [prescribedMovementPrimitive({ dof: 'UZ' })],
    })),
    'LOAD_CASE_PRESCRIBED_SLOT_MISMATCH',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [
        prescribedMovementPrimitive(),
        prescribedMovementPrimitive({ primitiveId: 'LP-MOVEMENT-DUP', value: 0.001 }),
      ],
    })),
    'LOAD_CASE_PRESCRIBED_SLOT_DOUBLE_BOUND',
  );
});

test('B30-T07', 'One state per entity per case', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [pressurePrimitive(), pressurePrimitive({ primitiveId: 'LP-PRESSURE-DUP', pressure: 2.1e6 })],
    })),
    'LOAD_CASE_PRESSURE_STATE_AMBIGUOUS',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [temperaturePrimitive(), temperaturePrimitive({ primitiveId: 'LP-TEMP-DUP', operatingTemperature: 400 })],
    })),
    'LOAD_CASE_TEMPERATURE_STATE_AMBIGUOUS',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [gravityPrimitive(), gravityPrimitive({ primitiveId: 'LP-GRAVITY-2' })],
    })),
    'LOAD_CASE_GRAVITY_AMBIGUOUS',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [nodalForcePrimitive(), nodalForcePrimitive()],
    })),
    'LOAD_CASE_PRIMITIVE_AMBIGUOUS',
  );
  expectCode(() => compilePhysicalLoadCase(loadCaseInput({ primitives: [] })), 'LOAD_CASE_EMPTY');
});

test('B30-T08', 'Units are declared and never converted', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [nodalForcePrimitive({ units: { force: 'kN', moment: 'N*m', length: 'm' } })],
    })),
    'LOAD_CASE_UNIT_MISMATCH',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [distributedLoadPrimitive({ units: { distributedForce: 'N/mm', length: 'm' } })],
    })),
    'LOAD_CASE_UNIT_MISMATCH',
  );
});

test('B30-T09', 'No numerical policy is defaulted', () => {
  expectCode(() => sealLoadCaseProfile(profileWithout('gravitationalAcceleration')), 'LOAD_CASE_PROFILE_INVALID');
  const nulledGravity = profileWithout('x');
  nulledGravity.gravitationalAcceleration = null;
  expectCode(() => sealLoadCaseProfile(nulledGravity), 'GRAVITATIONAL_ACCELERATION_NOT_DECLARED');
  const nulledTolerance = profileWithout('x');
  nulledTolerance.directionUnitTolerance = null;
  expectCode(() => sealLoadCaseProfile(nulledTolerance), 'DIRECTION_UNIT_TOLERANCE_NOT_DECLARED');
  const bare = profileWithout('x');
  bare.gravitationalAcceleration = 9.80665;
  expectCode(() => sealLoadCaseProfile(bare), 'NOT_A_RECORD');
  const sourceless = profileWithout('x');
  sourceless.gravitationalAcceleration = { value: 9.80665 };
  expectCode(() => sealLoadCaseProfile(sourceless), 'MISSING_FIELD');
  for (const token of ['DEFAULT', 'default', 'FALLBACK', 'HARDCODED', 'UNKNOWN']) {
    const hidden = profileWithout('x');
    hidden.gravitationalAcceleration = { value: 9.80665, source: token };
    expectCode(() => sealLoadCaseProfile(hidden), 'LOAD_CASE_PROFILE_SOURCE_NOT_TRACEABLE');
  }
});

test('B30-T10', 'Gravity magnitude comes from the declared profile alone', () => {
  const gravity = loadCase.primitives.find((primitive) => primitive.kind === 'GRAVITY');
  assert.deepEqual(gravity.accelerationMagnitude, { value: 9.80665, source: 'LFEA-B3.0-FIXTURE-PROFILE' });
  assert.deepEqual(gravity.includedMassSources, ['CONTENTS', 'INSULATION', 'PIPE_WALL']);
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [gravityPrimitive({ accelerationMagnitude: { value: 9.81, source: 'LOCAL' } })],
    })),
    'LOAD_CASE_PRIMITIVE_INVALID',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [gravityPrimitive({ includedMassSources: [] })] })),
    'LOAD_CASE_GRAVITY_MASS_SOURCES_NOT_DECLARED',
  );
  const alternate = compilePhysicalLoadCase(loadCaseInput({
    profile: loadCaseProfile({ gravitationalAcceleration: { value: 9.78, source: 'PROJECT-SITE-GRAVITY' } }),
  }));
  assert.notEqual(alternate.physicalLoadCaseHash, loadCase.physicalLoadCaseHash);
});

test('B30-T11', 'The thermal-strain approximation is declared and alpha(T) integration is blocked', () => {
  const temperature = loadCase.primitives.find((primitive) => primitive.kind === 'TEMPERATURE');
  assert.equal(temperature.operatingTemperature, 393.15);
  assert.equal(temperature.installationTemperature, 293.15);
  assert.equal(temperature.stiffnessEvaluationMaterialStateId, 'MAT-A106B-393K');
  assert.deepEqual(
    temperature.limitations.map((entry) => entry.code),
    ['LOAD_CASE_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION'],
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [temperaturePrimitive({ thermalStrainProfileId: 'ANOTHER_PROFILE_V1' })],
    })),
    'LOAD_CASE_THERMAL_PROFILE_MISMATCH',
  );
  const deferred = profileWithout('x');
  deferred.thermalStrainApproximation = 'TEMPERATURE_DEPENDENT_ALPHA_INTEGRATION_V1';
  expectCode(() => sealLoadCaseProfile(deferred), 'LOAD_CASE_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED');
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [temperaturePrimitive({ operatingTemperature: 0 })] })),
    'LOAD_CASE_TEMPERATURE_STATE_INVALID',
  );
});

test('B30-T12', 'Every pressure effect is an explicit authorisation', () => {
  const pressure = loadCase.primitives.find((primitive) => primitive.kind === 'PRESSURE');
  assert.deepEqual(pressure.authorizedEffects, {
    codeStress: true,
    pressureStiffening: false,
    axialThrust: false,
    bourdon: false,
  });
  assert.deepEqual(
    pressure.limitations.map((entry) => entry.code),
    ['LOAD_CASE_LIMITATION_PRESSURE_EFFECT_CODE_STRESS'],
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [pressurePrimitive({ authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false } })],
    })),
    'LOAD_CASE_PRESSURE_EFFECT_NOT_DECLARED',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [pressurePrimitive({
        authorizedEffects: { codeStress: 'yes', pressureStiffening: false, axialThrust: false, bourdon: false },
      })],
    })),
    'LOAD_CASE_PRESSURE_EFFECT_NOT_DECLARED',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [pressurePrimitive({ pressure: -1e5, pressureBasis: 'ABSOLUTE' })],
    })),
    'LOAD_CASE_PRESSURE_STATE_INVALID',
  );
});

test('B30-T13', 'A declared direction is refused rather than renormalised', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [gravityPrimitive({ direction: { x: 0, y: 0, z: -9.80665 } })] })),
    'LOAD_CASE_DIRECTION_NOT_UNIT',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [equivalentStaticPrimitive({ direction: { x: 2, y: 0, z: 0 } })] })),
    'LOAD_CASE_DIRECTION_NOT_UNIT',
  );
});

test('B30-T14', 'A declared local basis is qualified, never repaired', () => {
  const local = compilePhysicalLoadCase(loadCaseInput({
    primitives: [nodalForcePrimitive({
      basis: {
        kind: 'DECLARED_LOCAL',
        e1: { x: 0, y: 1, z: 0 },
        e2: { x: 0, y: 0, z: 1 },
        e3: { x: 1, y: 0, z: 0 },
      },
    })],
  }));
  assert.equal(local.primitives[0].basis.kind, 'DECLARED_LOCAL');
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [nodalForcePrimitive({
        basis: {
          kind: 'DECLARED_LOCAL',
          e1: { x: 1, y: 0, z: 0 },
          e2: { x: 0, y: 1, z: 0 },
          e3: { x: 0, y: 0, z: 2 },
        },
      })],
    })),
    'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED',
  );
});

test('B30-T15', 'Only the applied-to-structure sign convention is representable', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [nodalForcePrimitive({ signConvention: 'REACTION_ON_SOURCE' })],
    })),
    'LOAD_CASE_SIGN_CONVENTION_NOT_REPRESENTABLE',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [nodalForcePrimitive({ signConvention: 'ASSUMED_POSITIVE' })],
    })),
    'LOAD_CASE_PRIMITIVE_INVALID',
  );
});

test('B30-T16', 'A distributed load declares its shape and its intensities consistently', () => {
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [distributedLoadPrimitive({ endIntensity: { fx: 0, fy: 0, fz: -300 } })],
    })),
    'LOAD_CASE_DISTRIBUTED_VARIATION_MISMATCH',
  );
  const varying = compilePhysicalLoadCase(loadCaseInput({
    primitives: [distributedLoadPrimitive({ variation: 'LINEAR', endIntensity: { fx: 0, fy: 0, fz: -300 } })],
  }));
  assert.equal(varying.primitives[0].variation, 'LINEAR');
  assert.equal(varying.primitives[0].endIntensity.fz, -300);
});

test('B30-T17', 'An equivalent static load declares coefficient, area and combination class', () => {
  const wind = loadCase.primitives.find((primitive) => primitive.kind === 'EQUIVALENT_STATIC');
  assert.deepEqual(wind.coefficient, { value: 0.7, source: 'PROJECT-WIND-BASIS-ASCE-7-INPUT' });
  assert.deepEqual(
    wind.limitations.map((entry) => entry.code),
    ['LOAD_CASE_LIMITATION_EQUIVALENT_STATIC_NO_DYNAMIC_AMPLIFICATION'],
  );
  const noCoefficient = equivalentStaticPrimitive();
  noCoefficient.coefficient = null;
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [noCoefficient] })),
    'COEFFICIENT_NOT_DECLARED',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ primitives: [equivalentStaticPrimitive({ projectedArea: 0 })] })),
    'LOAD_CASE_PRIMITIVE_INVALID',
  );
});

test('B30-T18', 'A B31.3 category is never accepted as a solver load case', () => {
  for (const tag of ['SUSTAINED', 'OCCASIONAL', 'DISPLACEMENT_STRESS_RANGE', 'OPERATING']) {
    expectCode(
      () => compilePhysicalLoadCase(loadCaseInput({ loadCaseClass: tag })),
      'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
    );
  }
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ loadCaseClass: 'GRAVITY_AND_WIND' })),
    'LOAD_CASE_CLASS_UNSUPPORTED',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({ loadCaseId: 'SUSTAINED' })),
    'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
  );
  expectCode(
    () => compilePhysicalLoadCase(loadCaseInput({
      primitives: [equivalentStaticPrimitive({ combinationClassId: 'OCCASIONAL' })],
    })),
    'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
  );
});

const reference = loadCase.modelReference;
const weightCase = compilePhysicalLoadCase(weightCaseInput(reference));
const thermalCase = compilePhysicalLoadCase(thermalCaseInput(reference));

test('B30-T19', 'A combination declares membership, scale and component semantics only', () => {
  const combination = sealLoadCaseCombination(
    {
      combinationId: 'CMB-OPERATING-01',
      combinationKind: 'SOLVER_LINEAR_SUPERPOSITION',
      members: [
        { loadCaseId: 'LC-WEIGHT-01', scale: 1 },
        { loadCaseId: 'LC-THERMAL-01', scale: 1 },
      ],
      presentation: { label: 'Operating', description: 'Weight plus thermal.' },
    },
    [weightCase, thermalCase],
  );
  assert.deepEqual(
    combination.members.map((member) => `${member.loadCaseId}:${member.componentSemanticsId}:${member.scale}`),
    ['LC-THERMAL-01:THERMAL:1', 'LC-WEIGHT-01:WEIGHT:1'],
  );
  assert.equal(combination.stiffnessStateHash, reference.stiffnessStateHash);
  assert.deepEqual(
    combination.limitations.map((entry) => entry.code),
    ['LOAD_CASE_LIMITATION_COMBINATION_SEMANTICS_UNVERIFIED'],
  );

  const declare = (overrides) => sealLoadCaseCombination(
    {
      combinationId: 'CMB-OPERATING-01',
      combinationKind: 'SOLVER_LINEAR_SUPERPOSITION',
      members: [{ loadCaseId: 'LC-WEIGHT-01', scale: 1 }],
      presentation: { label: 'Operating', description: '' },
      ...overrides,
    },
    [weightCase, thermalCase],
  );
  expectCode(() => declare({ members: [] }), 'LOAD_CASE_COMBINATION_EMPTY');
  expectCode(() => declare({ members: [{ loadCaseId: 'LC-ABSENT', scale: 1 }] }), 'LOAD_CASE_COMBINATION_MEMBER_UNKNOWN');
  expectCode(
    () => declare({ members: [{ loadCaseId: 'LC-WEIGHT-01', scale: 1 }, { loadCaseId: 'LC-WEIGHT-01', scale: -1 }] }),
    'LOAD_CASE_COMBINATION_MEMBER_AMBIGUOUS',
  );
  expectCode(() => declare({ members: [{ loadCaseId: 'LC-WEIGHT-01', scale: 0 }] }), 'LOAD_CASE_COMBINATION_SCALE_INVALID');
  expectCode(() => declare({ combinationKind: 'CODE_CATEGORY_COMBINATION' }), 'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE');
  expectCode(() => declare({ combinationId: 'SUSTAINED' }), 'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE');

  const otherStiffness = modelReference({
    constraintDeclarations: [
      { declarationId: 'C-N120-UX', kind: 'NODAL_RESTRAINT', nodeId: 'N-000120', dof: 'UX', behavior: 'FIXED' },
      { declarationId: 'C-N122-UZ', kind: 'PARTIAL_RELEASE_SPRING', nodeId: 'N-000122', dof: 'UZ', stiffness: 9e6 },
    ],
  });
  const foreign = compilePhysicalLoadCase(thermalCaseInput(otherStiffness));
  expectCode(
    () => sealLoadCaseCombination(
      {
        combinationId: 'CMB-MIXED-01',
        combinationKind: 'SOLVER_LINEAR_SUPERPOSITION',
        members: [{ loadCaseId: 'LC-WEIGHT-01', scale: 1 }, { loadCaseId: 'LC-THERMAL-01', scale: 1 }],
        presentation: { label: 'Mixed', description: '' },
      },
      [weightCase, foreign],
    ),
    'LOAD_CASE_COMBINATION_STIFFNESS_STATE_MISMATCH',
  );
});

test('B30-T20', 'Stale hashes and stiffness-relevant disclosures are refused', () => {
  for (const field of ['physicalLoadCaseHash', 'semanticHash', 'evidenceHash']) {
    const stale = clone(loadCase);
    stale[field] = 'fnv1a64:0000000000000000';
    expectCode(() => requirePhysicalLoadCase(stale), 'LOAD_CASE_HASH_MISMATCH');
  }
  const stiffnessRelevant = clone(loadCase);
  stiffnessRelevant.limitations[0].stiffnessRelevant = true;
  expectCode(
    () => requirePhysicalLoadCase(stiffnessRelevant),
    'LOAD_CASE_LIMITATION_STIFFNESS_RELEVANT_PROHIBITED',
  );
  const tamperedReference = clone(loadCase);
  tamperedReference.modelReference.stiffnessStateHash = 'fnv1a64:0000000000000000';
  expectCode(() => requirePhysicalLoadCase(tamperedReference), 'LOAD_CASE_HASH_MISMATCH');
});

console.log('\nLFEA B-3.0 physical load-case check PASS\n');
