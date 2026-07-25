#!/usr/bin/env node

/**
 * V10 Engineering Data Migration - Behavior Tests
 * Tests functional behavior of pipe/material resolution.
 */

import {
  resolvePipeSection,
  resolveMaterialAtTemperature,
  DATA_STATUS,
} from '../src/core/engineering-data/resolveEngineeringData.js';

import {
  resolvePipeDimensions,
  getPipeDimensions,
} from '../src/core/geometry/pipeSchedules.js';

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

// Test 1: resolvePipeSection for known pipe
test('resolvePipeSection({ nps: 8, schedule: "40" }) returns PASSED', () => {
  const result = resolvePipeSection({ nps: 8, schedule: '40' });
  if (result.status !== DATA_STATUS.PASSED) {
    throw new Error(`Expected PASSED, got ${result.status}`);
  }
});

// Test 2: Resolved pipe exposes od_mm and wt_mm
test('Resolved pipe exposes od_mm and wt_mm', () => {
  const result = resolvePipeSection({ nps: 8, schedule: '40' });
  if (!Number.isFinite(result.value?.od_mm)) {
    throw new Error(`od_mm not finite: ${result.value?.od_mm}`);
  }
  if (!Number.isFinite(result.value?.wt_mm)) {
    throw new Error(`wt_mm not finite: ${result.value?.wt_mm}`);
  }
});

// Test 3: Resolved pipe exposes od_in and wt_in
test('Resolved pipe exposes od_in and wt_in', () => {
  const result = resolvePipeSection({ nps: 8, schedule: '40' });
  if (!Number.isFinite(result.value?.od_in)) {
    throw new Error(`od_in not finite: ${result.value?.od_in}`);
  }
  if (!Number.isFinite(result.value?.wt_in)) {
    throw new Error(`wt_in not finite: ${result.value?.wt_in}`);
  }
});

// Test 4: Material resolution
test('resolveMaterialAtTemperature({ materialId: "Carbon Steel", temperature_F: 300 }) returns PASSED', () => {
  const result = resolveMaterialAtTemperature({ materialId: 'Carbon Steel', temperature_F: 300 });
  if (result.status !== DATA_STATUS.PASSED) {
    throw new Error(`Expected PASSED, got ${result.status}`);
  }
});

// Test 5: Material exposes E_psi
test('Resolved material exposes E_psi', () => {
  const result = resolveMaterialAtTemperature({ materialId: 'Carbon Steel', temperature_F: 300 });
  if (!Number.isFinite(result.value?.E_psi)) {
    throw new Error(`E_psi not finite: ${result.value?.E_psi}`);
  }
});

// Test 6: Material exposes alpha_in_in_F
test('Resolved material exposes alpha_in_in_F', () => {
  const result = resolveMaterialAtTemperature({ materialId: 'Carbon Steel', temperature_F: 300 });
  if (!Number.isFinite(result.value?.alpha_in_in_F)) {
    throw new Error(`alpha_in_in_F not finite: ${result.value?.alpha_in_in_F}`);
  }
});

// Test 7: resolvePipeDimensions with DN 200 (maps to NPS 8)
test('resolvePipeDimensions(200, "40") maps DN 200 to NPS 8 and returns PASSED', () => {
  const result = resolvePipeDimensions(200, '40');
  if (result.status !== DATA_STATUS.PASSED) {
    throw new Error(`Expected PASSED, got ${result.status}`);
  }
  if (result.nps !== 8) {
    throw new Error(`Expected nps 8, got ${result.nps}`);
  }
});

// Test 8: resolvePipeDimensions returns od and wt in mm
test('resolvePipeDimensions returns od and wt in millimeters', () => {
  const result = resolvePipeDimensions(200, '40');
  if (!Number.isFinite(result.od)) {
    throw new Error(`od not finite: ${result.od}`);
  }
  if (!Number.isFinite(result.wt)) {
    throw new Error(`wt not finite: ${result.wt}`);
  }
  // For NPS 8: od_in ≈ 8.625, so od_mm ≈ 219.1
  if (result.od < 200 || result.od > 230) {
    throw new Error(`od_mm out of expected range (200-230): ${result.od}`);
  }
});

// Test 9: getPipeDimensions with unknown DN
test('getPipeDimensions(123, "40") returns MISSING_DATA for unmapped DN', () => {
  const result = getPipeDimensions(123, '40');
  if (result.status !== DATA_STATUS.MISSING_DATA) {
    throw new Error(`Expected MISSING_DATA, got ${result.status}`);
  }
});

// Test 10: Unknown DN must not invent OD or WT
test('Unknown DN does not invent od/wt values', () => {
  const result = getPipeDimensions(123, '40');
  if (result.od !== null) {
    throw new Error(`Expected od=null for unknown DN, got ${result.od}`);
  }
  if (result.wt !== null) {
    throw new Error(`Expected wt=null for unknown DN, got ${result.wt}`);
  }
});

// Test 11: Unknown DN includes diagnostic
test('Unknown DN includes DN_TO_NPS_MISSING diagnostic', () => {
  const result = getPipeDimensions(123, '40');
  const hasdiag = result.diagnostics?.some(d => d.code === 'DN_TO_NPS_MISSING');
  if (!hasdiag) {
    throw new Error(`Expected DN_TO_NPS_MISSING diagnostic, got ${JSON.stringify(result.diagnostics)}`);
  }
});

// Test 12: resolvePipeDimensions exact flag
test('resolvePipeDimensions(200, "40") sets exact=true for PASSED', () => {
  const result = resolvePipeDimensions(200, '40');
  if (result.exact !== true) {
    throw new Error(`Expected exact=true for PASSED status, got ${result.exact}`);
  }
});

// Test 13: Missing data has exact=false
test('resolvePipeDimensions(999, "40") sets exact=false for MISSING_DATA', () => {
  const result = resolvePipeDimensions(999, '40');
  if (result.exact !== false) {
    throw new Error(`Expected exact=false for MISSING_DATA status, got ${result.exact}`);
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`Behavior Tests: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
