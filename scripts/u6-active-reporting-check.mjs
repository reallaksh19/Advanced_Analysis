import fs from 'fs';
import path from 'path';

const checks = [];

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    checks.push(true);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    checks.push(false);
  }
}

// Check 1: publishActiveReportContext.js exports
check('publishActiveReportContext.js exports publishActiveReportContext', () => {
  const file = fs.readFileSync('./src/reporting/publishActiveReportContext.js', 'utf8');
  if (!file.includes('export function publishActiveReportContext')) {
    throw new Error('publishActiveReportContext function not exported');
  }
});

check('publishActiveReportContext.js exports buildActiveReportContext', () => {
  const file = fs.readFileSync('./src/reporting/publishActiveReportContext.js', 'utf8');
  if (!file.includes('export function buildActiveReportContext')) {
    throw new Error('buildActiveReportContext function not exported');
  }
});

// Check 2: buildReportPayload.js exports
check('buildReportPayload.js exports buildReportPayload', () => {
  const file = fs.readFileSync('./src/reporting/buildReportPayload.js', 'utf8');
  if (!file.includes('export function buildReportPayload')) {
    throw new Error('buildReportPayload function not exported');
  }
});

// Check 3: appStore.js has activeReportContext
check('appStore.js contains activeReportContext state', () => {
  const file = fs.readFileSync('./src/store/appStore.js', 'utf8');
  if (!file.includes('activeReportContext')) {
    throw new Error('activeReportContext not found in appStore');
  }
});

check('appStore.js contains setActiveReportContext action', () => {
  const file = fs.readFileSync('./src/store/appStore.js', 'utf8');
  if (!file.includes('setActiveReportContext')) {
    throw new Error('setActiveReportContext action not found in appStore');
  }
});

check('appStore.js contains clearActiveReportContext action', () => {
  const file = fs.readFileSync('./src/store/appStore.js', 'utf8');
  if (!file.includes('clearActiveReportContext')) {
    throw new Error('clearActiveReportContext action not found in appStore');
  }
});

// Check 4: ReportsTab.jsx has no-active-report testid
check('ReportsTab.jsx contains no-active-report testid', () => {
  const file = fs.readFileSync('./src/reporting/ReportsTab.jsx', 'utf8');
  if (!file.includes('no-active-report')) {
    throw new Error('no-active-report testid not found in ReportsTab.jsx');
  }
});

const passed = checks.filter(c => c).length;
const total = checks.length;

console.log(`\n${passed}/${total} checks passed.`);
process.exit(passed === total ? 0 : 1);
