#!/usr/bin/env node

/**
 * M005 structural and numerical proof for sparse assembly/qualification.
 *
 * Proves that the sparse-declared assembly has no dense `K` property and
 * retains only the lower-triangle Map-backed matrix, while the dense-declared
 * assembly remains the historical flat `n * n` array. It then solves the same
 * FRAME-3D-01 fixture with both backends and requires exact parity for the
 * residual, force-equilibrium, moment-equilibrium and energy-balance values
 * and PASS/WARN/BLOCK verdicts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DENSE_DIRECT_BACKEND_ID,
  SPARSE_DIRECT_BACKEND_ID,
  assembleGlobalSystem,
  buildDofMap,
  compileSolverExecution,
} from '../src/core/linear-fea-solver/index.js';
import {
  cantileverCompilation,
  elementContributions,
  solverProfile,
  tipLoadCase,
} from './lfea-b3.3-solver-fixtures.mjs';

console.log('\n--- LFEA B-3.6 sparse assembly and qualification check ---');

const compilation = cantileverCompilation();
const contributions = elementContributions();
const dofMap = buildDofMap(compilation.model);

const sparseAssembly = assembleGlobalSystem({
  model: compilation.model,
  dofMap,
  elementContributions: contributions,
  backend: SPARSE_DIRECT_BACKEND_ID,
});
assert.equal(Object.hasOwn(sparseAssembly, 'K'), false, 'sparse assembly must not retain or allocate dense K');
assert.equal(Object.hasOwn(sparseAssembly, 'sparseK'), true, 'sparse assembly must retain sparseK');
assert.equal(sparseAssembly.sparseK.size, dofMap.dofCount);
assert.equal(sparseAssembly.sparseK.rows.length, dofMap.dofCount);
assert.equal(
  sparseAssembly.sparseK.rows.reduce((sum, row) => sum + row.size, 0),
  sparseAssembly.lowerTriangleNonzeroCount,
  'stored lower-triangle entries must equal the retained sparse nonzero count',
);

const denseAssembly = assembleGlobalSystem({
  model: compilation.model,
  dofMap,
  elementContributions: contributions,
  backend: DENSE_DIRECT_BACKEND_ID,
});
assert.equal(Object.hasOwn(denseAssembly, 'K'), true, 'dense assembly must retain historical dense K');
assert.equal(Object.hasOwn(denseAssembly, 'sparseK'), false, 'dense assembly must not build the sparse representation');
assert.equal(denseAssembly.K.length, dofMap.dofCount * dofMap.dofCount);
assert.equal(denseAssembly.tripletCount, sparseAssembly.tripletCount);
assert.equal(denseAssembly.lowerTriangleNonzeroCount, sparseAssembly.lowerTriangleNonzeroCount);
assert.equal(denseAssembly.symmetryResidual, sparseAssembly.symmetryResidual);

const root = resolve(import.meta.dirname, '..');
const assemblySource = readFileSync(resolve(root, 'src/core/linear-fea-solver/assembly.js'), 'utf8');
const solveSource = readFileSync(resolve(root, 'src/core/linear-fea-solver/solve.js'), 'utf8');
const qualificationSource = readFileSync(resolve(root, 'src/core/linear-fea-solver/qualification.js'), 'utf8');

const sparseBranchStart = assemblySource.indexOf('} else if (backend === SPARSE_DIRECT_BACKEND_ID) {');
const sparseBranchEnd = assemblySource.indexOf('} else {', sparseBranchStart);
assert.ok(sparseBranchStart >= 0 && sparseBranchEnd > sparseBranchStart, 'sparse assembly branch must be explicit');
assert.doesNotMatch(
  assemblySource.slice(sparseBranchStart, sparseBranchEnd),
  /denseFromTriplets/u,
  'the sparse branch must never call denseFromTriplets',
);
assert.match(
  assemblySource,
  /matrixRepresentation = \{ sparseK: sparseFromTriplets\(n, summed\) \}/u,
  'the sparse branch must select only sparseK',
);
assert.match(
  solveSource,
  /assembleGlobalSystem\(\{[\s\S]*?backend:\s*acceptedProfile\.backend/u,
  'compileSolverExecution must pass the declared backend into assembly',
);
assert.match(
  qualificationSource,
  /import \{ sparseMultiply \} from '\.\.\/lafea-linear-solve\/sparse-matrix\.js'/u,
  'qualification must use the existing sparseMultiply authority',
);

const loadCase = tipLoadCase(compilation);
const dense = compileSolverExecution({
  compilation,
  elementContributions: contributions,
  loadCase,
  solverProfile: solverProfile({ backend: DENSE_DIRECT_BACKEND_ID }),
});
const sparse = compileSolverExecution({
  compilation,
  elementContributions: contributions,
  loadCase,
  solverProfile: solverProfile({ backend: SPARSE_DIRECT_BACKEND_ID }),
});

assert.equal(dense.status, sparse.status, 'overall qualification status');
const qualification = {};
for (const name of ['residual', 'forceEquilibrium', 'momentEquilibrium', 'energyBalance']) {
  const denseCheck = dense.diagnostics[name];
  const sparseCheck = sparse.diagnostics[name];
  assert.equal(sparseCheck.status, denseCheck.status, `${name} verdict`);
  assert.equal(sparseCheck.value, denseCheck.value, `${name} value`);
  if ('imbalance' in denseCheck) assert.equal(sparseCheck.imbalance, denseCheck.imbalance, `${name} imbalance`);
  if ('internalEnergy' in denseCheck) {
    assert.equal(sparseCheck.internalEnergy, denseCheck.internalEnergy, `${name} internal energy`);
    assert.equal(sparseCheck.externalWork, denseCheck.externalWork, `${name} external work`);
  }
  qualification[name] = {
    status: denseCheck.status,
    denseValue: denseCheck.value,
    sparseValue: sparseCheck.value,
  };
}

console.log(JSON.stringify({
  matrixRepresentation: {
    dofCount: dofMap.dofCount,
    denseArrayLength: denseAssembly.K.length,
    sparseDenseKPresent: Object.hasOwn(sparseAssembly, 'K'),
    sparseLowerTriangleStoredEntries: sparseAssembly.lowerTriangleNonzeroCount,
    tripletCountBothTriangles: sparseAssembly.tripletCount,
    symmetryResidual: sparseAssembly.symmetryResidual,
  },
  qualification,
}, null, 2));

console.log('\nLFEA B-3.6 sparse assembly and qualification check PASS\n');
