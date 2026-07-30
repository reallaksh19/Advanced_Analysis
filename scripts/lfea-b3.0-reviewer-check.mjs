#!/usr/bin/env node

/**
 * LFEA B-3.0 permanent reviewer regressions.
 *
 * Each case below is a mistake a later edit could plausibly reintroduce into
 * the physical load-case layer: a hidden default standing in for a declared
 * policy, display metadata reaching an engineering hash, a B31.3 category
 * accepted as a solver combination, the stiffness state folded into the
 * load-case hash, an approximation disclosure lost, or a prescribed movement
 * quietly treated as a change to the model.
 */

import assert from 'node:assert/strict';
import {
  compilePhysicalLoadCase,
  sealLoadCaseCombination,
  sealLoadCaseProfile,
} from '../src/core/linear-fea-load-case/index.js';
import * as loadCasePackage from '../src/core/linear-fea-load-case/index.js';
import {
  loadCaseInput,
  loadCaseProfile,
  modelReference,
  prescribedMovementPrimitive,
  temperaturePrimitive,
  thermalCaseInput,
  weightCaseInput,
} from './lfea-b3.0-load-case-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

const baseline = compilePhysicalLoadCase(loadCaseInput());

/*
 * Regression 1 — a hidden default reintroduced as a declared value.
 *
 * `{value: 9.80665, source: 'DEFAULT'}` is the shape this package is most
 * likely to acquire, because standard gravity feels like a constant rather than
 * a project decision. It is refused, and the package exports no ready-made
 * profile that would let a caller compile without authoring one.
 */
const disguisedDefault = {
  schema: 'fea-linear-load-case-profile/v1',
  profileId: 'LINEAR-LOAD-CASE-R1',
  primitiveImmutabilityRule: 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1',
  thermalStrainApproximation: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
  combinationSemanticsRule: 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1',
  codeCombinationRule: 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1',
  gravitationalAcceleration: { value: 9.80665, source: 'DEFAULT' },
  directionUnitTolerance: { value: 1e-12, source: 'LFEA-B3.0-FIXTURE-PROFILE' },
  semanticHash: '',
};
expectCode(() => sealLoadCaseProfile(disguisedDefault), 'LOAD_CASE_PROFILE_SOURCE_NOT_TRACEABLE');
for (const [name, value] of Object.entries(loadCasePackage)) {
  if (typeof value !== 'object' || value === null) continue;
  assert.notEqual(
    value?.profileId,
    'LINEAR-LOAD-CASE-R1',
    `${name} exports a ready-made load-case profile; the profile must come from the project`,
  );
}

/*
 * Regression 2 — display metadata reaching an engineering hash, or load content
 * failing to reach one.
 *
 * Section 13.1: changing a display preference changes no engineering hash.
 * Section 7.2: a primitive load case is hash-bound to its content.
 */
const relabelled = compilePhysicalLoadCase(loadCaseInput({
  presentation: { label: 'Operating case 1 (hot)', description: 'Renamed for the report.' },
}));
assert.notDeepEqual(relabelled.presentation, baseline.presentation);
for (const field of ['physicalLoadCaseHash', 'semanticHash', 'evidenceHash']) {
  assert.equal(
    relabelled[field],
    baseline[field],
    `display-only metadata must not change ${field}`,
  );
}
const revalued = compilePhysicalLoadCase(loadCaseInput({
  primitives: loadCaseInput().primitives.map((primitive) => (primitive.kind === 'PRESCRIBED_MOVEMENT'
    ? prescribedMovementPrimitive({ value: -0.006 })
    : primitive)),
}));
assert.notEqual(
  revalued.physicalLoadCaseHash,
  baseline.physicalLoadCaseHash,
  'a changed prescribed movement value must change the load-case content hash',
);

/*
 * Regression 3 — a B31.3 category combination accepted as a solver combination.
 *
 * Section 7.2: code combinations are not solver load cases. They reference
 * qualified result components and apply edition rules, which is B-4.0's work.
 * A category token must be refused wherever a solver-side name is expected,
 * rather than accepted and later double-counted.
 */
const reference = baseline.modelReference;
const weightCase = compilePhysicalLoadCase(weightCaseInput(reference));
const thermalCase = compilePhysicalLoadCase(thermalCaseInput(reference));
expectCode(
  () => sealLoadCaseCombination(
    {
      combinationId: 'CMB-SUS-01',
      combinationKind: 'CODE_CATEGORY_COMBINATION',
      members: [{ loadCaseId: 'LC-WEIGHT-01', scale: 1 }],
      presentation: { label: 'Sustained', description: '' },
    },
    [weightCase],
  ),
  'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
);
for (const tag of ['SUSTAINED', 'Occasional', 'displacement-stress-range', 'B31.3']) {
  expectCode(
    () => sealLoadCaseCombination(
      {
        combinationId: tag.replace(/[^A-Za-z0-9._-]/gu, '-'),
        combinationKind: 'SOLVER_LINEAR_SUPERPOSITION',
        members: [{ loadCaseId: 'LC-WEIGHT-01', scale: 1 }],
        presentation: { label: tag, description: '' },
      },
      [weightCase],
    ),
    'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
  );
}

