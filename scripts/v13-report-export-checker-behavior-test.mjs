#!/usr/bin/env node

import {
  evaluateReportIssueEligibility,
  createReportRevision,
  stableReportWorkflowHash,
  REPORT_ISSUE_STATUS,
  REPORT_ISSUE_TYPE,
} from '../src/reporting/reportIssueWorkflow.js';

import {
  sanitizeFilename,
  renderHtmlPrintCalculationSheet,
  createReportExportBundle,
} from '../src/reporting/reportExportUtils.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Running V13 behavior tests...\n');

// Test 1: Draft eligible when activeReportContext exists
test('Draft eligible when activeReportContext exists', () => {
  const activeReportContext = { title: 'Test', methodId: 'M1', result: { formulaIds: ['F1'] } };
  const result = evaluateReportIssueEligibility({ activeReportContext });
  assert(result.canSaveDraft === true, 'canSaveDraft should be true');
});

// Test 2: CHECKED with no checkedBy → blocker CHECKER_REQUIRED
test('CHECKED with no checkedBy → blocker CHECKER_REQUIRED', () => {
  const activeReportContext = { title: 'Test', methodId: 'M1', result: { formulaIds: ['F1'] } };
  const result = evaluateReportIssueEligibility({
    activeReportContext,
    targetStatus: REPORT_ISSUE_STATUS.CHECKED,
    reviewerChecker: {},
  });
  assert(result.blockers.some(b => b.code === 'CHECKER_REQUIRED'), 'Should have CHECKER_REQUIRED blocker');
});

// Test 3: SCREENING + FINAL_ISSUE → blocker SCREENING_LEVEL_NOT_FINAL
test('SCREENING + FINAL_ISSUE → blocker SCREENING_LEVEL_NOT_FINAL', () => {
  const result = evaluateReportIssueEligibility({
    activeReportContext: { title: 'Test', methodId: 'M1', result: { formulaIds: ['F1'], engineeringLevel: 'SCREENING' } },
    targetStatus: REPORT_ISSUE_STATUS.ISSUED,
    issueType: REPORT_ISSUE_TYPE.FINAL_ISSUE,
    reviewerChecker: { preparedBy: 'A', checkedBy: 'B', approvedBy: 'C' },
  });
  assert(result.blockers.some(b => b.code === 'SCREENING_LEVEL_NOT_FINAL'), 'Should have SCREENING_LEVEL_NOT_FINAL blocker');
});

// Test 4: resultsStale + ISSUED → blocker STALE_RESULTS
test('resultsStale + ISSUED → blocker STALE_RESULTS', () => {
  const result = evaluateReportIssueEligibility({
    activeReportContext: { title: 'Test', methodId: 'M1', result: { formulaIds: ['F1'] } },
    resultsStale: true,
    targetStatus: REPORT_ISSUE_STATUS.ISSUED,
    reviewerChecker: { preparedBy: 'A', checkedBy: 'B', approvedBy: 'C' },
  });
  assert(result.blockers.some(b => b.code === 'STALE_RESULTS'), 'Should have STALE_RESULTS blocker');
});

// Test 5: DATA_NOT_QUALIFIED blocks
test('DATA_NOT_QUALIFIED blocks', () => {
  const result = evaluateReportIssueEligibility({
    activeReportContext: { title: 'Test', methodId: 'M1', result: { formulaIds: ['F1'], dataStatus: 'MISSING_DATA' } },
    targetStatus: REPORT_ISSUE_STATUS.ISSUED,
    reviewerChecker: { preparedBy: 'A', checkedBy: 'B', approvedBy: 'C' },
  });
  assert(result.blockers.some(b => b.code === 'DATA_NOT_QUALIFIED'), 'Should have DATA_NOT_QUALIFIED blocker');
});

// Test 6: Clean SCREENING_ISSUE → canIssue true, blockers.length 0
test('Clean SCREENING_ISSUE: canIssue true, blockers.length 0', () => {
  const result = evaluateReportIssueEligibility({
    activeReportContext: {
      title: 'Test',
      methodId: 'M1',
      result: {
        formulaIds: ['F1'],
        status: 'PASSED',
        dataStatus: 'PASSED',
        engineeringLevel: 'BENCHMARKED_SCREENING',
      },
    },
    reportPayload: { status: 'PASSED' },
    targetStatus: REPORT_ISSUE_STATUS.ISSUED,
    issueType: REPORT_ISSUE_TYPE.SCREENING_ISSUE,
    reviewerChecker: { preparedBy: 'A', checkedBy: 'B', approvedBy: 'C' },
  });
  assert(result.canIssue === true, 'canIssue should be true');
  assert(result.blockers.length === 0, `blockers should be empty, got ${result.blockers.map(b => b.code).join(', ')}`);
});

// Test 7: renderHtmlPrintCalculationSheet includes '<!doctype html>' and methodId
test('renderHtmlPrintCalculationSheet includes doctype and methodId', () => {
  const report = { title: 'Test', methodId: 'M1', status: 'PASSED', module: 'mod1' };
  const html = renderHtmlPrintCalculationSheet(report, 'test markdown');
  assert(html.includes('<!doctype html>'), 'Should include doctype');
  assert(html.includes('M1'), 'Should include methodId');
});

// Test 8: createReportRevision: revisionId starts with 'rpt-', issueStatus preserved
test('createReportRevision: revisionId starts rpt-, issueStatus preserved', () => {
  const revision = createReportRevision({
    activeReportContext: { title: 'Test', methodId: 'M1', result: { formulaIds: ['F1'] } },
    issueStatus: REPORT_ISSUE_STATUS.CHECKED,
    reviewerChecker: { checkedBy: 'Checker A' },
    sequence: 1,
  });
  assert(revision.revisionId.startsWith('rpt-'), `revisionId should start with rpt-, got ${revision.revisionId}`);
  assert(revision.issueStatus === REPORT_ISSUE_STATUS.CHECKED, 'issueStatus should be CHECKED');
});

// Test 9: createReportExportBundle: markdown .md, json .json, html .html
test('createReportExportBundle: filenames have correct extensions', () => {
  const bundle = createReportExportBundle({
    report: { title: 'Test Report', methodId: 'M1' },
    markdown: '# Test',
    jsonSnapshot: {},
    revision: { sequence: 1 },
  });
  assert(bundle.markdown.filename.endsWith('.md'), 'markdown filename should end with .md');
  assert(bundle.json.filename.endsWith('.json'), 'json filename should end with .json');
  assert(bundle.html.filename.endsWith('.html'), 'html filename should end with .html');
});

// Test 10: sanitizeFilename: 'A/B:C Report' → 'A-B-C-Report'
test('sanitizeFilename: A/B:C Report → A-B-C-Report', () => {
  const result = sanitizeFilename('A/B:C Report');
  assert(result === 'A-B-C-Report', `Expected 'A-B-C-Report', got '${result}'`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
