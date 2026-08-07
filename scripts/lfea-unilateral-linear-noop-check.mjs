#!/usr/bin/env node

import assert from 'node:assert/strict';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { solveBm1InputXml } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';
import { solveBm2InputXmlConditioned } from './lfea-b3.26-bm2-solve-runtime.mjs';
import { BM3_BASE_CASES, analyseBaseCase, buildBm3Authorities } from './lfea-m028-bm3-fixtures.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';

function proveNoOp(label, execution) {
  let calls = 0;
  const wrapped = compileUnilateralSolverExecution({
    baseDeclarations: [],
    unilateral: [],
    buildAndSolve: () => { calls += 1; return execution; },
  });
  assert.equal(calls, 1, `${label} must make exactly one inner solve`);
  assert.equal(wrapped.finalExecution, execution, `${label} must preserve exact execution object`);
  assert.equal(wrapped.finalExecutionHash, execution.semanticHash, `${label} execution hash`);
  return Object.freeze({ label, executionHash: execution.semanticHash, wrapperHash: wrapped.semanticHash });
}

const evidence = [];
const bm1 = solveBm1InputXml();
evidence.push(proveNoOp('BM1-SUS', bm1.sustained.execution));
evidence.push(proveNoOp('BM1-OPE', bm1.operating.execution));

const bm2 = solveBm2InputXmlConditioned();
evidence.push(proveNoOp('BM2-SUS', bm2.sustained.execution));
evidence.push(proveNoOp('BM2-OPE', bm2.operating.execution));

const bm3Authorities = buildBm3Authorities();
for (const [caseKey, policy] of Object.entries(BM3_BASE_CASES)) {
  evidence.push(proveNoOp(`BM3-${caseKey}`, analyseBaseCase(bm3Authorities, caseKey, policy).execution));
}

const bm4 = solveBm4InputXmlConditioned();
evidence.push(proveNoOp('BM4-SUS', bm4.sustained.execution));
evidence.push(proveNoOp('BM4-OPE', bm4.operating.execution));

console.log(JSON.stringify({ check: 'lfea-unilateral-linear-noop', status: 'PASS', evidence }, null, 2));
