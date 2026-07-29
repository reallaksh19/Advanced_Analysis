#!/usr/bin/env node

/**
 * Shared LFEA -> LAFEA attachment load contract check.
 *
 * Section 8 of both improvement plans mandates this script by name. It is owned
 * by neither plan and is modified only in a pull request that touches both.
 *
 * It pins the four rules of the contract:
 *   1. the basis is written out and used as supplied, never implied;
 *   2. `sourceSemanticHash` is mandatory;
 *   3. limitations propagate;
 *   4. both kernels run this same test.
 */

import assert from 'node:assert/strict';
import {
  LOAD_CASE_TYPES,
  SCHEMA_ID,
  SIGN_CONVENTIONS,
  attachmentLoadInModelFrame,
  canonicalAttachmentLoadSet,
  compareResultants,
  requireUnits,
  resultantAboutPoint,
  reverseSignConvention,
} from '../src/core/attachment-load-contract/index.js';
import { SharedAnalysisContractError } from '../src/core/shared-analysis-contract/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

/** Exact tolerance. These are algebraic identities, not engineering estimates. */
const EXACT = 1e-12;
const BASIS_TOLERANCE = 1e-12;

console.log('\n--- Shared attachment load contract check (LFEA -> LAFEA) ---');
checkAcceptance();
checkMandatoryDeclarations();
checkBasisIsUsedAsSupplied();
checkResultantEquivalence();
checkMomentTransfer();
checkSignConventionIsExplicit();
checkUnitsAreDeclared();
checkLimitationsPropagate();
checkDeterminism();
console.log('\n✅ Shared attachment load contract check passed.\n');

/**
 * A load set on a run-pipe surface, in an attachment basis that is deliberately
 * NOT the global frame: e3 is the outward radial normal at theta = 90 degrees,
 * so a mistake that silently reconstructs a global basis shows up immediately.
 */
function loadSetFixture(overrides = {}) {
  return {
    schema: SCHEMA_ID,
    attachmentId: 'TRUNNION-01',
    loadCaseId: 'LC-THERMAL-1',
    loadCaseType: 'THERMAL_EXPANSION',
    basis: {
      origin: { x: 0, y: 150, z: 2000 },
      e1: { x: -1, y: 0, z: 0 },  // circumferential tangent
      e2: { x: 0, y: 0, z: 1 },   // axial tangent
      e3: { x: 0, y: 1, z: 0 },   // outward radial normal
    },
    force: { fx: 1200, fy: -800, fz: 450 },
    moment: { mx: 90000, my: 15000, mz: -32000 },
    units: { force: 'N', moment: 'N*mm', length: 'mm' },
    signConvention: 'FORCE_ON_ATTACHMENT_FROM_PIPE',
    sourceKernel: 'centerline-beam-fea',
    sourceSemanticHash: 'fnv1a64:0123456789abcdef',
    limitations: ['IN_PLANE_BENDING_ONLY', 'RESTING_SUPPORT_MODELLED_AS_BILATERAL'],
    ...overrides,
  };
}

function checkAcceptance() {
  const loadSet = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  assert.equal(loadSet.schema, SCHEMA_ID);
  assert.equal(loadSet.basisQualification.accepted, true);
  assert.equal(loadSet.basisQualification.tolerance, BASIS_TOLERANCE);
  assert.equal(Object.isFrozen(loadSet), true);
  assert.ok(LOAD_CASE_TYPES.includes(loadSet.loadCaseType));
  assert.ok(SIGN_CONVENTIONS.includes(loadSet.signConvention));
  console.log('✅ A complete load set is accepted and frozen, with its basis qualification recorded.');
}

