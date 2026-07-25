import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const benchmarkPath = path.join(root, 'reports', 'benchmark-results.json');
const baselineDocPath = path.join(root, 'AUDIT_CURRENT_BASELINE.md');

function fail(message) {
  console.error(`U0 CERTIFICATION FAIL: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Unable to read JSON ${path.relative(root, filePath)}: ${error.message}`);
  }
}

if (!fs.existsSync(baselineDocPath)) {
  fail('AUDIT_CURRENT_BASELINE.md is missing.');
}

if (!fs.existsSync(benchmarkPath)) {
  fail('reports/benchmark-results.json is missing. Run npm run check:benchmarks first.');
}

const report = readJson(benchmarkPath);
const summary = report.summary || {};
const required = {
  total: 37,
  passed: 37,
  failed: 0,
  pending: 0,
  maxRoundedNumericError: 0
};

for (const [key, expected] of Object.entries(required)) {
  if (summary[key] !== expected) {
    fail(`Benchmark summary.${key} expected ${expected}, got ${summary[key]}.`);
  }
}

if (summary.invalidFixtures !== 0) {
  fail(`Expected invalidFixtures=0, got ${summary.invalidFixtures}.`);
}
if (summary.unreadableFixtures !== 0) {
  fail(`Expected unreadableFixtures=0, got ${summary.unreadableFixtures}.`);
}

const failedCases = (report.caseResults || []).filter((item) => item.status !== 'PASSED');
if (failedCases.length) {
  fail(`Non-passed benchmark cases found: ${failedCases.map((item) => item.caseId).join(', ')}`);
}

const requiredCases = [
  'EXT-GLOBAL-001',
  'EXT-FLANG-001',
  'EXT-MIST-001',
  'EXT-SHORT-DROP-001',
  'EXT-SHORT-DROP-002',
  'GC3D-COMBINE-001',
  'UI-MOCK-CARDS-001',
  'UI-MOCK-LOAD-001',
  'RPT-002'
];
const caseIds = new Set((report.caseResults || []).map((item) => item.caseId));
for (const caseId of requiredCases) {
  if (!caseIds.has(caseId)) fail(`Required U0 benchmark case missing: ${caseId}`);
}

console.log('U0 certification check passed: baseline audit document exists and recorded engineering benchmarks are green.');
