import assert from 'node:assert/strict';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  DOFS,
  FORMULA_IDS,
  MODEL_SCHEMA,
  QUALIFICATION_STATES,
  reconstructShellResultHashes,
  RESULT_SCHEMA,
  validateLocalShellResult,
} from '../src/core/local-shell/index.js';
import { clone, triangleSource } from './lafea.4-fixtures.mjs';

const raw = triangleSource();
const model = createCanonicalLocalShellModel(raw);
const result = calculateLocalShell(model);
assert.equal(model.schema, MODEL_SCHEMA);
assert.equal(result.schema, RESULT_SCHEMA);
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(model.nodes));
assert.ok(Object.isFrozen(result));
assert.deepEqual(result.semanticHashes, reconstructShellResultHashes(result));
assert.equal(validateLocalShellResult(result).qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
assert.equal(hasNegativeZero(result), false);
assert.ok(result.formulaTrace.includes(FORMULA_IDS.CHOLESKY));
assert.deepEqual(result.meshEvidence.dofOrdering.slice(0, 5), DOFS.map((dof) => `A:${dof}`));

raw.nodes[0].position[0] = 999;
assert.equal(model.nodes[0].position[0], 0);
const forged = clone(model);
forged.semanticHash = 'fnv1a64:0000000000000000';
const rejected = calculateLocalShell(forged);
assert.equal(rejected.qualification.state, QUALIFICATION_STATES.REJECTED_MODEL);
for (const key of ['meshEvidence', 'loadCaseResults']) assert.equal(key in rejected, false);
assert.deepEqual(rejected.formulaTrace, []);
assert.deepEqual(rejected.semanticHashes, reconstructShellResultHashes(rejected));
assert.equal(validateLocalShellResult(rejected).qualification.state, QUALIFICATION_STATES.REJECTED_MODEL);

const forgedResult = clone(result);
forgedResult.meshEvidence.elements[0].unexpected = true;
forgedResult.semanticHashes = reconstructShellResultHashes(forgedResult);
assert.throws(() => validateLocalShellResult(forgedResult), /keys must/);
const missingResult = clone(result);
delete missingResult.loadCaseResults[0].energyQualification;
missingResult.semanticHashes = reconstructShellResultHashes(missingResult);
assert.throws(() => validateLocalShellResult(missingResult), /keys must/);

reject((row) => { row.extra = true; });
reject((row) => { delete row.modelVersion; });
reject((row) => { row.nodes[0].extra = true; });
reject((row) => { delete row.nodes[0].director; });
reject((row) => { row.elements[0].extra = true; });
reject((row) => { row.materials[0].elasticModulus = '200000'; });
reject((row) => { row.materials[0].poissonRatio = 0.5; });
reject((row) => { row.nodes.push({ ...row.nodes[0] }); });
reject((row) => { row.elements.push({ ...row.elements[0], elementId: 'E2' }); });
reject((row) => { row.constraints.push({ ...row.constraints[0], constraintId: 'OTHER' }); });
reject((row) => { row.elements[0].nodeIds = ['A', 'A', 'C']; });
reject((row) => { row.nodes.push({ ...row.nodes[0], nodeId: 'UNUSED' }); });
reject((row) => { row.elements[0].materialId = 'MISSING'; });
reject((row) => { row.loadCases[0].nodalLoads[0].nodeId = 'MISSING'; });
reject((row) => { row.loadCases[0].pressureLoads.push({ pressureLoadId: 'P', elementId: 'MISSING', pressure: 1, sense: 'ALONG_ELEMENT_NORMAL', sourceReference: 'P-SRC' }); });

const functionValue = triangleSource();
functionValue.nodes[0].position[0] = () => 0;
assert.throws(() => createCanonicalLocalShellModel(functionValue), /JSON-safe/);
const symbolValue = triangleSource();
symbolValue.nodes[0].position[0] = Symbol('x');
assert.throws(() => createCanonicalLocalShellModel(symbolValue), /JSON-safe/);
const symbolKey = triangleSource();
symbolKey.nodes[0][Symbol('hidden')] = 1;
assert.throws(() => createCanonicalLocalShellModel(symbolKey), /non-JSON record property/);
const nonEnumerable = triangleSource();
Object.defineProperty(nonEnumerable.nodes[0], 'hidden', { value: 1, enumerable: false });
assert.throws(() => createCanonicalLocalShellModel(nonEnumerable), /non-JSON record property/);
const accessor = triangleSource();
Object.defineProperty(accessor.nodes[0], 'position', { get: () => [0, 0, 0], enumerable: true });
assert.throws(() => createCanonicalLocalShellModel(accessor), /non-JSON record property/);
let getterCalls = 0;
const topAccessor = triangleSource();
Object.defineProperty(topAccessor, 'modelIdentity', { get: () => { getterCalls += 1; return 'BAD'; }, enumerable: true });
assert.equal(calculateLocalShell(topAccessor).qualification.state, QUALIFICATION_STATES.REJECTED_MODEL);
assert.equal(getterCalls, 0);
const sparse = triangleSource();
delete sparse.nodes[1];
assert.throws(() => createCanonicalLocalShellModel(sparse), /must not contain holes/);
const custom = triangleSource();
custom.nodes = Object.setPrototypeOf([...custom.nodes], { custom: true });
assert.throws(() => createCanonicalLocalShellModel(custom), /custom array prototype/);
const cycle = triangleSource();
cycle.loop = cycle;
assert.throws(() => createCanonicalLocalShellModel(cycle), /cycle/);
const date = triangleSource();
date.nodes[0] = new Date();
assert.throws(() => createCanonicalLocalShellModel(date), /plain JSON objects/);
const nonfinite = triangleSource();
nonfinite.nodes[0].position[0] = Infinity;
assert.throws(() => createCanonicalLocalShellModel(nonfinite), /non-finite/);

console.log('LAFEA.4 closed contracts, containment, JSON safety, hashes and caller isolation passed.');

function reject(mutator) {
  const source = triangleSource();
  mutator(source);
  assert.throws(() => createCanonicalLocalShellModel(source));
}

function hasNegativeZero(value) {
  if (typeof value === 'number') return Object.is(value, -0);
  if (Array.isArray(value)) return value.some(hasNegativeZero);
  if (value && typeof value === 'object') return Object.values(value).some(hasNegativeZero);
  return false;
}
