import assert from 'node:assert/strict';
import {
  calculateLocalTrunnionFootprint,
  createCanonicalTrunnionFootprintModel,
  createCanonicalTrunnionFootprintSource,
  validateCanonicalTrunnionFootprintModel,
  validateLocalTrunnionFootprintResult,
} from '../src/core/local-trunnion-footprint/index.js';
import { semanticHash } from '../src/core/local-trunnion-footprint/json.js';
import { clone, workflowSource } from './lafea.5-fixtures.mjs';

const source = workflowSource();
const retained = clone(source);
const result = calculateLocalTrunnionFootprint(source);
assert.equal(result.qualification.state, 'ACCEPTED', JSON.stringify(result.diagnostics));
assert.equal(validateLocalTrunnionFootprintResult(result).qualification.accepted, true);
assert.ok(Object.isFrozen(result));
assert.ok(Object.isFrozen(result.loadDistributionEvidence));
source.shellTemplate.nodes[0].position[0] = 999;
assert.notEqual(result.generatedShellModel.nodes[0].position[0], 999);
assert.doesNotThrow(() => JSON.stringify(result));
assert.deepEqual(retained.shellTemplate.nodes[0].position, [0, 10, 0]);

const canonicalModel = createCanonicalTrunnionFootprintModel(workflowSource());
assert.ok(Object.isFrozen(canonicalModel));
const nonCanonicalModel = clone(canonicalModel);
nonCanonicalModel.canonicalAssessmentRegions.reverse();
const { semanticHash: ignoredModelHash, ...nonCanonicalBody } = nonCanonicalModel;
void ignoredModelHash;
nonCanonicalModel.semanticHash = semanticHash(nonCanonicalBody);
assert.throws(() => validateCanonicalTrunnionFootprintModel(nonCanonicalModel), /ordering is invalid/);

const unknown = workflowSource(); unknown.extra = true;
assert.throws(() => createCanonicalTrunnionFootprintSource(unknown), /fields must be exactly/);
const missing = workflowSource(); delete missing.footprint;
assert.throws(() => createCanonicalTrunnionFootprintSource(missing), /fields must be exactly/);

for (const mutate of malformedMutations()) {
  const malformed = workflowSource(); mutate(malformed);
  assert.throws(() => createCanonicalTrunnionFootprintSource(malformed));
}

const rejected = calculateLocalTrunnionFootprint(unknown);
assert.equal(rejected.qualification.accepted, false);
for (const forbidden of ['loadDistributionEvidence','generatedShellModel','rawShellResult','loadCaseResults','assessmentRegionResults','footprintGeometryEvidence']) assert.equal(Object.hasOwn(rejected, forbidden), false, forbidden);
assert.equal(validateLocalTrunnionFootprintResult(rejected).qualification.accepted, false);
console.log('LAFEA.5 closed contracts, containment, JSON safety, isolation and immutability passed.');

function malformedMutations() {
  return [
    (value) => { Object.defineProperty(value, 'hidden', { value: 1, enumerable: false }); },
    (value) => { Object.defineProperty(value, 'workflowIdentity', { get() { return 'x'; }, enumerable: true }); },
    (value) => { value[Symbol('x')] = 1; },
    (value) => { value.loadCaseMappings = new class CustomArray extends Array {}(...value.loadCaseMappings); },
    (value) => { value.assessmentRegions = Array(2); value.assessmentRegions[1] = workflowSource().assessmentRegions[0]; },
    (value) => { value.self = value; },
    (value) => { value.pipeGeometry.axisPoint = [0, Number.NaN, 0]; },
    (value) => { value.workflowIdentity = () => 'x'; },
    (value) => { value.shellTemplate.nodes[0] = Object.create({ inherited: true }); },
  ];
}