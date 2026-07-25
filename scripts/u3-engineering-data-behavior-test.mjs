#!/usr/bin/env node

/**
 * Phase U3 Engineering Data Behavior Tests
 * Validates critical data resolution paths.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

import {
  DATA_STATUS,
  resolvePipeSection,
  resolveMaterialAtTemperature,
  resolveEngineeringDataForCalculation,
} from '../src/core/engineering-data/resolveEngineeringData.js';

let passCount = 0;
let failCount = 0;

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`✓ ${message}`);
    passCount++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Got: ${actual}`);
    failCount++;
  }
}

function main() {
  console.log('\n=== Phase U3 Engineering Data Behavior Tests ===\n');

  console.log('--- Pipe Resolution Tests ---\n');

  // Test 1: Known pipe should return PASSED
  const knownPipe = resolvePipeSection({ nps: 8, schedule: '40' });
  assertEqual(knownPipe.status, DATA_STATUS.PASSED, 'Known pipe (8", Sch 40) returns PASSED');
  if (knownPipe.status === DATA_STATUS.PASSED) {
    assertEqual(knownPipe.isQualified, true, 'Known pipe is qualified');
    assertEqual(typeof knownPipe.value, 'object', 'Known pipe has value object');
  }

  // Test 2: Unknown pipe should return MISSING_DATA
  const unknownPipe = resolvePipeSection({ nps: 999, schedule: 'XXS' });
  assertEqual(unknownPipe.status, DATA_STATUS.MISSING_DATA, 'Unknown pipe (999", XXS) returns MISSING_DATA');
  assertEqual(unknownPipe.isQualified, false, 'Unknown pipe is not qualified');
  assertEqual(unknownPipe.value, null, 'Unknown pipe has no value');

  console.log('\n--- Material Resolution Tests ---\n');

  // Test 3: Known material at valid temperature should return PASSED
  const knownMaterial = resolveMaterialAtTemperature({
    materialId: 'Carbon Steel',
    temperature_F: 300,
  });
  assertEqual(knownMaterial.status, DATA_STATUS.PASSED, 'Known material (Carbon Steel, 300°F) returns PASSED');
  assertEqual(knownMaterial.isQualified, true, 'Known material is qualified');
  assertEqual(typeof knownMaterial.value, 'object', 'Known material has value object');

  // Test 4: Unknown material should return MISSING_DATA
  const unknownMaterial = resolveMaterialAtTemperature({
    materialId: 'Unobtanium',
    temperature_F: 300,
  });
  assertEqual(unknownMaterial.status, DATA_STATUS.MISSING_DATA, 'Unknown material (Unobtanium) returns MISSING_DATA');
  assertEqual(unknownMaterial.isQualified, false, 'Unknown material is not qualified');
  assertEqual(unknownMaterial.value, null, 'Unknown material has no value');

  console.log('\n--- Combined Resolution Tests ---\n');

  // Test 5: Combined resolution with known data should be fully qualified
  const fullyQualified = resolveEngineeringDataForCalculation({
    nps: 8,
    schedule: '40',
    materialId: 'Carbon Steel',
    temperature_F: 300,
  });
  assertEqual(fullyQualified.isFullyQualified, true, 'Combined resolution with known data is fully qualified');
  assertEqual(fullyQualified.pipe.status, DATA_STATUS.PASSED, 'Pipe part returns PASSED');
  assertEqual(fullyQualified.material.status, DATA_STATUS.PASSED, 'Material part returns PASSED');

  // Test 6: Combined resolution with unknown pipe should not be fully qualified
  const unknownPipeInCombined = resolveEngineeringDataForCalculation({
    nps: 999,
    schedule: 'XXS',
    materialId: 'Carbon Steel',
    temperature_F: 300,
  });
  assertEqual(unknownPipeInCombined.isFullyQualified, false, 'Combined resolution with unknown pipe is not fully qualified');
  assertEqual(unknownPipeInCombined.pipe.status, DATA_STATUS.MISSING_DATA, 'Pipe part returns MISSING_DATA');
  assertEqual(unknownPipeInCombined.material.status, DATA_STATUS.PASSED, 'Material part returns PASSED');

  // Test 7: Combined resolution with unknown material should not be fully qualified
  const unknownMaterialInCombined = resolveEngineeringDataForCalculation({
    nps: 8,
    schedule: '40',
    materialId: 'Unobtanium',
    temperature_F: 300,
  });
  assertEqual(unknownMaterialInCombined.isFullyQualified, false, 'Combined resolution with unknown material is not fully qualified');
  assertEqual(unknownMaterialInCombined.pipe.status, DATA_STATUS.PASSED, 'Pipe part returns PASSED');
  assertEqual(unknownMaterialInCombined.material.status, DATA_STATUS.MISSING_DATA, 'Material part returns MISSING_DATA');

  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    console.error(`\nBehavior tests FAILED`);
    process.exit(1);
  }

  console.log(`\nBehavior tests PASSED`);
  process.exit(0);
}

main();
