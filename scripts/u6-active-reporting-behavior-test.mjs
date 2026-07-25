import { buildReportPayload } from '../src/reporting/buildReportPayload.js';

const tests = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    tests.push(true);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    tests.push(false);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Got: ${actual}`);
  }
}

function assertIncludes(arr, item, message) {
  if (!arr.includes(item)) {
    throw new Error(`${message}\n  Array does not include ${item}`);
  }
}

// Test 1: buildReportPayload with null context
test('buildReportPayload(null, false) returns default title', () => {
  const payload = buildReportPayload(null, false);
  assertEqual(payload.title, 'Engineering Calculation Sheet', 'Title should be default when context is null');
});

// Test 2: buildReportPayload with custom context
test('buildReportPayload with custom context preserves methodId and status', () => {
  const context = {
    title: 'Test',
    methodId: 'M1',
    result: {
      status: 'PASSED',
      formulaIds: ['F1'],
    },
  };
  const payload = buildReportPayload(context, false);
  assertEqual(payload.methodId, 'M1', 'methodId should be preserved');
  assertEqual(payload.status, 'PASSED', 'status should be PASSED');
  assertEqual(payload.formulaIds[0], 'F1', 'formulaIds should be preserved');
});

// Test 3: buildReportPayload with stale results
test('buildReportPayload with resultsStale=true sets status to SCREENING_ONLY', () => {
  const context = {
    result: {
      status: 'PASSED',
    },
  };
  const payload = buildReportPayload(context, true);
  assertEqual(payload.status, 'SCREENING_ONLY', 'Status should be SCREENING_ONLY when stale');
});

test('buildReportPayload with resultsStale=true adds STALE_RESULTS warning', () => {
  const context = {
    result: {
      status: 'PASSED',
    },
  };
  const payload = buildReportPayload(context, true);
  const hasStaleWarning = payload.warnings.some(w => w.code === 'STALE_RESULTS');
  if (!hasStaleWarning) {
    throw new Error('STALE_RESULTS warning not found in warnings array');
  }
});

const passed = tests.filter(t => t).length;
const total = tests.length;

console.log(`\n${passed}/${total} tests passed.`);
process.exit(passed === total ? 0 : 1);
