#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/06-production-response-convergence-spec.json',
);
const SOLVER_PATH = path.join(ROOT, 'src/core/local-continuum/solver.js');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_SOLVER_POLICY_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-solver-policy-contract.json',
);

const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const source = fs.readFileSync(SOLVER_PATH, 'utf8');
const policy = spec.solverPolicy;

assert.equal(spec.schema, 'lafea-bucket-01-production-response-spec/v3');
assert.equal(policy.largeSystemStorage, 'CSR_FULL_SYMMETRIC');
assert.equal(policy.largeSystemMethod, 'DETERMINISTIC_JACOBI_PCG');
assert.equal(policy.preconditioner, 'JACOBI');
assert.equal(policy.residualAuthority, 'EXACT_RECOMPUTED_FREE_DOF_RESIDUAL');
assert.equal(policy.internalConvergenceTarget, 'residualTolerance/10');
assert.equal(
  policy.maximumIterations,
  'min(50000,max(1000,16*freeDofCount))',
);
assert.equal(policy.exactResidualRefreshInterval, 100);
assert.equal(policy.reliableUpdateOnRecursiveTargetOnly, true);
assert.equal(policy.smallSystemMethodUnchanged, true);
assert.equal(policy.testOnlySolverSubstitutionAllowed, false);

for (const token of [
  'const convergenceTarget = residualTolerance / 10;',
  'Math.max(1000, matrix.size * 16)',
  'iterations % 100 === 0',
  'const reliableResidual = exactResidual(matrix, rightHandSide, solution);',
  'recursiveResidualInfinity <= convergenceTarget',
  'finalResidualInfinity > convergenceTarget',
  'convergenceTarget: canonicalNumber(convergenceTarget)',
  'residualTolerance: canonicalNumber(residualTolerance)',
]) {
  assert.ok(source.includes(token), `solver implementation missing policy token: ${token}`);
}

const reportBase = {
  schema: 'lafea-bucket-01-solver-policy-contract-evidence/v1',
  producerRevision: 'B01-SOLVER-POLICY-CONTRACT.1',
  specHash: canonicalLafeaSha256(spec),
  solverSourceHash: canonicalLafeaSha256({
    path: 'src/core/local-continuum/solver.js',
    content: source,
  }),
  governedPolicy: {
    storage: policy.largeSystemStorage,
    method: policy.largeSystemMethod,
    preconditioner: policy.preconditioner,
    residualAuthority: policy.residualAuthority,
    internalConvergenceTarget: policy.internalConvergenceTarget,
    maximumIterations: policy.maximumIterations,
    exactResidualRefreshInterval: policy.exactResidualRefreshInterval,
    reliableUpdateOnRecursiveTargetOnly:
      policy.reliableUpdateOnRecursiveTargetOnly,
  },
  authority: {
    sourceAndSpecBound: true,
    exactResidualRequired: true,
    recursiveResidualAloneNotAccepted: true,
    solverToleranceRelaxed: false,
    denseSmallSystemRouteChanged: false,
    bucketQualified: false,
  },
  status: 'PASS',
};
const report = {
  ...reportBase,
  evidenceHash: canonicalLafeaSha256(reportBase),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
