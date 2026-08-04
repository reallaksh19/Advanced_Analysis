#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm1InputXml } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';
import {
  buildBm1CiiComparison,
  CII_OUTPUT_PATH,
  parseCiiOutput,
} from './lfea-bm1-cii-output-comparison.mjs';

const PERCENT_LIMIT = 10;
const MECHANICS_ONLY = process.argv.includes('--mechanics-only');
const ZERO_REFERENCE_TOLERANCE = Object.freeze({
  displacementTranslation: 1e-6,
  displacementRotation: 1e-6,
  reactionForce: 1,
  reactionMoment: 1,
  elementForce: 1,
  elementMoment: 1,
});

console.log('\n--- LFEA B-3.19 BM1 Coulomb restraint friction and ±10% closure ---');
const result = solveBm1InputXml();
const friction = result.friction;
assert.equal(friction.schema, 'm025-bm1-coulomb-friction/v2');
assert.equal(friction.profile.algorithm, 'SIMULTANEOUS_ACTIVE_SET_ENUMERATION_DAMPED_NEWTON_V2');
assert.deepEqual(friction.sourceSites.map((row) => row.sourceNodeId), ['70', '80']);
assert.ok(friction.sourceSites.every((row) => row.coefficient === 0.3));

for (const [label, expectedState] of [['sustained', 'STICK'], ['operating', 'SLIP']]) {
  const solved = friction[label];
  assert.equal(solved.converged, true, `${label} friction convergence`);
  assert.ok(solved.iterationCount >= 1 && solved.iterationCount <= friction.profile.maximumNewtonIterations);
  assert.equal(solved.activeSetCandidateCount, 4);
  assert.equal(solved.admissibleActiveSetCount, 1);
  assert.ok(solved.residualInfinityNorm <= solved.forceTolerance);
  assert.deepEqual(solved.nodes.map((row) => row.state), [expectedState, expectedState]);
  for (const node of solved.nodes) {
    const tolerance = 1e-5 + 1e-8 * Math.max(1, node.coulombLimit);
    assert.ok(node.tangentialMagnitude <= node.coulombLimit + tolerance,
      `${label} node ${node.sourceNodeId} violates |T| <= muN: ${node.tangentialMagnitude} > ${node.coulombLimit}`);
    if (expectedState === 'SLIP') {
      assert.ok(Math.abs(node.tangentialMagnitude - node.coulombLimit) <= tolerance,
        `${label} node ${node.sourceNodeId} sliding force is not on Coulomb surface.`);
      const dot = node.tangentialForce.x * node.tangentialDisplacement.ux
        + node.tangentialForce.z * node.tangentialDisplacement.uz;
      assert.ok(dot < 0, `${label} node ${node.sourceNodeId} friction does not oppose sliding.`);
    }
  }
}

const cii = parseCiiOutput(readFileSync(CII_OUTPUT_PATH, 'utf8'));
const referenceMobilization = Object.fromEntries(['SUS', 'OPE'].flatMap((caseLabel) => ['70', '80'].map((nodeId) => {
  const row = cii.restraint.get(caseLabel).get(nodeId);
  const normal = Math.abs(row.FY);
  const tangential = Math.hypot(row.FX, row.FZ);
  return [`${caseLabel}:${nodeId}`, tangential / (0.3 * normal)];
})));
for (const [caseLabel, solved] of [['SUS', friction.sustained], ['OPE', friction.operating]]) {
  for (const node of solved.nodes) {
    const reference = referenceMobilization[`${caseLabel}:${node.sourceNodeId}`];
    const deviationPercent = ((node.mobilization - reference) / reference) * 100;
    assert.ok(Math.abs(deviationPercent) <= PERCENT_LIMIT,
      `${caseLabel} node ${node.sourceNodeId} mobilization deviation ${deviationPercent}% exceeds ±${PERCENT_LIMIT}%.`);
  }
}

const comparison = buildBm1CiiComparison();
const audit = auditComparison(comparison);
const report = {
  schema: 'm025-bm1-friction-qualification/v1',
  percentLimit: PERCENT_LIMIT,
  zeroReferenceTolerance: ZERO_REFERENCE_TOLERANCE,
  friction,
  referenceMobilization,
  audit,
};
mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
writeFileSync(
  fileURLToPath(new URL('../reports/lfea-bm1-m025-friction-qualification.json', import.meta.url)),
  `${JSON.stringify(report, null, 2)}\n`,
);

assert.ok(result.report.equilibrium.sustained.normalizedWorst < 1e-5, JSON.stringify(result.report.equilibrium.sustained));
assert.ok(result.report.equilibrium.operating.normalizedWorst < 1e-5, JSON.stringify(result.report.equilibrium.operating));

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-b3.19'], 'node scripts/lfea-b3.19-bm1-friction-check.mjs');
assert.equal(packageJson.scripts['check:lfea-b3.19:mechanics'], 'node scripts/lfea-b3.19-bm1-friction-check.mjs --mechanics-only');
assert.ok(packageJson.scripts['check:lfea-linear-core'].includes('npm run check:lfea-b3.19'));

