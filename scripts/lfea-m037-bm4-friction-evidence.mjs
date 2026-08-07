#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reactionUy, solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const REPORT_DIR = fileURLToPath(new URL('../reports', import.meta.url));
const ATTRIBUTION_PATH = `${REPORT_DIR}/m035-m036-bm4-failure-attribution.json`;
const OUTPUT_PATH = `${REPORT_DIR}/m037-bm4-friction-evidence.json`;
const ATTRIBUTION_SCRIPT = fileURLToPath(new URL('./lfea-m035-m036-bm4-failure-attribution.mjs', import.meta.url));
const NODE_ID = '22370';
const AXIAL_SPANS = new Set(['22380-22390', '22390-22400']);

if (!existsSync(ATTRIBUTION_PATH)) {
  execFileSync(process.execPath, [ATTRIBUTION_SCRIPT], { stdio: 'inherit' });
}

const attribution = JSON.parse(readFileSync(ATTRIBUTION_PATH, 'utf8'));
const solved = solveBm4M035M036Combined();
const node = solved.authorities.sourceGeometry.nodes.find((candidate) => String(candidate.id) === NODE_ID);
assert.ok(node, `BM4 source node ${NODE_ID} must exist.`);

const frictionRestraint = (node.meta?.restraints ?? []).find((row) => (
  Number.isFinite(row.frictionCoefficient)
  && row.frictionCoefficient > 0
  && Math.abs(row.xCosine ?? 0) <= 1e-12
  && Math.abs((row.yCosine ?? 0) - 1) <= 1e-12
  && Math.abs(row.zCosine ?? 0) <= 1e-12
));
assert.ok(frictionRestraint, 'BM4 node 22370 must retain a +Y frictional restraint source row.');

const mu = frictionRestraint.frictionCoefficient;
const normalReaction = reactionUy(solved.operating.execution, NODE_ID);
assert.ok(normalReaction > 0, 'BM4 node 22370 OPE normal reaction must be compressive/positive in the qualified sign convention.');
const coulombCapacity = mu * normalReaction;

const axialRows = attribution.matchedFailures.filter((row) => (
  row.caseLabel === 'OPE'
  && AXIAL_SPANS.has(String(row.identifier))
  && (row.family === 'globalForce' || row.family === 'localForce')
  && row.field === 'fx'
  && (row.end === 'I' || row.end === 'J')
));
assert.equal(axialRows.length, 8, 'Expected eight duplicated global/local I/J axial-force rows across the two node-22370 downstream spans.');

const residuals = axialRows.map((row) => Math.abs(row.absoluteDifference));
const axialResidual = residuals[0];
for (const residual of residuals) {
  assert.ok(Math.abs(residual - axialResidual) <= 1e-6, 'Node 22370 downstream axial-force residual must be coherent across duplicated result rows.');
}
const capacityUtilization = axialResidual / coulombCapacity;
assert.ok(capacityUtilization > 0 && capacityUtilization < 1, 'Observed axial residual must be mechanically reachable inside the source Coulomb bound.');

const evidence = Object.freeze({
  schema: 'm037-bm4-friction-evidence/v1',
  mechanicsChanged: false,
  nodeId: NODE_ID,
  source: Object.freeze({
    frictionCoefficient: mu,
    normalAxis: Object.freeze([frictionRestraint.xCosine ?? 0, frictionRestraint.yCosine ?? 0, frictionRestraint.zCosine ?? 0]),
  }),
  operating: Object.freeze({
    normalReactionN: normalReaction,
    coulombCapacityN: coulombCapacity,
    axialResidualN: axialResidual,
    capacityUtilization,
  }),
  duplicatedAxialRows: Object.freeze(axialRows.map((row) => Object.freeze({
    family: row.family,
    identifier: row.identifier,
    end: row.end,
    field: row.field,
    ours: row.ours,
    cii: row.cii,
    absoluteDifference: row.absoluteDifference,
  }))),
  interpretation: 'REACHABILITY_EVIDENCE_ONLY_NOT_STICK_SLIP_STATE_PROOF',
  implementationBoundary: 'FRICTION_REMAINS_ISSUE_668_STATEFUL_NONLINEAR_SCOPE',
});

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`M037_FRICTION_EVIDENCE=${JSON.stringify(evidence.operating)}`);
console.log(`M037 friction evidence PASS; evidence written to ${OUTPUT_PATH}`);
