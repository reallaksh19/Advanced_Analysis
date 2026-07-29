#!/usr/bin/env node

/**
 * LFEA B-2.5 mechanical-model compiler contract check.
 *
 * Covers `src/core/linear-fea-model-compiler/`: binding of conditioned
 * topology, B-2.2 material states, B-2.3 section states, B-2.4 local axes and
 * linear-constraint declarations into a sealed `fea-linear-model/v1` record,
 * the section 2.1 identity chain, the section 3.2 one-authority-per-span rule,
 * the section 5.3 conflicting-definition rule and the prohibition on any
 * undeclared numerical policy.
 */

import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/canonical-json.js';
import { validateLinearFeaModel } from '../src/core/linear-fea-contract/index.js';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import {
  COMPILATION_RECORD_KEYS,
  compileMechanicalModel,
  requireMechanicalModelCompilation,
  sealMechanicalModelCompilerProfile,
} from '../src/core/linear-fea-model-compiler/index.js';
import {
  axisResult,
  clone,
  compilerInput,
  compilerProfile,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';

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
    schema: 'fea-linear-model-compiler-profile/v1',
    profileId: 'LINEAR-MODEL-COMPILER-R1',
    spanBindingRule: 'EXACTLY_ONE_BINDING_PER_SPAN_V1',
    zeroLengthLinkRule: 'ZERO_LENGTH_LINK_PROHIBITED_V1',
    constraintConflictRule: 'CONFLICTING_DEFINITION_BLOCKS_COMPILATION_V1',
    unrepresentableFeatureRule: 'UNREPRESENTABLE_FEATURE_BLOCKS_COMPILATION_V1',
    minimumElementLength: { value: 1e-8, source: 'LFEA-B2.5-FIXTURE-PROFILE' },
    spanDirectionTolerance: { value: 1e-9, source: 'LFEA-B2.5-FIXTURE-PROFILE' },
    semanticHash: '',
  };
  delete draft[field];
  return draft;
}

console.log('\n--- LFEA B-2.5 mechanical-model compiler check ---');

const compiled = compileMechanicalModel(compilerInput());

test('B25-T01', 'Compilation produces a sealed fea-linear-model/v1 record', () => {
  assert.deepEqual(Object.keys(compiled).sort(), [...COMPILATION_RECORD_KEYS].sort());
  assert.equal(compiled.model.schema, 'fea-linear-model/v1');
  validateLinearFeaModel(clone(compiled.model));
  assert.equal(compiled.model.nodes.length, 3);
  assert.equal(compiled.model.elements.length, 2);
  assertDeepFrozen(compiled);
});

test('B25-T02', 'Identity chain runs source -> topology -> mechanical model -> stiffness', () => {
  assert.equal(compiled.sourceSemanticHash, compiled.model.ancestry.sourceSemanticHash);
  assert.equal(compiled.conditionedTopologyHash, compiled.model.ancestry.conditionedGeometrySemanticHash);
  assert.equal(compiled.compilerProfileSemanticHash, compiled.model.ancestry.compilerProfileSemanticHash);
  assert.equal(compiled.mechanicalModelSemanticHash, compiled.model.semanticHash);
  assert.equal(compiled.stiffnessStateHash, compiled.model.stiffnessStateHash);
  const broken = clone(compiled);
  broken.mechanicalModelSemanticHash = 'fnv1a64:0000000000000000';
  expectCode(() => requireMechanicalModelCompilation(broken), 'MODEL_COMPILER_IDENTITY_CHAIN_BROKEN');
});

test('B25-T03', 'Repeated compilation is byte-identical and input order is irrelevant', () => {
  const repeat = compileMechanicalModel(compilerInput());
  assert.equal(canonicalStringify(repeat), canonicalStringify(compiled));

  const shuffled = compilerInput();
  shuffled.conditionedTopology.geometry.nodes.reverse();
  shuffled.conditionedTopology.geometry.segments.reverse();
  shuffled.nodeBindings.reverse();
  shuffled.elementBindings.reverse();
  shuffled.localAxisResults.reverse();
  shuffled.constraintDeclarations.reverse();
  const reordered = compileMechanicalModel(shuffled);
  assert.equal(reordered.semanticHash, compiled.semanticHash);
  assert.equal(reordered.mechanicalModelSemanticHash, compiled.mechanicalModelSemanticHash);
  assert.equal(reordered.stiffnessStateHash, compiled.stiffnessStateHash);
  assert.equal(canonicalStringify(reordered), canonicalStringify(compiled));
});

