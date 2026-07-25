import assert from 'node:assert/strict';
import { calculateLocalAttachmentFoundation } from '../src/core/local-stress/index.js';
import { canonicalFixture } from './lafea.1-fixtures.mjs';
const firstModel = canonicalFixture();
const secondModel = canonicalFixture((source) => {
  source.pressureDefinitions.reverse();
  source.loadReferencePoints.reverse();
  source.resultRequests.requestedAnalyses.reverse();
  source.materials.reverse();
});
assert.equal(JSON.stringify(firstModel), JSON.stringify(secondModel));
const first = calculateLocalAttachmentFoundation(firstModel);
const second = calculateLocalAttachmentFoundation(secondModel);
assert.equal(JSON.stringify(first), JSON.stringify(second));
const caller = JSON.parse(JSON.stringify(firstModel));
const result = calculateLocalAttachmentFoundation(caller);
caller.loadCases[0].force.value[0] = 99;
assert.equal(result.transformedLoadCases[0].transformedForceGlobal[0], 1000);
assert.throws(() => { result.transformedLoadCases[0].transformedForceGlobal[0] = 5; }, TypeError);
const duplicateRejected = (() => {
  try { canonicalFixture((source) => source.loadCases.push({ ...source.loadCases[0] })); return false; }
  catch (error) { return /Duplicate identity/.test(error.message); }
})();
assert.equal(duplicateRejected, true);
console.log('LAFEA.1 determinism checks passed.');
