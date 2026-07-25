import assert from 'node:assert/strict';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  FORMULA_IDS,
  QUALIFICATION_STATES,
} from '../src/core/local-shell/index.js';
import { prescribedPatchSource, triangleSource } from './lafea.4-fixtures.mjs';

const base = solve(triangleSource());
const row = base.loadCaseResults[0];
assert.equal(row.solverEvidence.method, 'DETERMINISTIC_DENSE_CHOLESKY');
assert.ok(row.solverEvidence.pivots.length > 0);
assert.ok(row.solverEvidence.minimumPivot > row.solverEvidence.pivotTolerance);
assert.ok(row.freeDofResidualQualification.accepted);
assert.ok(row.forceEquilibrium.qualification.accepted);
assert.ok(row.momentEquilibrium.qualification.accepted);
assert.ok(row.reactions.some((reaction) => reaction.kind === 'FORCE'));
assert.ok(row.reactions.some((reaction) => reaction.kind === 'MOMENT'));

const doubled = solve(triangleSource((source) => scaleLoads(source, 2)));
const reversed = solve(triangleSource((source) => scaleLoads(source, -1)));
compareDisplacements(doubled, base, 2);
compareDisplacements(reversed, base, -1);

const momentOnly = solve(triangleSource((source) => {
  const load = source.loadCases[0].nodalLoads[0];
  load.fx = 0; load.fy = 0; load.fz = 0; load.m1 = 500; load.m2 = -200;
}));
assert.ok(momentOnly.loadCaseResults[0].nodalDisplacements.some((node) => Math.abs(node.r1) + Math.abs(node.r2) > 0));
assert.ok(momentOnly.loadCaseResults[0].momentEquilibrium.qualification.accepted);

const multiple = triangleSource((source) => {
  source.loadCases.push({
    ...JSON.parse(JSON.stringify(source.loadCases[0])),
    loadCaseId: 'SECOND',
    sourceReference: 'SECOND-SRC',
    nodalLoads: source.loadCases[0].nodalLoads.map((load) => ({ ...load, loadId: `${load.loadId}-SECOND`, fx: -0.5 * load.fx, fy: -0.5 * load.fy, fz: -0.5 * load.fz, m1: -0.5 * load.m1, m2: -0.5 * load.m2 })),
  });
});
const multipleResult = solve(multiple);
assert.equal(multipleResult.loadCaseResults.length, 2);
const first = multipleResult.loadCaseResults.find((item) => item.loadCaseId === 'LC');
const second = multipleResult.loadCaseResults.find((item) => item.loadCaseId === 'SECOND');
compareRows(second, first, -0.5);

const fully = solve(prescribedPatchSource({ epsilonX: 0, epsilonY: 0, gammaXY: 0, curvature: [0, 0, 0] }));
assert.equal(fully.loadCaseResults[0].solverEvidence.method, 'FULLY_CONSTRAINED_NO_FREE_SOLVE');
assert.deepEqual(fully.loadCaseResults[0].solverEvidence.pivots, []);
assert.equal(fully.formulaTrace.includes(FORMULA_IDS.CHOLESKY), false);

const singularSource = triangleSource((source) => { source.constraints = []; });
const singular = calculateLocalShell(createCanonicalLocalShellModel(singularSource));
assert.equal(singular.qualification.state, QUALIFICATION_STATES.SINGULAR_SYSTEM);
assert.equal('loadCaseResults' in singular, false);
assert.equal('meshEvidence' in singular, false);

const duplicateConstraint = triangleSource((source) => source.constraints.push({ ...source.constraints[0], constraintId: 'DUP' }));
assert.throws(() => createCanonicalLocalShellModel(duplicateConstraint), /Duplicate prescribed DOF/);

console.log('LAFEA.4 exact partitioning, Cholesky evidence, nodal forces/moments, scaling, independent cases, reactions and singular rejection passed.');

function solve(source) {
  const result = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED, result.qualification.summary);
  return result;
}

function scaleLoads(source, factor) {
  for (const loadCase of source.loadCases) {
    for (const load of loadCase.nodalLoads) {
      for (const field of ['fx', 'fy', 'fz', 'm1', 'm2']) load[field] *= factor;
    }
  }
}

function compareDisplacements(actual, expected, factor) {
  compareRows(actual.loadCaseResults[0], expected.loadCaseResults[0], factor);
}

function compareRows(actual, expected, factor) {
  for (let index = 0; index < actual.nodalDisplacements.length; index += 1) {
    for (const field of ['ux', 'uy', 'uz', 'r1', 'r2']) close(actual.nodalDisplacements[index][field], factor * expected.nodalDisplacements[index][field]);
  }
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