test('B25-T04', 'Exactly one material state per element span', () => {
  const missing = compilerInput();
  missing.elementBindings[0].materialStateId = 'MAT-ABSENT';
  expectCode(() => compileMechanicalModel(missing), 'MODEL_COMPILER_MATERIAL_BINDING_MISSING');

  const ambiguous = compilerInput();
  ambiguous.materialResolutions = [materialResolution(), materialResolution()];
  expectCode(() => compileMechanicalModel(ambiguous), 'MODEL_COMPILER_MATERIAL_BINDING_AMBIGUOUS');
});

test('B25-T05', 'Exactly one section state per element span', () => {
  const missing = compilerInput();
  missing.elementBindings[1].sectionStateId = 'SEC-ABSENT';
  expectCode(() => compileMechanicalModel(missing), 'MODEL_COMPILER_SECTION_BINDING_MISSING');

  const ambiguous = compilerInput();
  ambiguous.sectionResolutions = [sectionResolution(), sectionResolution()];
  expectCode(() => compileMechanicalModel(ambiguous), 'MODEL_COMPILER_SECTION_BINDING_AMBIGUOUS');
});

test('B25-T06', 'Exactly one qualified local-axis result per element span', () => {
  const missing = compilerInput();
  missing.elementBindings[0].localAxisEvidenceIdentity = 'AXIS-ABSENT';
  expectCode(() => compileMechanicalModel(missing), 'MODEL_COMPILER_AXIS_BINDING_MISSING');

  const ambiguous = compilerInput();
  ambiguous.localAxisResults.push(ambiguous.localAxisResults[0]);
  expectCode(() => compileMechanicalModel(ambiguous), 'MODEL_COMPILER_AXIS_BINDING_AMBIGUOUS');

  const foreign = compilerInput();
  foreign.localAxisResults[0].result = {
    ...clone(foreign.localAxisResults[0].result),
    profileSemanticHash: 'fnv1a64:0000000000000000',
  };
  expectCode(() => compileMechanicalModel(foreign), 'MODEL_COMPILER_AXIS_PROFILE_MISMATCH');
});

test('B25-T07', 'Exactly one element binding per conditioned span', () => {
  const missing = compilerInput();
  missing.elementBindings.pop();
  expectCode(() => compileMechanicalModel(missing), 'MODEL_COMPILER_SPAN_BINDING_MISSING');

  const duplicated = compilerInput();
  const second = clone(duplicated.elementBindings[0]);
  second.elementId = 'E-000199';
  duplicated.elementBindings.push(second);
  expectCode(() => compileMechanicalModel(duplicated), 'MODEL_COMPILER_SPAN_BINDING_AMBIGUOUS');

  const unknown = compilerInput();
  unknown.elementBindings[0].topologySegmentId = 'S9/Z';
  expectCode(() => compileMechanicalModel(unknown), 'MODEL_COMPILER_SPAN_BINDING_UNKNOWN');
});

test('B25-T08', 'Every conditioned node is bound exactly once', () => {
  const missing = compilerInput();
  missing.nodeBindings.pop();
  expectCode(() => compileMechanicalModel(missing), 'MODEL_COMPILER_NODE_BINDING_MISSING');

  const ambiguous = compilerInput();
  ambiguous.nodeBindings.push({
    nodeId: 'N-000199',
    conditionedNodeId: 'CN-000199',
    topologyNodeId: 'S1/N1',
  });
  expectCode(() => compileMechanicalModel(ambiguous), 'MODEL_COMPILER_NODE_BINDING_AMBIGUOUS');

  const unknown = compilerInput();
  unknown.nodeBindings[0].topologyNodeId = 'S9/N9';
  expectCode(() => compileMechanicalModel(unknown), 'MODEL_COMPILER_NODE_BINDING_UNKNOWN');
});