function checkMandatoryDeclarations() {
  // LAFEA S-3 test 1: basis, signConvention and sourceSemanticHash are the
  // three declarations a consumer cannot reconstruct. Each absence rejects.
  for (const field of ['basis', 'signConvention', 'sourceSemanticHash']) {
    const source = loadSetFixture();
    delete source[field];
    assertRejects(() => canonicalAttachmentLoadSet(source, BASIS_TOLERANCE), 'MISSING_FIELD', field);
  }
  assertRejects(
    () => canonicalAttachmentLoadSet(loadSetFixture({ sourceSemanticHash: '' }), BASIS_TOLERANCE),
    'MISSING_DECLARATION',
    'empty sourceSemanticHash',
  );
  assertRejects(
    () => canonicalAttachmentLoadSet(loadSetFixture({ loadCaseType: 'OCCASIONAL' }), BASIS_TOLERANCE),
    'UNSUPPORTED_VALUE',
    'OCCASIONAL load case',
  );
  assertRejects(
    () => canonicalAttachmentLoadSet(loadSetFixture({ signConvention: 'whatever the producer meant' }), BASIS_TOLERANCE),
    'UNSUPPORTED_VALUE',
    'free-text sign convention',
  );
  assertRejects(
    () => canonicalAttachmentLoadSet({ ...loadSetFixture(), extra: 1 }, BASIS_TOLERANCE),
    'UNEXPECTED_FIELD',
    'undeclared extra field',
  );
  console.log('✅ Missing basis, signConvention or sourceSemanticHash is rejected by name.');
}

function checkBasisIsUsedAsSupplied() {
  // Rule 1. Transform through the supplied vectors: with this basis the
  // components map as (fx, fy, fz) -> (-fx, fz, fy) in the model frame.
  const loadSet = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  const model = attachmentLoadInModelFrame(loadSet);
  assert.equal(model.force.x, -1200);
  assert.equal(model.force.y, 450);
  assert.equal(model.force.z, -800);
  assert.equal(model.moment.x, -90000);
  assert.equal(model.moment.y, -32000);
  assert.equal(model.moment.z, 15000);
  assert.deepEqual({ ...model.applicationPoint }, { x: 0, y: 150, z: 2000 });

  // A basis that is not orthonormal and right-handed is rejected, not repaired.
  const nonUnit = loadSetFixture();
  nonUnit.basis.e1 = { x: -2, y: 0, z: 0 };
  assertRejects(
    () => canonicalAttachmentLoadSet(nonUnit, BASIS_TOLERANCE),
    'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED',
    'non-unit basis vector',
  );
  const leftHanded = loadSetFixture();
  leftHanded.basis.e3 = { x: 0, y: -1, z: 0 };
  assertRejects(
    () => canonicalAttachmentLoadSet(leftHanded, BASIS_TOLERANCE),
    'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED',
    'left-handed basis',
  );
  console.log('✅ The supplied basis is used verbatim; a bad triad is rejected, never normalised.');
}

function checkResultantEquivalence() {
  // The transform is a rotation: magnitudes are preserved exactly.
  const loadSet = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  const model = attachmentLoadInModelFrame(loadSet);
  const forceMagnitude = Math.hypot(loadSet.force.fx, loadSet.force.fy, loadSet.force.fz);
  const modelMagnitude = Math.hypot(model.force.x, model.force.y, model.force.z);
  assert.ok(Math.abs(modelMagnitude - forceMagnitude) / forceMagnitude <= EXACT);

  // compareResultants is the single statical-equivalence comparison both plans
  // use (LAFEA S-3 test 2, LFEA B-8 test 1). It must be exact on an identity...
  const identical = compareResultants(model, model);
  assert.equal(identical.force.absolute, 0);
  assert.equal(identical.moment.absolute, 0);
  // ...and must catch a discrepancy well below any engineering tolerance.
  const perturbed = { ...model, force: { ...model.force, x: model.force.x + 1e-6 } };
  assert.ok(compareResultants(model, perturbed).force.relative > 0);
  console.log('✅ Resultant equivalence is exact and detects a sub-microscopic discrepancy.');
}

