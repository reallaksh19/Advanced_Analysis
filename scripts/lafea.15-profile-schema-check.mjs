#!/usr/bin/env node

/**
 * LAFEA upgrade spec §15 profile-schema check.
 *
 * Covers `src/core/lafea-profile-contract/`: exact-key rejection for each of
 * the seven profile kinds, hash reconstruction/repeatability, and the "a
 * profile change invalidates only its downstream artifacts" rule from §15.1,
 * exercised through the hash-lineage classifier in the same package.
 */

import assert from 'node:assert/strict';
import {
  CHANGE_KINDS,
  HASH_LINEAGE_ORDER,
  LafeaProfileContractError,
  PROFILE_KINDS,
  applyLineageChange,
  canonicalHashLineage,
  canonicalProfile,
  createDefaultProfile,
  createDefaultProfileSet,
  defaultProfileFields,
  reconstructProfileSemanticHash,
} from '../src/core/lafea-profile-contract/index.js';

console.log('\n--- LAFEA §15 profile schema check ---');
checkAllSevenKindsValidate();
checkExactKeyRejection();
checkHashReconstructionAndRepeatability();
checkThresholdOrderingGuards();
checkGaussPointRetentionCannotBeDisabled();
checkProfileChangeInvalidatesOnlyDownstream();
console.log('\n✅ LAFEA §15 profile schema check passed.\n');

function checkAllSevenKindsValidate() {
  const set = createDefaultProfileSet('TEST-DOC-1');
  assert.equal(Object.keys(set).length, 7);
  for (const kind of Object.values(PROFILE_KINDS)) {
    assert.ok(set[kind], `Missing default profile for ${kind}`);
    assert.equal(set[kind].fields !== undefined, true);
    assert.ok(Object.isFrozen(set[kind]));
    assert.ok(Object.isFrozen(set[kind].fields));
  }
  console.log('✅ All seven profile kinds build a canonical default profile.');
}

function checkExactKeyRejection() {
  const base = createDefaultProfile(PROFILE_KINDS.MESH, 'TEST-MESH-1');
  const withExtraEnvelopeKey = { ...base, extra: true };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, withExtraEnvelopeKey), 'UNEXPECTED_FIELD');

  const withExtraFieldKey = { ...base, fields: { ...base.fields, extra: 1 } };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, withExtraFieldKey), 'UNEXPECTED_FIELD');

  const { globalTargetSize: _dropped, ...missingField } = base.fields;
  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, { ...base, fields: missingField }), 'MISSING_FIELD');

  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, { ...base, schema: 'wrong/v1' }), 'UNSUPPORTED_SCHEMA');
  console.log('✅ Exact-key rejection holds for envelope and field-level unknown/missing keys.');
}

function checkHashReconstructionAndRepeatability() {
  const first = createDefaultProfile(PROFILE_KINDS.SOLVER, 'TEST-SOLVER-1');
  const second = createDefaultProfile(PROFILE_KINDS.SOLVER, 'TEST-SOLVER-1');
  assert.equal(first.semanticHash, second.semanticHash, 'Identical content must hash identically.');
  assert.equal(reconstructProfileSemanticHash(first), first.semanticHash);

  const tampered = { ...first, semanticHash: 'fnv1a64:0000000000000000' };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.SOLVER, tampered), 'HASH_MISMATCH');

  const differentIdentity = createDefaultProfile(PROFILE_KINDS.SOLVER, 'TEST-SOLVER-2');
  assert.notEqual(first.semanticHash, differentIdentity.semanticHash, 'A different declared identity changes the hash.');
  console.log('✅ Profile hashes are reconstructable, repeatable and tamper-evident.');
}

function checkThresholdOrderingGuards() {
  const mesh = createDefaultProfile(PROFILE_KINDS.MESH, 'TEST-MESH-2');
  const invertedAspect = { ...mesh, fields: { ...mesh.fields, aspectRatioBlock: mesh.fields.aspectRatioWarn } };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, invertedAspect), 'INVALID_THRESHOLD_ORDER');

  const invertedJacobian = { ...mesh, fields: { ...mesh.fields, scaledJacobianWarn: mesh.fields.scaledJacobianBlock } };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, invertedJacobian), 'INVALID_THRESHOLD_ORDER');

  const shallowLevels = { ...mesh, fields: { ...mesh.fields, adaptiveLevels: 2 } };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.MESH, shallowLevels), 'INVALID_INTEGER_BOUND');
  console.log('✅ Mesh threshold self-consistency (warn<block, Jacobian warn>block, levels>=3) is enforced.');
}

