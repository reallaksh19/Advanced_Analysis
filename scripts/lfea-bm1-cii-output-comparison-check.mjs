#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCiiOutput, buildBm1CiiComparison, CII_OUTPUT_PATH } from './lfea-bm1-cii-output-comparison.mjs';

console.log('\n--- LFEA BM1 vs. real CAESAR II output: bend-resolved OPE/SUS/EXP comparison ---');
const xmlText = readFileSync(CII_OUTPUT_PATH, 'utf8');
const cii = parseCiiOutput(xmlText);
for (const label of ['OPE', 'SUS', 'EXP']) {
  assert.ok(cii.displacement.has(label));
  assert.ok(cii.restraint.has(label));
  assert.ok(cii.globalForce.has(label));
  assert.equal(cii.displacement.get(label).size, 20);
  assert.equal(cii.globalForce.get(label).size, 19);
}
assert.equal(cii.restraint.get('SUS').size, 10);

const comparison = buildBm1CiiComparison();
assert.equal(comparison.schema, 'lfea-bm1-cii-output-comparison/v2');
for (const label of ['OPE', 'SUS', 'EXP']) {
  const section = comparison.cases[label];
  assert.equal(section.displacement.matched.length, 20, `${label} displacement matched count`);
  assert.deepEqual(section.displacement.unmatchedCiiNodes, []);
  assert.equal(section.restraint.matched.length, 10, `${label} restraint matched count`);
  assert.deepEqual(section.restraint.unmatchedCiiNodes, []);
  assert.equal(section.globalForce.matched.length, 19, `${label} global force matched count`);
  assert.deepEqual(section.globalForce.unmatchedPairKeys, []);
}

const sus = comparison.cases.SUS;
const total = (rows, dof) => rows.reduce((sum, row) => sum + row[dof].ours, 0);
const totalCii = (rows, dof) => rows.reduce((sum, row) => sum + row[dof].cii, 0);
const ourTotalUY = total(sus.restraint.matched, 'UY');
const ciiTotalUY = totalCii(sus.restraint.matched, 'UY');
const totalUYDeviationPercent = ((ourTotalUY - ciiTotalUY) / ciiTotalUY) * 100;
assert.ok(Math.abs(totalUYDeviationPercent) < 3, `SUS total vertical reaction deviation ${totalUYDeviationPercent.toFixed(3)}% exceeds 3%`);
const node45Reaction = sus.restraint.matched.find((row) => row.nodeId === '45');
assert.ok(Math.abs(node45Reaction.UY.percentDifference) < 15);
const node30Displacement = sus.displacement.matched.find((row) => row.nodeId === '30');
assert.ok(Math.abs(node30Displacement.UY.absoluteDifference) < 1e-5);

const exp = comparison.cases.EXP;
const ourExpTotalUY = total(exp.restraint.matched, 'UY');
const ciiExpTotalUY = totalCii(exp.restraint.matched, 'UY');
assert.ok(Math.abs(ourExpTotalUY) < 1);
assert.ok(Math.abs(ciiExpTotalUY) < 1);
assert.equal(comparison.limitations.length, 3);

mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
writeFileSync(fileURLToPath(new URL('../reports/lfea-bm1-cii-output-comparison.json', import.meta.url)), `${JSON.stringify(comparison, null, 2)}\n`);

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['check:lfea-bm1-cii-comparison'], 'node scripts/lfea-bm1-cii-output-comparison-check.mjs');
assert.ok(packageJson.scripts['check:lfea-linear-core'].includes('check:lfea-bm1-cii-comparison'));

console.log(`SUS total vertical reaction: ours ${ourTotalUY.toFixed(3)} N vs. real CAESAR ${ciiTotalUY.toFixed(3)} N (${totalUYDeviationPercent.toFixed(3)}% deviation)`);
console.log(`EXP total vertical reaction: ours ${ourExpTotalUY.toFixed(6)} N vs. real CAESAR ${ciiExpTotalUY.toFixed(6)} N`);
console.log('LFEA BM1 vs. real CAESAR II output comparison PASS');
