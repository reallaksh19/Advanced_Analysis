#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCiiOutput, buildBm1CiiComparison, CII_OUTPUT_PATH } from './lfea-bm1-cii-output-comparison.mjs';

console.log('\n--- LFEA BM1 vs. real CAESAR II output: one-to-one OPE/SUS/EXP comparison ---');

const xmlText = readFileSync(CII_OUTPUT_PATH, 'utf8');
const cii = parseCiiOutput(xmlText);
for (const label of ['OPE', 'SUS', 'EXP']) {
  assert.ok(cii.displacement.has(label), `parseCiiOutput missing DISPLACEMENT_REPORT case ${label}`);
  assert.ok(cii.restraint.has(label), `parseCiiOutput missing RESTRAINT_REPORT case ${label}`);
  assert.ok(cii.globalForce.has(label), `parseCiiOutput missing GLOBAL_FORCE_REPORT case ${label}`);
  assert.equal(cii.displacement.get(label).size, 20, `${label} DISPLACEMENT_REPORT must carry all 20 real CAESAR nodes`);
  assert.equal(cii.globalForce.get(label).size, 19, `${label} GLOBAL_FORCE_REPORT must carry all 19 real CAESAR element rows`);
}
// BM1's real declared restraints: 10 physical nodes, two of which (90, 120)
// carry two real CAESAR RESTRAINT records apiece (a co-located "Rigid +Y"
// and "Rigid GUI") that must be summed onto one node, not left as 12 rows.
assert.equal(cii.restraint.get('SUS').size, 10);

const comparison = buildBm1CiiComparison();
assert.equal(comparison.schema, 'lfea-bm1-cii-output-comparison/v1');

const UNMATCHED_BEND_STATION_NODES = ['48', '49', '58', '59'];
const UNMATCHED_BEND_PAIR_KEYS = ['45-48', '48-49', '49-50', '50-58', '58-59', '59-60', '45-50', '50-60'];
for (const label of ['OPE', 'SUS', 'EXP']) {
  const section = comparison.cases[label];
  assert.equal(section.displacement.matched.length, 16, `${label} displacement matched count`);
  assert.deepEqual([...section.displacement.unmatchedCiiNodes].sort(), UNMATCHED_BEND_STATION_NODES);
  assert.equal(section.restraint.matched.length, 10, `${label} restraint matched count`);
  assert.deepEqual(section.restraint.unmatchedCiiNodes, []);
  assert.equal(section.globalForce.matched.length, 13, `${label} globalForce matched count`);
  assert.deepEqual([...section.globalForce.unmatchedCiiPairs].sort(), [...UNMATCHED_BEND_PAIR_KEYS].sort());
}

/*
 * Regression guards against real, hand-verified CASE 4 (SUS) values from
 * BM1_CIIOutput.xml (Owner cross-check, 2026-08-04) at nodes/quantities that
 * are NOT affected by the disclosed restraint-friction gap (nodes 70/80
 * declare a real FRIC_COEF=0.3 this model does not implement; anything
 * downstream of them, and the two anchors that absorb the redistributed
 * load, carries a real, disclosed, larger deviation and is intentionally
 * not asserted tightly here).
 */
const sus = comparison.cases.SUS;
const total = (rows, dof) => rows.reduce((sum, row) => sum + row[dof].ours, 0);
const totalCii = (rows, dof) => rows.reduce((sum, row) => sum + row[dof].cii, 0);
const ourTotalUY = total(sus.restraint.matched, 'UY');
const ciiTotalUY = totalCii(sus.restraint.matched, 'UY');
const totalUYDeviationPercent = ((ourTotalUY - ciiTotalUY) / ciiTotalUY) * 100;
assert.ok(Math.abs(totalUYDeviationPercent) < 3, `SUS total vertical reaction deviation ${totalUYDeviationPercent.toFixed(3)}% exceeds 3%`);

const node45Reaction = sus.restraint.matched.find((row) => row.nodeId === '45');
assert.ok(Math.abs(node45Reaction.UY.percentDifference) < 15, `node 45 SUS UY reaction deviation ${node45Reaction.UY.percentDifference.toFixed(3)}% exceeds 15%`);

const node30Displacement = sus.displacement.matched.find((row) => row.nodeId === '30');
assert.ok(Math.abs(node30Displacement.UY.absoluteDifference) < 1e-5, `node 30 SUS UY displacement absolute difference ${node30Displacement.UY.absoluteDifference} exceeds 1e-5 m`);

// EXP = operating minus sustained on both sides. Gravity does not change
// between OPE and SUS (only temperature does), so the real EXP-case total
// vertical reaction must be ~0 on both this repo's own side and CAESAR's
// real CASE 5 (EXP) L5=L3-L4 side — a physically independent cross-check of
// the EXP-as-delta construction, not something either side was tuned to hit.
const exp = comparison.cases.EXP;
const ourExpTotalUY = total(exp.restraint.matched, 'UY');
const ciiExpTotalUY = totalCii(exp.restraint.matched, 'UY');
assert.ok(Math.abs(ourExpTotalUY) < 1, `EXP total vertical reaction (ours) should be ~0 N, got ${ourExpTotalUY}`);
assert.ok(Math.abs(ciiExpTotalUY) < 1, `EXP total vertical reaction (real CAESAR CASE 5) should be ~0 N, got ${ciiExpTotalUY}`);

assert.equal(comparison.limitations.length, 3);

mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
writeFileSync(fileURLToPath(new URL('../reports/lfea-bm1-cii-output-comparison.json', import.meta.url)), `${JSON.stringify(comparison, null, 2)}\n`);

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-bm1-cii-comparison'], 'node scripts/lfea-bm1-cii-output-comparison-check.mjs');
assert.ok(packageJson.scripts['check:lfea-linear-core'].includes('check:lfea-bm1-cii-comparison'));

console.log(`SUS total vertical reaction: ours ${ourTotalUY.toFixed(3)} N vs. real CAESAR ${ciiTotalUY.toFixed(3)} N (${totalUYDeviationPercent.toFixed(3)}% deviation)`);
console.log(`EXP total vertical reaction: ours ${ourExpTotalUY.toFixed(6)} N vs. real CAESAR ${ciiExpTotalUY.toFixed(6)} N (both ~0, independent cross-check of the EXP-as-delta construction)`);
console.log('LFEA BM1 vs. real CAESAR II output comparison PASS');
