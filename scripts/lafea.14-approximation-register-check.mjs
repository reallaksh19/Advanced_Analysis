#!/usr/bin/env node

/**
 * LAFEA upgrade spec §14 approximation-register check.
 *
 * Covers `src/core/lafea-profile-contract/approximation-register.js`: every
 * named approximation carries its mandatory spec disclosure text, a register
 * is rejected if any approximation is missing or duplicated, and an
 * `UNRESOLVED` status blocks acceptance (§14.1).
 */

import assert from 'node:assert/strict';
import {
  APPROXIMATION_DISCLOSURES,
  APPROXIMATION_IDS,
  canonicalApproximationRegister,
  requireAcceptableApproximationRegister,
} from '../src/core/lafea-profile-contract/index.js';

console.log('\n--- LAFEA §14 approximation register check ---');
checkAllNineApproximationsCarryDisclosure();
checkMissingApproximationRejected();
checkDuplicateApproximationRejected();
checkUnresolvedBlocksAcceptance();
checkAcceptedStillRequiresRationale();
console.log('\n✅ LAFEA §14 approximation register check passed.\n');

function fullAcceptedRegisterEntries() {
  return Object.values(APPROXIMATION_IDS).map((approximationId) => ({
    approximationId,
    status: 'ACCEPTED',
    statusRationale: `Applicable to this model; see engineering assumption note for ${approximationId}.`,
  }));
}

function checkAllNineApproximationsCarryDisclosure() {
  const ids = Object.values(APPROXIMATION_IDS);
  assert.equal(ids.length, 9, 'Spec §14 names nine approximations.');
  const register = canonicalApproximationRegister(fullAcceptedRegisterEntries());
  assert.equal(register.entries.length, 9);
  for (const entry of register.entries) {
    assert.equal(entry.disclosure, APPROXIMATION_DISCLOSURES[entry.approximationId]);
    assert.ok(entry.disclosure.length > 0);
  }
  assert.equal(register.blocksAcceptance, false);
  console.log('✅ All nine named approximations carry their mandatory spec disclosure text.');
}

function checkMissingApproximationRejected() {
  const incomplete = fullAcceptedRegisterEntries().slice(1);
  assertRejects(() => canonicalApproximationRegister(incomplete), 'MISSING_APPROXIMATION');
  console.log('✅ A register missing any named approximation is rejected.');
}

function checkDuplicateApproximationRejected() {
  const duplicated = [...fullAcceptedRegisterEntries(), {
    approximationId: APPROXIMATION_IDS.SYMMETRY,
    status: 'ACCEPTED',
    statusRationale: 'Duplicate entry.',
  }];
  assertRejects(() => canonicalApproximationRegister(duplicated), 'DUPLICATE_APPROXIMATION');
  console.log('✅ A register with a duplicated approximation entry is rejected.');
}

function checkUnresolvedBlocksAcceptance() {
  const entries = fullAcceptedRegisterEntries();
  entries[0] = { ...entries[0], status: 'UNRESOLVED', statusRationale: 'Not yet reviewed.' };
  const register = canonicalApproximationRegister(entries);
  assert.equal(register.blocksAcceptance, true);
  assertRejects(() => requireAcceptableApproximationRegister(register), 'UNRESOLVED_APPROXIMATION');

  const resolved = canonicalApproximationRegister(fullAcceptedRegisterEntries());
  assert.equal(requireAcceptableApproximationRegister(resolved), resolved);
  console.log('✅ An UNRESOLVED approximation blocks acceptance; a fully resolved register is accepted.');
}

function checkAcceptedStillRequiresRationale() {
  const entries = fullAcceptedRegisterEntries();
  entries[0] = { ...entries[0], statusRationale: '' };
  assertRejects(() => canonicalApproximationRegister(entries), 'MISSING_DECLARATION');
  console.log('✅ Even an ACCEPTED approximation requires a non-empty rationale (no hidden acceptance).');
}

function assertRejects(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error.code, code, `Expected code ${code}, got ${error.code}`);
    return true;
  });
}
