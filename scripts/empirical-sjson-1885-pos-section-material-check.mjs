import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [receiptPath] = process.argv.slice(2);
if (!receiptPath) throw new Error('Receipt path is required.');
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const calculation = receipt.calculation;
assert.equal(receipt.schema, 'empirical-sjson-1885-pos-section-material-audit/v1');
assert.equal(calculation.blockedRowCount, 0);
assert.equal(calculation.resolvedRowCount, 163);
assert.equal(calculation.rows.length, 163);

const schedules = countBy(calculation.rows, (row) => row.schedule);
assert.equal(schedules['80'], 137);
assert.equal(schedules['100'], 26);
assert.equal(calculation.resolutionReceipt.configuredDefaultUsages
  .filter((row) => row.field === 'section.schedule').length, 0,
'No schedule may be supplied by configured default for the 1885S benchmark.');

const nps6Sch80 = calculation.rows.filter((row) => row.nps === 6 && row.schedule === '80');
assert.equal(nps6Sch80.length, 95);
for (const row of nps6Sch80) {
  assertClose(row.outsideDiameterMm, 168.275, 1e-6, `${row.posId} OD`);
  assertClose(row.wallThicknessMm, 10.9728, 1e-6, `${row.posId} wall`);
  assertClose(row.metalMassPerLengthKgM, 42.566877, 1e-5, `${row.posId} metal mass/m`);
}
for (const row of calculation.rows) {
  assert.equal(row.status, 'RESOLVED');
  assert.ok(row.sectionStates?.semanticIdentity, `${row.posId} section state identity missing.`);
  assert.ok(row.semanticIdentity, `${row.posId} POS identity missing.`);
}
assert.ok(calculation.resolutionReceipt.semanticIdentity);
assert.ok(calculation.semanticIdentity);
console.log('EMPIRICAL_SJSON_1885_POS_SECTION_MATERIAL_CHECK_OK');

function countBy(values, keyFn) {
  const result = {};
  for (const value of values) {
    const key = keyFn(value);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function assertClose(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label} must be finite.`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}; received ${actual}.`);
}
