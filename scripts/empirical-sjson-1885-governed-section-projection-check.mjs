import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [evidencePath, projectedXmlPath] = process.argv.slice(2);
if (!evidencePath || !projectedXmlPath) {
  throw new Error('Usage: node empirical-sjson-1885-governed-section-projection-check.mjs <evidence.json> <projected.xml>');
}
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const projectedXml = await readFile(projectedXmlPath, 'utf8');
assert.equal(evidence.schema, 'empirical-sjson-governed-section-projection/v1');
assert.equal(evidence.method, 'COMMON_POS_SECTION_MATERIAL_V1');
assert.equal(evidence.rowCount, 163);
assert.equal(evidence.rows.length, 163);
assert.equal(evidence.scheduleDefaultApplicationCount, 0);
assert.equal((projectedXml.match(/<PIPINGELEMENT\b/g) || []).length, 163);
assert.ok(evidence.semanticIdentity);
assert.ok(evidence.posCalculationSemanticIdentity);

const scheduleCounts = countBy(evidence.rows, (row) => row.schedule);
assert.equal(scheduleCounts['80'], 137);
assert.equal(scheduleCounts['100'], 26);
const nps6Sch80 = evidence.rows.filter((row) => row.nps === 6 && row.schedule === '80');
assert.equal(nps6Sch80.length, 95);
for (const row of nps6Sch80) {
  close(row.effectiveOutsideDiameterMm, 168.275, 1e-6, `${row.positionRef} OD`);
  close(row.effectiveWallThicknessMm, 10.9728, 1e-6, `${row.positionRef} wall`);
}
assert.ok(evidence.changedWallThicknessCount > 0);
assert.equal(evidence.configuredDimensionApplicationCount, 57);
console.log('EMPIRICAL_SJSON_1885_GOVERNED_SECTION_PROJECTION_CHECK_OK');

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}; received ${actual}.`);
}
