import assert from 'node:assert/strict';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  FORMULA_IDS,
} from '../src/core/local-shell/index.js';
import { canonicalStringify } from '../src/core/local-shell/json.js';
import { patchSource, pressurePatchSource } from './lafea.4-fixtures.mjs';

const source = patchSource();
const model = createCanonicalLocalShellModel(source);
const bytes = canonicalStringify(calculateLocalShell(model));
for (let run = 0; run < 20; run += 1) {
  assert.equal(canonicalStringify(calculateLocalShell(model)), bytes);
}

const permuted = patchSource((value) => {
  value.nodes.reverse();
  value.elements.reverse();
  value.elements.forEach((element) => element.nodeIds.reverse());
  value.constraints.reverse();
  value.loadCases.reverse();
  value.loadCases.forEach((loadCase) => {
    loadCase.nodalLoads.reverse();
    loadCase.pressureLoads.reverse();
  });
  value.materials.reverse();
  value.sourceAncestry.reverse();
  value.limitations.reverse();
  value.resultRequests.stressSurfaces.reverse();
});
const permutedModel = createCanonicalLocalShellModel(permuted);
assert.equal(model.semanticHash, permutedModel.semanticHash);
assert.equal(bytes, canonicalStringify(calculateLocalShell(permutedModel)));

const raw = patchSource();
const isolated = createCanonicalLocalShellModel(raw);
const before = canonicalStringify(isolated);
raw.nodes[0].position[0] = 999;
raw.loadCases[0].nodalLoads[0].fx = 999;
assert.equal(canonicalStringify(isolated), before);

const zero = patchSource((value) => {
  value.loadCases[0].nodalLoads.forEach((load) => {
    load.fx = -0; load.fy = -0; load.fz = -0; load.m1 = -0; load.m2 = -0;
  });
});
assert.equal(hasNegativeZero(calculateLocalShell(createCanonicalLocalShellModel(zero))), false);

const noPressure = calculateLocalShell(model);
const pressure = calculateLocalShell(createCanonicalLocalShellModel(pressurePatchSource()));
assert.equal(noPressure.formulaTrace.includes(FORMULA_IDS.PRESSURE_LOAD), false);
assert.equal(pressure.formulaTrace.includes(FORMULA_IDS.PRESSURE_LOAD), true);
assert.equal(pressure.formulaTrace.includes(FORMULA_IDS.CHOLESKY), false);

console.log('LAFEA.4 permutation invariance, repeated-byte identity, caller isolation, negative-zero and executed formula tracing passed.');

function hasNegativeZero(value) {
  if (typeof value === 'number') return Object.is(value, -0);
  if (Array.isArray(value)) return value.some(hasNegativeZero);
  if (value && typeof value === 'object') return Object.values(value).some(hasNegativeZero);
  return false;
}
