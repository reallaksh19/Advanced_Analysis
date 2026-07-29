#!/usr/bin/env node

/**
 * LFEA B-2.5 permanent reviewer regressions.
 *
 * Each case below is a mistake a later edit could plausibly reintroduce into
 * the mechanical-model compiler: a hidden default standing in for a declared
 * policy, an unbound authority resolved from "the only one available", a
 * linear constraint dropped or counted twice, record identity leaking into
 * stiffness identity, an approximation disclosure lost during merge, or an
 * element silently reversed to match the axes it was handed.
 */

import assert from 'node:assert/strict';
import {
  compileMechanicalModel,
  sealMechanicalModelCompilerProfile,
} from '../src/core/linear-fea-model-compiler/index.js';
import * as compilerPackage from '../src/core/linear-fea-model-compiler/index.js';
import {
  clone,
  compilerInput,
  compilerProfile,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

const baseline = compileMechanicalModel(compilerInput());

/*
 * Regression 1 — a hidden default reintroduced as a declared value.
 *
 * `shared-analysis-contract` catches `{value: 1, source: 'DEFAULT'}` because a
 * default wearing a declaration's clothes is still a default. The same entry
 * must be refused here, and the package must not export a ready-made profile
 * that would let a caller compile without authoring one.
 */
const disguisedDefault = clone(compilerProfile());
disguisedDefault.minimumElementLength = { value: 1, source: 'DEFAULT' };
disguisedDefault.semanticHash = '';
expectCode(
  () => sealMechanicalModelCompilerProfile(disguisedDefault),
  'MODEL_COMPILER_PROFILE_SOURCE_NOT_TRACEABLE',
);
for (const [name, value] of Object.entries(compilerPackage)) {
  if (typeof value !== 'object' || value === null) continue;
  assert.notEqual(
    value?.profileId,
    'LINEAR-MODEL-COMPILER-R1',
    `${name} exports a ready-made compiler profile; the profile must come from the project`,
  );
}

/*
 * Regression 2 — resolving an unbound authority from the only candidate.
 *
 * The fixture supplies exactly one material state and one section state, which
 * is precisely the shape in which "just use the one we have" looks harmless.
 */
const unboundMaterial = compilerInput();
assert.equal(unboundMaterial.materialResolutions.length, 1);
unboundMaterial.elementBindings[0].materialStateId = 'MAT-NOT-RESOLVED';
expectCode(() => compileMechanicalModel(unboundMaterial), 'MODEL_COMPILER_MATERIAL_BINDING_MISSING');

const unboundSection = compilerInput();
assert.equal(unboundSection.sectionResolutions.length, 1);
unboundSection.elementBindings[0].sectionStateId = 'SEC-NOT-RESOLVED';
expectCode(() => compileMechanicalModel(unboundSection), 'MODEL_COMPILER_SECTION_BINDING_MISSING');

const unboundAxis = compilerInput();
unboundAxis.elementBindings[0].localAxisEvidenceIdentity = 'AXIS-NOT-RESOLVED';
expectCode(() => compileMechanicalModel(unboundAxis), 'MODEL_COMPILER_AXIS_BINDING_MISSING');

/*
 * Regression 3 — a linear constraint dropped or counted twice.
 */
const declarations = compilerInput().constraintDeclarations;
assert.equal(baseline.model.constraints.length, declarations.length);
assert.deepEqual(
  baseline.model.constraints.map((constraint) => constraint.constraintId).sort(),
  declarations.map((declaration) => declaration.declarationId).sort(),
);
assert.deepEqual(
  baseline.model.constraints
    .filter((constraint) => constraint.behavior === 'LINEAR_SPRING')
    .map((constraint) => constraint.stiffness),
  [4e6],
);
const withoutSpring = compilerInput();
withoutSpring.constraintDeclarations = withoutSpring.constraintDeclarations
  .filter((declaration) => declaration.kind !== 'PARTIAL_RELEASE_SPRING');
const springless = compileMechanicalModel(withoutSpring);
assert.equal(springless.model.constraints.length, 1);
assert.notEqual(
  springless.stiffnessStateHash,
  baseline.stiffnessStateHash,
  'removing a partial-release spring must change stiffness identity',
);

/*
 * Regression 4 — record identity or traceability prose leaking into stiffness
 * identity (specification section 15.5).
 */
const renamed = compilerInput();
renamed.elementBindings[0].elementId = 'Z-ELEMENT';
renamed.elementBindings[1].elementId = 'A-ELEMENT';
renamed.constraintDeclarations[0].declarationId = 'Z-RESTRAINT';
renamed.constraintDeclarations[1].declarationId = 'A-SPRING';
const renamedResult = compileMechanicalModel(renamed);
assert.equal(
  renamedResult.stiffnessStateHash,
  baseline.stiffnessStateHash,
  'element and constraint record IDs must not alter stiffness identity',
);
assert.notEqual(
  renamedResult.mechanicalModelSemanticHash,
  baseline.mechanicalModelSemanticHash,
  'element and constraint record IDs remain accepted-model semantics',
);
assert.deepEqual(
  renamedResult.bindings.map((binding) => binding.elementId),
  ['A-ELEMENT', 'Z-ELEMENT'],
  'binding traces must be emitted in canonical ascending order',
);

const retraced = compilerInput();
retraced.elementBindings.forEach((binding) => { binding.sourceComponentId = 'Line 1 / Component:14'; });
retraced.conditionedTopology.geometry.nodes.forEach((node) => { node.sourceComponentUid = 'Line 1 / Component:14'; });
const retracedResult = compileMechanicalModel(retraced);
assert.equal(
  retracedResult.stiffnessStateHash,
  baseline.stiffnessStateHash,
  'source ancestry must not alter stiffness identity',
);
assert.notEqual(
  retracedResult.mechanicalModelSemanticHash,
  baseline.mechanicalModelSemanticHash,
  'source ancestry must remain part of accepted-model semantics',
);
assert.deepEqual(
  retracedResult.model.nodes[0].sourceAncestry.sourceNodeIds,
  ['S1/N1'],
  'conditioned node identity must be retained exactly, not rewritten to the kernel grammar',
);

/*
 * Regression 5 — an approximation disclosure lost while merging limitations.
 *
 * Both spans bind the same section state, so the circular-annulus disclosure is
 * declared twice and must survive de-duplication exactly once — present, and
 * present only once. Two independently identified section states must still
 * yield one disclosure, not two copies and not none.
 *
 * The merge additionally refuses two authorities that declare one code with
 * different content (`MODEL_COMPILER_LIMITATION_CONFLICT`). No currently
 * qualified upstream compiler can produce that shape — B-2.3 seals its own
 * limitations and rejects a tampered record with `PIPE_SECTION_HASH_MISMATCH`
 * before this compiler sees it — so the guard is asserted by the source guard
 * rather than exercised here. It exists for the compilers section 4.2 defers.
 */
assert.deepEqual(
  baseline.model.limitations.map((limitation) => limitation.code),
  ['PIPE_SECTION_LIMITATION_CIRCULAR_ANNULUS_ONLY'],
);
const sectionLimitations = sectionResolution().limitations.map((limitation) => limitation.code);
assert.deepEqual(baseline.model.limitations.map((limitation) => limitation.code), sectionLimitations);

const twoSections = compilerInput();
twoSections.sectionResolutions = [sectionResolution(), sectionResolution('SEC-ALT')];
twoSections.elementBindings[1].sectionStateId = 'SEC-ALT';
const twoSectionResult = compileMechanicalModel(twoSections);
assert.equal(twoSectionResult.model.sectionStates.length, 2);
assert.deepEqual(
  twoSectionResult.model.limitations.map((limitation) => limitation.code),
  ['PIPE_SECTION_LIMITATION_CIRCULAR_ANNULUS_ONLY'],
  'one disclosure per code, never duplicated and never dropped',
);

/*
 * Regression 6 — an element silently reversed to agree with its axes.
 *
 * Reversing I/J changes the meaning of every end-indexed result, so it must be
 * an explicit topology change, never a repair the compiler performs to make a
 * mismatched axis result fit.
 */
const reversedSpan = compilerInput();
const span = reversedSpan.conditionedTopology.geometry.segments[0];
const start = span.startNodeId;
span.startNodeId = span.endNodeId;
span.endNodeId = start;
expectCode(() => compileMechanicalModel(reversedSpan), 'MODEL_COMPILER_AXIS_ELEMENT_MISMATCH');
assert.equal(baseline.model.elements[0].nodeI, 'N-000120');
assert.equal(baseline.model.elements[0].nodeJ, 'N-000121');

console.log('LFEA B-2.5 reviewer regression check PASS');