function checkGaussPointRetentionCannotBeDisabled() {
  const recovery = createDefaultProfile(PROFILE_KINDS.RECOVERY, 'TEST-RECOVERY-1');
  const disabled = { ...recovery, fields: { ...recovery.fields, gaussPointRetention: false } };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.RECOVERY, disabled), 'GAUSS_POINT_RETENTION_REQUIRED');

  const output = createDefaultProfile(PROFILE_KINDS.OUTPUT, 'TEST-OUTPUT-1');
  const outputDisabled = { ...output, fields: { ...output.fields, retainIntegrationPointResults: false } };
  assertRejects(() => canonicalProfile(PROFILE_KINDS.OUTPUT, outputDisabled), 'GAUSS_POINT_RETENTION_REQUIRED');
  console.log('✅ Gauss-point retention cannot be switched off by a profile (spec §7.1/§12.1).');
}

function checkProfileChangeInvalidatesOnlyDownstream() {
  const baseline = canonicalHashLineage({
    sourceSemanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
    compiledModelSemanticHash: 'fnv1a64:bbbbbbbbbbbbbbbb',
    meshSemanticHash: 'fnv1a64:cccccccccccccccc',
    loadCaseSemanticHash: 'fnv1a64:dddddddddddddddd',
    executionSemanticHash: 'fnv1a64:eeeeeeeeeeeeeeee',
    recoverySemanticHash: 'fnv1a64:ffffffffffffffff',
    codeAssessmentSemanticHash: 'fnv1a64:1111111111111111',
    evidenceHash: 'fnv1a64:2222222222222222',
  });

  // A meshProfile edit (mesh density) must move meshSemanticHash and
  // everything downstream, but must never touch sourceSemanticHash or
  // compiledModelSemanticHash.
  const afterMeshChange = applyLineageChange(baseline, CHANGE_KINDS.MESH_DENSITY_EDIT, {
    meshSemanticHash: 'fnv1a64:3333333333333333',
    loadCaseSemanticHash: 'fnv1a64:4444444444444444',
    executionSemanticHash: 'fnv1a64:5555555555555555',
    recoverySemanticHash: 'fnv1a64:6666666666666666',
    codeAssessmentSemanticHash: 'fnv1a64:7777777777777777',
    evidenceHash: 'fnv1a64:8888888888888888',
  });
  assert.equal(afterMeshChange.sourceSemanticHash, baseline.sourceSemanticHash);
  assert.equal(afterMeshChange.compiledModelSemanticHash, baseline.compiledModelSemanticHash);
  assert.notEqual(afterMeshChange.meshSemanticHash, baseline.meshSemanticHash);

  // A solverProfile edit must not touch meshSemanticHash upstream of it.
  assertRejects(
    () => applyLineageChange(afterMeshChange, CHANGE_KINDS.SOLVER_BACKEND_EDIT, {
      meshSemanticHash: 'fnv1a64:9999999999999999',
      executionSemanticHash: 'fnv1a64:aaaa111111111111',
      recoverySemanticHash: 'fnv1a64:bbbb111111111111',
      codeAssessmentSemanticHash: 'fnv1a64:cccc111111111111',
      evidenceHash: 'fnv1a64:dddd111111111111',
    }),
    'UNEXPECTED_FIELD',
  );

  // A pure display change (contour palette) must leave every engineering
  // hash bit-identical.
  const afterDisplayChange = applyLineageChange(afterMeshChange, CHANGE_KINDS.DISPLAY_CONTOUR_PALETTE, {});
  assert.deepEqual({ ...afterDisplayChange }, { ...afterMeshChange });

  // A change kind must actually move every link it claims to own.
  assertRejects(
    () => applyLineageChange(afterMeshChange, CHANGE_KINDS.CODE_PROFILE_EDIT, {
      codeAssessmentSemanticHash: afterMeshChange.codeAssessmentSemanticHash,
      evidenceHash: 'fnv1a64:eeee111111111111',
    }),
    'HASH_NOT_UPDATED',
  );

  assert.deepEqual([...HASH_LINEAGE_ORDER], [
    'sourceSemanticHash', 'compiledModelSemanticHash', 'meshSemanticHash', 'loadCaseSemanticHash',
    'executionSemanticHash', 'recoverySemanticHash', 'codeAssessmentSemanticHash', 'evidenceHash',
  ]);
  console.log('✅ A profile/engineering change invalidates only its declared downstream lineage links.');
}

function assertRejects(action, code) {
  assert.throws(action, (error) => {
    assert.ok(
      error instanceof LafeaProfileContractError || typeof error.code === 'string',
      `Expected a coded rejection, got ${error.name}`,
    );
    assert.equal(error.code, code, `Expected code ${code}, got ${error.code}`);
    return true;
  });
}
