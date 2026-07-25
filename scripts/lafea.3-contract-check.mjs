import assert from 'node:assert/strict';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  QUALIFICATION_STATES,
  reconstructContinuumResultHashes,
} from '../src/core/local-continuum/index.js';
import { clone, triangleSource } from './lafea.3-fixtures.mjs';

const raw = triangleSource();
const model = createCanonicalLocalContinuumModel(raw);
const result = calculateLocalContinuum(model);
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(result));
assert.deepEqual(result.semanticHashes, reconstructContinuumResultHashes(result));
assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
assert.equal(hasNegativeZero(result), false);

raw.nodes[0].x = 999;
assert.equal(model.nodes[0].x, 0);
const forged = clone(model);
forged.semanticHash = 'fnv1a64:0000000000000000';
const rejected = calculateLocalContinuum(forged);
assert.equal(rejected.qualification.state, QUALIFICATION_STATES.REJECTED_MODEL);
for (const key of ['meshEvidence', 'loadCaseResults']) assert.equal(key in rejected, false);
assert.deepEqual(rejected.formulaTrace, []);

reject((row) => { row.extra = true; });
reject((row) => { delete row.modelVersion; });
reject((row) => { row.nodes[0].extra = true; });
reject((row) => { row.nodes[0].x = '0'; });
reject((row) => { row.nodes[0].x = Infinity; });
reject((row) => { row.nodes.push({ ...row.nodes[0] }); });
reject((row) => { row.elements[0].nodeIds = ['A', 'A', 'C']; });
reject((row) => { row.materials[0].poissonRatio = 0.5; });

const functionValue = triangleSource();
functionValue.nodes[0].x = () => 0;
assert.throws(() => createCanonicalLocalContinuumModel(functionValue), /JSON-safe/);
const symbolValue = triangleSource();
symbolValue.nodes[0].x = Symbol('x');
assert.throws(() => createCanonicalLocalContinuumModel(symbolValue), /JSON-safe/);
const symbolKey = triangleSource();
symbolKey.nodes[0][Symbol('hidden')] = 1;
assert.throws(() => createCanonicalLocalContinuumModel(symbolKey), /non-JSON record property/);
const nonEnumerable = triangleSource();
Object.defineProperty(nonEnumerable.nodes[0], 'hidden', { value: 1, enumerable: false });
assert.throws(() => createCanonicalLocalContinuumModel(nonEnumerable), /non-JSON record property/);
const sparse = triangleSource();
delete sparse.nodes[1];
assert.throws(() => createCanonicalLocalContinuumModel(sparse), /must not contain holes/);
const cycle = triangleSource();
cycle.loop = cycle;
assert.throws(() => createCanonicalLocalContinuumModel(cycle), /cycle/);
const date = triangleSource();
date.nodes[0] = new Date();
assert.throws(() => createCanonicalLocalContinuumModel(date), /plain JSON data/);

console.log('LAFEA.3 exact contracts, containment, JSON safety, hashes and immutability passed.');

function reject(mutator) {
  const source = triangleSource();
  mutator(source);
  assert.throws(() => createCanonicalLocalContinuumModel(source));
}

function hasNegativeZero(value) {
  if (typeof value === 'number') return Object.is(value, -0);
  if (Array.isArray(value)) return value.some(hasNegativeZero);
  if (value && typeof value === 'object') return Object.values(value).some(hasNegativeZero);
  return false;
}