test('B25-T09', 'Zero-length analytical links and sub-minimum spans are refused', () => {
  const looped = compilerInput();
  looped.conditionedTopology.geometry.segments[0].endNodeId = 'S1/N1';
  expectCode(() => compileMechanicalModel(looped), 'MODEL_COMPILER_ZERO_LENGTH_LINK_PROHIBITED');

  const collapsed = compilerInput();
  collapsed.conditionedTopology.geometry.nodes[1].x = 0;
  expectCode(() => compileMechanicalModel(collapsed), 'MODEL_COMPILER_ELEMENT_BELOW_MINIMUM_LENGTH');
});

test('B25-T10', 'A local-axis result from another span is refused, never reoriented', () => {
  const mismatched = compilerInput();
  mismatched.localAxisResults[0].result = axisResult([0, 0, 0], [0, 1.2, 0]);
  expectCode(() => compileMechanicalModel(mismatched), 'MODEL_COMPILER_AXIS_ELEMENT_MISMATCH');

  const reversed = compilerInput();
  reversed.localAxisResults[0].result = axisResult([1.2, 0, 0], [0, 0, 0]);
  expectCode(() => compileMechanicalModel(reversed), 'MODEL_COMPILER_AXIS_ELEMENT_MISMATCH');
});

test('B25-T11', 'Conflicting release, restraint and rigid definitions block compilation', () => {
  const conflict = compilerInput();
  conflict.constraintDeclarations.push({
    declarationId: 'C-N120-UX-SPRING',
    kind: 'PARTIAL_RELEASE_SPRING',
    nodeId: 'N-000120',
    dof: 'UX',
    stiffness: 1e7,
  });
  expectCode(() => compileMechanicalModel(conflict), 'MODEL_COMPILER_CONSTRAINT_CONFLICT');

  const releaseConflict = compilerInput();
  releaseConflict.constraintDeclarations.push({
    declarationId: 'C-E120-I-RX',
    kind: 'END_RELEASE',
    elementId: 'E-000120',
    end: 'I',
    dof: 'UX',
  });
  expectCode(() => compileMechanicalModel(releaseConflict), 'MODEL_COMPILER_CONSTRAINT_CONFLICT');
});

test('B25-T12', 'Features this contract version cannot carry block compilation', () => {
  const release = compilerInput();
  release.constraintDeclarations.push({
    declarationId: 'C-E120-J-RY',
    kind: 'END_RELEASE',
    elementId: 'E-000120',
    end: 'J',
    dof: 'RY',
  });
  expectCode(() => compileMechanicalModel(release), 'MODEL_COMPILER_END_RELEASE_NOT_REPRESENTABLE');

  for (const kind of ['RIGID_LINK', 'RIGID_OFFSET']) {
    const rigid = compilerInput();
    rigid.constraintDeclarations.push({
      declarationId: `C-N121-RZ-${kind}`,
      kind,
      nodeId: 'N-000121',
      dof: 'RZ',
      attachedElementId: 'E-000121',
    });
    expectCode(() => compileMechanicalModel(rigid), 'MODEL_COMPILER_RIGID_LINK_NOT_REPRESENTABLE');
  }
});

test('B25-T13', 'No numerical policy is defaulted', () => {
  expectCode(
    () => sealMechanicalModelCompilerProfile(profileWithout('minimumElementLength')),
    'MODEL_COMPILER_PROFILE_INVALID',
  );
  const nulled = profileWithout('x');
  nulled.minimumElementLength = null;
  expectCode(() => sealMechanicalModelCompilerProfile(nulled), 'MINIMUM_ELEMENT_LENGTH_NOT_DECLARED');
  const nulledTolerance = profileWithout('x');
  nulledTolerance.spanDirectionTolerance = null;
  expectCode(() => sealMechanicalModelCompilerProfile(nulledTolerance), 'SPAN_DIRECTION_TOLERANCE_NOT_DECLARED');
  const bare = profileWithout('x');
  bare.spanDirectionTolerance = 1e-9;
  expectCode(() => sealMechanicalModelCompilerProfile(bare), 'NOT_A_RECORD');
  const sourceless = profileWithout('x');
  sourceless.spanDirectionTolerance = { value: 1e-9 };
  expectCode(() => sealMechanicalModelCompilerProfile(sourceless), 'MISSING_FIELD');
});

