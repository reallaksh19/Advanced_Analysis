#!/usr/bin/env node

/**
 * V10 Engineering Data Migration - Static Checks
 * Verifies required functions are present and unsafe code is removed.
 */

import fs from 'fs';
import path from 'path';

const checks = [];
let passed = 0;
let failed = 0;

function check(name, condition, details = '') {
  checks.push({ name, condition, details });
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

// Check resolveEngineeringData.js
const engineeringDataPath = new URL('../src/core/engineering-data/resolveEngineeringData.js', import.meta.url).pathname;
const engineeringDataContent = fs.readFileSync(engineeringDataPath, 'utf8');

check(
  'resolveEngineeringData.js contains INCH_TO_MM',
  engineeringDataContent.includes('INCH_TO_MM')
);

check(
  'resolveEngineeringData.js contains normalizePipeValue function',
  engineeringDataContent.includes('function normalizePipeValue')
);

check(
  'resolveEngineeringData.js exports INCH_TO_MM',
  engineeringDataContent.includes('export const INCH_TO_MM')
);

check(
  'resolveEngineeringData.js resolvePipeSection calls normalizePipeValue',
  engineeringDataContent.includes('normalizePipeValue(result.value)')
);

// Check pipeSchedules.js
const pipeSchedulesPath = new URL('../src/core/geometry/pipeSchedules.js', import.meta.url).pathname;
const pipeSchedulesContent = fs.readFileSync(pipeSchedulesPath, 'utf8');

check(
  'pipeSchedules.js imports resolvePipeSection',
  pipeSchedulesContent.includes('import') && pipeSchedulesContent.includes('resolvePipeSection')
);

check(
  'pipeSchedules.js imports DATA_STATUS',
  pipeSchedulesContent.includes('DATA_STATUS')
);

check(
  'pipeSchedules.js contains resolvePipeDimensions export',
  pipeSchedulesContent.includes('export function resolvePipeDimensions')
);

check(
  'pipeSchedules.js contains DN_TO_NPS mapping',
  pipeSchedulesContent.includes('const DN_TO_NPS')
);

check(
  'pipeSchedules.js DN_TO_NPS has 200: 8 mapping',
  pipeSchedulesContent.includes('200: 8')
);

check(
  'pipeSchedules.js DOES NOT contain unsafe fallback "const od = boreMm"',
  !pipeSchedulesContent.includes('const od = boreMm')
);

check(
  'pipeSchedules.js DOES NOT contain unsafe "const wt = boreMm * 0.065"',
  !pipeSchedulesContent.includes('const wt = boreMm * 0.065')
);

check(
  'pipeSchedules.js getPipeDimensions calls resolvePipeDimensions',
  pipeSchedulesContent.includes('return resolvePipeDimensions(boreMm, schedule)')
);

check(
  'pipeSchedules.js getAvailableSchedules returns [] for unknown bore',
  pipeSchedulesContent.includes('return [];') && pipeSchedulesContent.includes('getAvailableSchedules')
);

// Check buildReportPayload.js
const buildReportPayloadPath = new URL('../src/reporting/buildReportPayload.js', import.meta.url).pathname;
const buildReportPayloadContent = fs.readFileSync(buildReportPayloadPath, 'utf8');

check(
  'buildReportPayload.js contains engineeringDataSource',
  buildReportPayloadContent.includes('engineeringDataSource')
);

// Check publishActiveReportContext.js
const publishActiveReportContextPath = new URL('../src/reporting/publishActiveReportContext.js', import.meta.url).pathname;
const publishActiveReportContextContent = fs.readFileSync(publishActiveReportContextPath, 'utf8');

check(
  'publishActiveReportContext.js includes dataStatus in context',
  publishActiveReportContextContent.includes('dataStatus: result?.dataStatus')
);

check(
  'publishActiveReportContext.js includes engineeringDataSource in context',
  publishActiveReportContextContent.includes('engineeringDataSource: result?.engineeringDataSource')
);

// Summary
console.log('\n' + '='.repeat(60));
console.log(`Static Checks: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
