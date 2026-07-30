import assert from 'node:assert/strict';
import {
  applyOrientationFlips, diagnoseOrientation, ORIENTATION_STATES,
  requireConsistentOrientation,
} from '../src/core/local-shell/orientation-diagnostics.js';

/**
 * LAFEA.4 / spec §8: shell normal orientation is DIAGNOSED, never silently
 * resolved. Orientation decides which surface is "top", the sign of every
 * bending/surface stress and the direction of pressure, so an automatic flip
 * would silently reinterpret the model.
 */

// A consistently wound 2x2 patch of quads. Neighbours traverse their shared
// edge in opposite directions, which is what consistency means.
const consistent = [
  { elementId: 'E1', nodeIds: ['N0', 'N1', 'N4', 'N3'] },
  { elementId: 'E2', nodeIds: ['N1', 'N2', 'N5', 'N4'] },
  { elementId: 'E3', nodeIds: ['N3', 'N4', 'N7', 'N6'] },
  { elementId: 'E4', nodeIds: ['N4', 'N5', 'N8', 'N7'] },
];

{
  const evidence = diagnoseOrientation(consistent);
  assert.equal(evidence.state, ORIENTATION_STATES.CONSISTENT);
  assert.equal(evidence.consistent, true);
  assert.equal(evidence.patchCount, 1);
  assert.deepEqual([...evidence.elementsRequiringFlip], []);
  assert.equal(requireConsistentOrientation(evidence), evidence);
  console.log('✅ A consistently wound patch is accepted, with a single connected patch reported.');
}

// --- One element wound backwards must be FLAGGED and must BLOCK. ---
const inconsistent = consistent.map((element) => (
  element.elementId === 'E3'
    ? { elementId: 'E3', nodeIds: ['N3', 'N6', 'N7', 'N4'] } // reversed winding
    : element
));

{
  const evidence = diagnoseOrientation(inconsistent);
  assert.equal(evidence.state, ORIENTATION_STATES.INCONSISTENT_WINDING);
  assert.equal(evidence.consistent, false);
  assert.ok(
    evidence.elementsRequiringFlip.includes('E3'),
    `the reversed element must be named; got ${JSON.stringify(evidence.elementsRequiringFlip)}`,
  );
  assert.throws(
    () => requireConsistentOrientation(evidence),
    /normals are inconsistent|SHELL_ORIENTATION_INCONSISTENT/,
  );
  // The diagnosis must not have mutated the caller's input.
  assert.deepEqual(inconsistent.find((e) => e.elementId === 'E3').nodeIds, ['N3', 'N6', 'N7', 'N4']);
  console.log(`✅ A reversed element is named (${evidence.elementsRequiringFlip.join(', ')}) and blocks, without mutating the input.`);
}

// --- The repair is explicit, opt-in, and records what it changed. ---
{
  const evidence = diagnoseOrientation(inconsistent);
  const repaired = applyOrientationFlips(inconsistent, evidence);
  assert.deepEqual([...repaired.appliedFlips], ['E3']);
  const recheck = diagnoseOrientation(repaired.elements);
  assert.equal(recheck.state, ORIENTATION_STATES.CONSISTENT, 'the explicit repair must actually resolve the inconsistency');
  assert.equal(requireConsistentOrientation(recheck), recheck);
  // Original list still untouched: the repair returns a new list.
  assert.deepEqual(inconsistent.find((e) => e.elementId === 'E3').nodeIds, ['N3', 'N6', 'N7', 'N4']);
  console.log('✅ applyOrientationFlips is opt-in, records exactly what it flipped, and resolves the inconsistency.');
}

// --- Disconnected patches are reported, not assumed into agreement. ---
{
  const disconnected = [
    { elementId: 'A1', nodeIds: ['P0', 'P1', 'P2'] },
    { elementId: 'B1', nodeIds: ['Q0', 'Q1', 'Q2'] },
  ];
  const evidence = diagnoseOrientation(disconnected);
  assert.equal(evidence.state, ORIENTATION_STATES.DISCONNECTED_PATCHES);
  assert.equal(evidence.patchCount, 2);
  assert.throws(
    () => requireConsistentOrientation(evidence),
    /disconnected patches|SHELL_ORIENTATION_DISCONNECTED_PATCHES/,
  );
  // ...but a caller that genuinely means it can say so explicitly.
  assert.equal(
    requireConsistentOrientation(evidence, { allowDisconnectedPatches: true }),
    evidence,
  );
  console.log('✅ Disconnected patches block by default and require an explicit acknowledgement to proceed.');
}

// --- Determinism: the result must not depend on input ordering. ---
{
  const shuffled = [consistent[2], consistent[0], consistent[3], consistent[1]];
  const a = diagnoseOrientation(consistent);
  const b = diagnoseOrientation(shuffled);
  assert.equal(a.state, b.state);
  assert.deepEqual(a.patches, b.patches);
  assert.equal(a.referenceElementId, b.referenceElementId);

  const shuffledInconsistent = [inconsistent[3], inconsistent[1], inconsistent[2], inconsistent[0]];
  assert.deepEqual(
    diagnoseOrientation(shuffledInconsistent).elementsRequiringFlip,
    diagnoseOrientation(inconsistent).elementsRequiringFlip,
    'the flagged set must not depend on input ordering',
  );
  console.log('✅ Diagnosis is deterministic under input reordering (breadth-first from the lowest element id).');
}

// --- Fail-closed input validation. ---
assert.throws(() => diagnoseOrientation([]), /non-empty element list/);
assert.throws(() => diagnoseOrientation([{ nodeIds: ['A', 'B', 'C'] }]), /elementId/);
assert.throws(() => diagnoseOrientation([{ elementId: 'E', nodeIds: ['A', 'B'] }]), /at least 3 node ids/);

console.log('\n✅ LAFEA.4 orientation-diagnostics check passed.');