/*
 * Regression 4 — the mechanical model or its stiffness state folded into the
 * load-case content hash.
 *
 * Section 2.1 places `physicalLoadCaseHash` after `stiffnessStateHash` as the
 * next link, and section 7.2 keys factorization reuse by stiffness state and
 * constrained partition, not by load-case hash. One right-hand side must keep
 * one content identity across every stiffness state it is declared against,
 * while the accepted record still records which model it was bound to.
 */
const stifferReference = modelReference({
  constraintDeclarations: [
    { declarationId: 'C-N120-UX', kind: 'NODAL_RESTRAINT', nodeId: 'N-000120', dof: 'UX', behavior: 'FIXED' },
    { declarationId: 'C-N122-UZ', kind: 'PARTIAL_RELEASE_SPRING', nodeId: 'N-000122', dof: 'UZ', stiffness: 9e6 },
  ],
});
assert.notEqual(stifferReference.stiffnessStateHash, reference.stiffnessStateHash);
const rebound = compilePhysicalLoadCase(loadCaseInput({ modelReference: stifferReference }));
assert.equal(rebound.physicalLoadCaseHash, baseline.physicalLoadCaseHash);
assert.notEqual(rebound.semanticHash, baseline.semanticHash);
assert.equal(
  JSON.stringify(baseline.physicalLoadCaseHash).includes(reference.stiffnessStateHash),
  false,
);

/*
 * Regression 5 — a prescribed movement treated as a change to the model.
 *
 * Section 7.1: a case value bound to a named prescribed slot does not alter
 * stiffness identity. The slot itself is a model constraint, so supplying,
 * changing or omitting the value must leave both model identities untouched.
 */
const withoutMovement = compilePhysicalLoadCase(loadCaseInput({
  primitives: loadCaseInput().primitives.filter((primitive) => primitive.kind !== 'PRESCRIBED_MOVEMENT'),
}));
for (const field of ['stiffnessStateHash', 'mechanicalModelSemanticHash', 'semanticHash']) {
  assert.equal(withoutMovement.modelReference[field], baseline.modelReference[field]);
  assert.equal(revalued.modelReference[field], baseline.modelReference[field]);
}
assert.notEqual(withoutMovement.physicalLoadCaseHash, baseline.physicalLoadCaseHash);

/*
 * Regression 6 — an approximation disclosure lost or silently merged away.
 *
 * The uniform-temperature approximation is the disclosure this layer exists to
 * carry (section 5.4, section 11). Two temperature states declare it twice and
 * it must survive de-duplication exactly once: present, and present only once.
 */
assert.deepEqual(
  baseline.limitations.map((entry) => entry.code),
  [
    'LOAD_CASE_LIMITATION_EQUIVALENT_STATIC_NO_DYNAMIC_AMPLIFICATION',
    'LOAD_CASE_LIMITATION_PRESSURE_EFFECT_CODE_STRESS',
    'LOAD_CASE_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION',
  ],
);
const twoTemperatures = compilePhysicalLoadCase(loadCaseInput({
  loadCaseClass: 'THERMAL',
  primitives: [
    temperaturePrimitive(),
    temperaturePrimitive({ primitiveId: 'LP-TEMPERATURE-E121', elementId: 'E-000121' }),
  ],
}));
assert.deepEqual(
  twoTemperatures.limitations.map((entry) => entry.code),
  ['LOAD_CASE_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION'],
  'one disclosure per code, never duplicated and never dropped',
);
assert.equal(
  twoTemperatures.limitations.every((entry) => entry.stiffnessRelevant === false),
  true,
);
assert.equal(
  thermalCase.limitations.some((entry) => entry.details.approximationProfileId === 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1'),
  true,
  'the disclosure must name the approximation profile it was produced under',
);

/*
 * Regression 7 — the profile silently accepting the deferred thermal compiler.
 */
expectCode(
  () => loadCaseProfile({ thermalStrainApproximation: 'TEMPERATURE_DEPENDENT_ALPHA_INTEGRATION_V1' }),
  'LOAD_CASE_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED',
);

console.log('LFEA B-3.0 reviewer regression check PASS');
