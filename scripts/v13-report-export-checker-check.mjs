#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

let passed = true;

const checks = [
  {
    name: 'reportIssueWorkflow.js exports',
    test: () => {
      const filePath = './src/reporting/reportIssueWorkflow.js';
      const content = fs.readFileSync(filePath, 'utf-8');
      const required = [
        'REPORT_ISSUE_STATUS',
        'REPORT_ISSUE_TYPE',
        'evaluateReportIssueEligibility',
        'createReportRevision',
        'stableReportWorkflowHash'
      ];
      const missing = required.filter(exp => !content.includes(`export ${exp.startsWith('REPORT') ? 'const ' : 'function '}${exp}`));
      if (missing.length > 0) {
        console.error(`  FAIL: Missing exports: ${missing.join(', ')}`);
        return false;
      }
      console.log(`  PASS: All exports present`);
      return true;
    }
  },
  {
    name: 'reportExportUtils.js exports',
    test: () => {
      const filePath = './src/reporting/reportExportUtils.js';
      const content = fs.readFileSync(filePath, 'utf-8');
      const required = [
        'sanitizeFilename',
        'renderHtmlPrintCalculationSheet',
        'makeDownloadableTextFile',
        'createReportExportBundle'
      ];
      const missing = required.filter(exp => !content.includes(`export function ${exp}`));
      if (missing.length > 0) {
        console.error(`  FAIL: Missing exports: ${missing.join(', ')}`);
        return false;
      }
      console.log(`  PASS: All exports present`);
      return true;
    }
  },
  {
    name: 'appStore.js contains reportReviewState',
    test: () => {
      const filePath = './src/store/appStore.js';
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes('reportReviewState')) {
        console.error(`  FAIL: reportReviewState not found`);
        return false;
      }
      if (!content.includes('saveReportRevision')) {
        console.error(`  FAIL: saveReportRevision not found`);
        return false;
      }
      console.log(`  PASS: reportReviewState and saveReportRevision present`);
      return true;
    }
  },
  {
    name: 'ReportsTab.jsx contains checker workflow',
    test: () => {
      const filePath = './src/reporting/ReportsTab.jsx';
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes('report-checker-workflow') && !content.includes('report-prepared-by')) {
        console.error(`  FAIL: Checker workflow testid not found`);
        return false;
      }
      console.log(`  PASS: Checker workflow UI present`);
      return true;
    }
  }
];

console.log('Running V13 static checks...\n');

for (const check of checks) {
  console.log(`${check.name}:`);
  try {
    if (!check.test()) {
      passed = false;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    passed = false;
  }
  console.log();
}

process.exit(passed ? 0 : 1);