test('B25-T14', 'A profile value sourced from a hidden default is refused', () => {
  for (const token of ['DEFAULT', 'default', 'FALLBACK', 'HARDCODED', 'UNKNOWN']) {
    const hidden = profileWithout('x');
    hidden.minimumElementLength = { value: 1e-8, source: token };
    expectCode(
      () => sealMechanicalModelCompilerProfile(hidden),
      'MODEL_COMPILER_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  }
});

test('B25-T15', 'Conditioned geometry is never rescaled', () => {
  const millimetres = compilerInput();
  millimetres.conditionedTopology.geometry.unit = 'mm';
  expectCode(() => compileMechanicalModel(millimetres), 'MODEL_COMPILER_UNIT_NOT_CANONICAL');
});

test('B25-T16', 'Upstream approximation disclosures propagate into the model', () => {
  assert.deepEqual(
    compiled.model.limitations.map((limitation) => limitation.code),
    ['PIPE_SECTION_LIMITATION_CIRCULAR_ANNULUS_ONLY'],
  );
  assert.deepEqual(
    compiled.limitations.map((limitation) => limitation.code),
    compiled.model.limitations.map((limitation) => limitation.code),
  );
  const fallback = compilerInput();
  fallback.localAxisResults[0].result = axisResult([0, 0, 0], [1.2, 0, 0], [1, 0, 0]);
  const disclosed = compileMechanicalModel(fallback);
  assert.deepEqual(
    disclosed.model.limitations.map((limitation) => limitation.code),
    [
      'MODEL_COMPILER_LIMITATION_LOCAL_AXIS_FALLBACK_REFERENCE',
      'PIPE_SECTION_LIMITATION_CIRCULAR_ANNULUS_ONLY',
    ],
  );
});

test('B25-T17', 'Every element carries a retained binding trace and diagnostic', () => {
  assert.deepEqual(compiled.bindings.map((binding) => binding.elementId), ['E-000120', 'E-000121']);
  for (const binding of compiled.bindings) {
    assert.match(binding.materialResolutionSemanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
    assert.match(binding.sectionResolutionSemanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
    assert.match(binding.localAxisResultSemanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
    assert.equal(binding.localAxisReferenceSource, 'INPUT');
  }
  const codes = compiled.model.diagnostics.map((diagnostic) => diagnostic.code);
  assert.deepEqual(codes, ['MODEL_ELEMENT_BINDING_RESOLVED', 'MODEL_ELEMENT_BINDING_RESOLVED']);
});

test('B25-T18', 'Stale compilation hashes are refused', () => {
  for (const field of ['semanticHash', 'evidenceHash']) {
    const stale = clone(compiled);
    stale[field] = 'fnv1a64:0000000000000000';
    expectCode(() => requireMechanicalModelCompilation(stale), 'MODEL_COMPILER_HASH_MISMATCH');
  }
  const stalePolicy = compilerProfile();
  const tampered = { ...clone(stalePolicy), spanDirectionTolerance: { value: 1e-6, source: 'LFEA-B2.5-FIXTURE-PROFILE' } };
  expectCode(
    () => compileMechanicalModel(compilerInput({ profile: tampered })),
    'MODEL_COMPILER_HASH_MISMATCH',
  );
});

test('B25-T19', 'Changing the compiler profile changes the mechanical-model identity', () => {
  const alternate = compilerProfile({
    spanDirectionTolerance: { value: 1e-8, source: 'LFEA-B2.5-ALTERNATE-PROFILE' },
  });
  const other = compileMechanicalModel(compilerInput({ profile: alternate }));
  assert.notEqual(other.compilerProfileSemanticHash, compiled.compilerProfileSemanticHash);
  assert.notEqual(other.mechanicalModelSemanticHash, compiled.mechanicalModelSemanticHash);
  assert.equal(other.stiffnessStateHash, compiled.stiffnessStateHash);
});

test('B25-T20', 'The compiler holds no implicit state between runs', () => {
  const first = compileMechanicalModel(compilerInput());
  const isolated = compilerInput();
  isolated.modelIdentity = 'SYS-04-MECH-01';
  compileMechanicalModel(isolated);
  const third = compileMechanicalModel(compilerInput());
  assert.equal(canonicalStringify(third), canonicalStringify(first));
  assert.equal(FRAME_LOCAL_AXIS_PROFILE.profileId, 'PIPE-FRAME-AXIS-R1');
});

console.log('\nLFEA B-2.5 mechanical-model compiler check PASS\n');