function checkMomentTransfer() {
  // M_about_p = M_about_origin + (origin - p) x F, verified against a hand
  // computation with a unit force and a unit lever arm.
  const unit = canonicalAttachmentLoadSet(loadSetFixture({
    basis: {
      origin: { x: 0, y: 1, z: 0 },
      e1: { x: 1, y: 0, z: 0 },
      e2: { x: 0, y: 1, z: 0 },
      e3: { x: 0, y: 0, z: 1 },
    },
    force: { fx: 0, fy: 0, fz: 1 },
    moment: { mx: 0, my: 0, mz: 0 },
  }), BASIS_TOLERANCE);
  const model = attachmentLoadInModelFrame(unit);
  const about = resultantAboutPoint(model, { x: 0, y: 0, z: 0 });
  // lever = (0,1,0), F = (0,0,1); lever x F = (1,0,0).
  assert.deepEqual({ ...about.moment }, { x: 1, y: 0, z: 0 });
  // About its own origin the transfer term vanishes.
  const aboutOrigin = resultantAboutPoint(model, model.applicationPoint);
  assert.deepEqual({ ...aboutOrigin.moment }, { ...model.moment });
  console.log('✅ Moment transfer to another reference point matches the hand computation.');
}

function checkSignConventionIsExplicit() {
  const loadSet = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  const reversed = reverseSignConvention(loadSet);
  assert.equal(reversed.signConvention, 'FORCE_ON_PIPE_FROM_ATTACHMENT');
  assert.equal(reversed.force.fx, -loadSet.force.fx);
  assert.equal(reversed.moment.mz, -loadSet.moment.mz);
  // Reversing twice is the identity, and says so.
  const restored = reverseSignConvention(reversed);
  assert.equal(restored.signConvention, loadSet.signConvention);
  assert.deepEqual({ ...restored.force }, { ...loadSet.force });
  console.log('✅ A sense flip is deliberate and restamps the convention.');
}

function checkUnitsAreDeclared() {
  const loadSet = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  assert.equal(requireUnits(loadSet, { force: 'N', moment: 'N*mm', length: 'mm' }), loadSet);
  assertRejects(
    () => requireUnits(loadSet, { force: 'lbf', moment: 'lbf*in', length: 'in' }),
    'ATTACHMENT_LOAD_UNIT_MISMATCH',
    'consumer working in other units',
  );
  console.log('✅ A unit mismatch is refused rather than silently converted.');
}

function checkLimitationsPropagate() {
  // Rule 3. A LAFEA result inherits the limitations of the LFEA run that fed it.
  const loadSet = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  assert.deepEqual([...loadSet.limitations], [
    'IN_PLANE_BENDING_ONLY',
    'RESTING_SUPPORT_MODELLED_AS_BILATERAL',
  ]);
  assertRejects(
    () => canonicalAttachmentLoadSet(loadSetFixture({ limitations: 'IN_PLANE_BENDING_ONLY' }), BASIS_TOLERANCE),
    'NOT_AN_ARRAY',
    'limitations as a bare string',
  );
  console.log('✅ Producing-run limitations survive ingestion intact.');
}

function checkDeterminism() {
  // Rule 2 in practice: the record identifies its producing run, and two
  // ingestions of the same record hash identically.
  const first = canonicalAttachmentLoadSet(loadSetFixture(), BASIS_TOLERANCE);
  const second = canonicalAttachmentLoadSet(reorderKeys(loadSetFixture()), BASIS_TOLERANCE);
  assert.equal(semanticHash(first), semanticHash(second));
  const differentRun = canonicalAttachmentLoadSet(
    loadSetFixture({ sourceSemanticHash: 'fnv1a64:fedcba9876543210' }),
    BASIS_TOLERANCE,
  );
  assert.notEqual(semanticHash(first), semanticHash(differentRun));
  console.log('✅ Ingestion is key-order independent and tracks the producing run.');
}

function reorderKeys(record) {
  return Object.fromEntries(Object.entries(record).reverse());
}

function assertRejects(action, code, label) {
  assert.throws(action, (error) => {
    assert.ok(
      error instanceof SharedAnalysisContractError,
      `${label}: expected a SharedAnalysisContractError, got ${error.name}`,
    );
    assert.equal(error.code, code, `${label}: expected code ${code}, got ${error.code}`);
    return true;
  }, `${label} was not rejected`);
}
