#!/usr/bin/env node

import {
  resolveElbowC2E,
  resolveTeeC2E,
  resolveOletBRLEN,
  resolveValveFaceToFace,
  resolveFlangeThickness,
  COMPONENT_DATA_STATUS,
} from '../src/core/component-data/resolveComponentDimensions.js';
import { evaluateReportIssueEligibility, REPORT_ISSUE_STATUS } from '../src/reporting/reportIssueWorkflow.js';

const tests = [];

function test(name, fn) {
  try {
    fn();
    tests.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    tests.push({ name, pass: false, error: e.message });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('\n=== V14 Component Master DB Behavior Tests ===\n');

console.log('Testing resolveElbowC2E...');
test('resolveElbowC2E({ nps: 8, dn: 200, schedule: "40" }) returns SCREENING_SAMPLE', () => {
  const result = resolveElbowC2E({ nps: 8, dn: 200, schedule: '40' });
  assert(result.status === COMPONENT_DATA_STATUS.SCREENING_SAMPLE, `status is ${result.status}, expected SCREENING_SAMPLE`);
  assert(result.value?.c2e_in === 12, `c2e_in is ${result.value?.c2e_in}, expected 12`);
  assert(result.diagnostics?.some(d => d.code === 'COMPONENT_DATA_SCREENING_SAMPLE'), 'has screening sample diagnostic');
});

test('resolveElbowC2E({ nps: 99, dn: 999, schedule: "40" }) returns MISSING_COMPONENT_DATA', () => {
  const result = resolveElbowC2E({ nps: 99, dn: 999, schedule: '40' });
  assert(result.status === COMPONENT_DATA_STATUS.MISSING_COMPONENT_DATA, `status is ${result.status}, expected MISSING_COMPONENT_DATA`);
  assert(result.isQualified === false, 'isQualified is false');
  assert(result.diagnostics?.some(d => d.code === 'MISSING_COMPONENT_DATA'), 'has missing component data diagnostic');
});

console.log('\nTesting resolveTeeC2E...');
test('resolveTeeC2E({ nps: 8, branchNps: 4, dn: 200, branchDn: 100, schedule: "40" }) returns SCREENING_SAMPLE', () => {
  const result = resolveTeeC2E({ nps: 8, branchNps: 4, dn: 200, branchDn: 100, schedule: '40' });
  assert(result.status === COMPONENT_DATA_STATUS.SCREENING_SAMPLE, `status is ${result.status}, expected SCREENING_SAMPLE`);
  assert(result.value?.branchC2E_in === 6, `branchC2E_in is ${result.value?.branchC2E_in}, expected 6`);
});

console.log('\nTesting resolveOletBRLEN...');
test('resolveOletBRLEN({ nps: 8, branchNps: 4, dn: 200, branchDn: 100, schedule: "40", rating: 300 }) returns SCREENING_SAMPLE', () => {
  const result = resolveOletBRLEN({ nps: 8, branchNps: 4, dn: 200, branchDn: 100, schedule: '40', rating: 300 });
  assert(result.status === COMPONENT_DATA_STATUS.SCREENING_SAMPLE, `status is ${result.status}, expected SCREENING_SAMPLE`);
  assert(result.value?.brlen_in === 6, `brlen_in is ${result.value?.brlen_in}, expected 6`);
});

console.log('\nTesting resolveValveFaceToFace...');
test('resolveValveFaceToFace({ nps: 8, dn: 200, rating: 300 }) returns SCREENING_SAMPLE', () => {
  const result = resolveValveFaceToFace({ nps: 8, dn: 200, rating: 300 });
  assert(result.status === COMPONENT_DATA_STATUS.SCREENING_SAMPLE, `status is ${result.status}, expected SCREENING_SAMPLE`);
  assert(result.value?.faceToFace_in === 15, `faceToFace_in is ${result.value?.faceToFace_in}, expected 15`);
});

console.log('\nTesting resolveFlangeThickness...');
test('resolveFlangeThickness({ nps: 8, dn: 200, rating: 300 }) returns SCREENING_SAMPLE', () => {
  const result = resolveFlangeThickness({ nps: 8, dn: 200, rating: 300 });
  assert(result.status === COMPONENT_DATA_STATUS.SCREENING_SAMPLE, `status is ${result.status}, expected SCREENING_SAMPLE`);
  assert(result.value?.thickness_in === 1.75, `thickness_in is ${result.value?.thickness_in}, expected 1.75`);
});

console.log('\nTesting issue blocking...');
test('evaluateReportIssueEligibility with componentDataStatus MISSING_COMPONENT_DATA and ISSUED blocks', () => {
  const result = evaluateReportIssueEligibility({
    activeReportContext: {
      moduleId: 'test',
      methodId: 'TEST_METHOD',
      result: {
        status: 'PASSED',
        formulaIds: ['TEST_FORMULA'],
        engineeringLevel: 'SCREENING',
      },
      componentDataStatus: { status: 'MISSING_COMPONENT_DATA' },
    },
    reportPayload: {},
    resultsStale: false,
    targetStatus: REPORT_ISSUE_STATUS.ISSUED,
    issueType: 'SCREENING_ISSUE',
    reviewerChecker: { preparedBy: 'A', checkedBy: 'B', approvedBy: 'C' },
  });
  assert(result.blockers?.some(b => b.code === 'COMPONENT_DATA_NOT_QUALIFIED'), `blockers should include COMPONENT_DATA_NOT_QUALIFIED, got: ${result.blockers?.map(b => b.code).join(',')}`);
});

console.log('\n=== Summary ===\n');
const passCount = tests.filter(t => t.pass).length;
const failCount = tests.filter(t => !t.pass).length;
console.log(`Passed: ${passCount}/${tests.length}`);
if (failCount > 0) {
  console.log(`Failed: ${failCount}/${tests.length}`);
  process.exit(1);
}
console.log('\nAll behavior tests passed!');
process.exit(0);
