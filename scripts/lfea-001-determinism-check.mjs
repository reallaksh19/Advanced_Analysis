import assert from 'node:assert/strict';
import { solveContinuumModel } from '../src/core/element-fea/index.js';
import { clone, loadCase, squarePatch } from './lfea-001-fixtures.mjs';

const original = squarePatch((x, y) => [0.1 + 0.02 * x + 0.03 * y, -0.2 + 0.04 * x + 0.05 * y]);
original.loadCases = [loadCase('LC1'), loadCase('LC2')];
original.sourceReferences.push({
  sourceReferenceId: 'SRC-2',
  sourceType: 'QUALIFIED_FIXTURE_AUXILIARY',
  sourceVersion: '1',
  sourceSemanticHash: original.sourceSemanticHash,
});
original.limitations.push('Second deterministic limitation.');
const reordered = clone(original);
reordered.nodes.reverse();
reordered.elements.reverse();
reordered.materials.reverse();
reordered.prescribedDisplacements.reverse();
reordered.loadCases.reverse();
reordered.sourceReferences.reverse();
reordered.limitations.reverse();
reordered.nodes[0].x = Object.is(reordered.nodes[0].x, 0) ? -0 : reordered.nodes[0].x;

const first = solveContinuumModel(original, 'LC2');
const repeated = solveContinuumModel(clone(original), 'LC2');
const permuted = solveContinuumModel(reordered, 'LC2');
assert.equal(first.status, 'QUALIFIED');
assert.equal(repeated.status, 'QUALIFIED');
assert.equal(permuted.status, 'QUALIFIED');
assert.equal(first.semanticHash, repeated.semanticHash);
assert.equal(first.semanticHash, permuted.semanticHash);
assert.equal(JSON.stringify(first), JSON.stringify(repeated));
assert.equal(JSON.stringify(first), JSON.stringify(permuted));
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.modelEvidence));
assert.ok(Object.isFrozen(first.nodalDisplacements));
assert.ok(Object.isFrozen(first.elementStresses));
console.log(`LFEA-001 repeated-run and reordered-input deterministic evidence passed: ${first.semanticHash}`);