if (!MECHANICS_ONLY) {
  assert.equal(audit.failures.length, 0,
    `M025 ±10% closure failed for ${audit.failures.length}/${audit.total} comparisons:\n${audit.failures.slice(0, 30).map(formatFailure).join('\n')}`);
}

console.log(JSON.stringify({
  check: 'lfea-b3.19-bm1-friction',
  status: MECHANICS_ONLY ? 'MECHANICS_PASS_POINTWISE_OPEN' : 'PASS',
  friction: {
    sustained: summaryFriction(friction.sustained),
    operating: summaryFriction(friction.operating),
  },
  comparison: audit.summary,
}, null, 2));
console.log(MECHANICS_ONLY
  ? `LFEA B-3.19 Coulomb mechanics PASS; pointwise closure remains ${audit.failures.length}/${audit.total} outside ±${PERCENT_LIMIT}%.`
  : 'LFEA B-3.19 BM1 Coulomb restraint friction and ±10% closure PASS');

function auditComparison(value) {
  const entries = [];
  for (const [caseLabel, section] of Object.entries(value.cases)) {
    for (const row of section.displacement.matched) {
      for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) {
        entries.push(classify({
          caseLabel,
          family: 'displacement',
          identity: `node ${row.nodeId}`,
          component: dof,
          value: row[dof],
          zeroTolerance: dof.startsWith('R')
            ? ZERO_REFERENCE_TOLERANCE.displacementRotation
            : ZERO_REFERENCE_TOLERANCE.displacementTranslation,
        }));
      }
    }
    for (const row of section.restraint.matched) {
      for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) {
        entries.push(classify({
          caseLabel,
          family: 'restraint',
          identity: `node ${row.nodeId}`,
          component: dof,
          value: row[dof],
          zeroTolerance: dof.startsWith('R')
            ? ZERO_REFERENCE_TOLERANCE.reactionMoment
            : ZERO_REFERENCE_TOLERANCE.reactionForce,
        }));
      }
    }
    for (const row of section.globalForce.matched) {
      for (const end of ['I', 'J']) {
        for (const component of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) {
          entries.push(classify({
            caseLabel,
            family: 'globalForce',
            identity: `element ${row.pairKey} ${end}`,
            component,
            value: row[end][component],
            zeroTolerance: component.startsWith('m')
              ? ZERO_REFERENCE_TOLERANCE.elementMoment
              : ZERO_REFERENCE_TOLERANCE.elementForce,
          }));
        }
      }
    }
  }
  const failures = entries.filter((row) => !row.pass);
  const byCase = Object.fromEntries(['OPE', 'SUS', 'EXP'].map((caseLabel) => {
    const rows = entries.filter((row) => row.caseLabel === caseLabel);
    return [caseLabel, { total: rows.length, passed: rows.filter((row) => row.pass).length, failed: rows.filter((row) => !row.pass).length }];
  }));
  const byFamily = Object.fromEntries(['displacement', 'restraint', 'globalForce'].map((family) => {
    const rows = entries.filter((row) => row.family === family);
    return [family, { total: rows.length, passed: rows.filter((row) => row.pass).length, failed: rows.filter((row) => !row.pass).length }];
  }));
  return {
    total: entries.length,
    passed: entries.length - failures.length,
    failures,
    entries,
    summary: { total: entries.length, passed: entries.length - failures.length, failed: failures.length, byCase, byFamily },
  };
}

function classify({ caseLabel, family, identity, component, value, zeroTolerance }) {
  const percentComparable = value.percentDifference !== null;
  const pass = percentComparable
    ? Math.abs(value.percentDifference) <= PERCENT_LIMIT
    : Math.abs(value.absoluteDifference) <= zeroTolerance;
  return {
    caseLabel,
    family,
    identity,
    component,
    ours: value.ours,
    cii: value.cii,
    absoluteDifference: value.absoluteDifference,
    percentDifference: value.percentDifference,
    percentComparable,
    zeroTolerance: percentComparable ? null : zeroTolerance,
    pass,
  };
}

function formatFailure(row) {
  const deviation = row.percentComparable
    ? `${row.percentDifference.toFixed(3)}%`
    : `absolute ${row.absoluteDifference} (zero-reference tolerance ${row.zeroTolerance})`;
  return `${row.caseLabel} ${row.family} ${row.identity} ${row.component}: ${deviation}; ours=${row.ours}, CAESAR=${row.cii}`;
}

function summaryFriction(value) {
  return {
    iterationCount: value.iterationCount,
    states: value.states,
    nodes: value.nodes.map((row) => ({
      sourceNodeId: row.sourceNodeId,
      state: row.state,
      normalMagnitude: row.normalMagnitude,
      tangentialMagnitude: row.tangentialMagnitude,
      coulombLimit: row.coulombLimit,
      mobilization: row.mobilization,
    })),
  };
}
