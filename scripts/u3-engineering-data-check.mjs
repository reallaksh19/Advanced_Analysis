#!/usr/bin/env node

/**
 * Phase U3 Static Module Verification
 * Verifies that the engineering-data resolver exports all required symbols.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

const MODULE_PATH = join(projectRoot, 'src/core/engineering-data/resolveEngineeringData.js');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passCount++;
  } else {
    console.error(`✗ ${message}`);
    failCount++;
  }
}

async function main() {
  console.log('\n=== Phase U3 Engineering Data Module Check ===\n');

  try {
    const module = await import(`file://${MODULE_PATH}`);

    console.log(`Checking exports from: ${MODULE_PATH}\n`);

    assert(module.DATA_STATUS, 'DATA_STATUS exported');
    assert(typeof module.DATA_STATUS === 'object', 'DATA_STATUS is an object');

    if (module.DATA_STATUS) {
      const requiredStatuses = ['PASSED', 'MISSING_DATA', 'NOT_QUALIFIED', 'SCREENING_APPROXIMATION', 'USER_DEFINED'];
      for (const status of requiredStatuses) {
        assert(module.DATA_STATUS[status] === status, `DATA_STATUS.${status} = '${status}'`);
      }
    }

    assert(typeof module.resolvePipeSection === 'function', 'resolvePipeSection is a function');
    assert(typeof module.resolveMaterialAtTemperature === 'function', 'resolveMaterialAtTemperature is a function');
    assert(typeof module.resolveEngineeringDataForCalculation === 'function', 'resolveEngineeringDataForCalculation is a function');

    console.log(`\n=== Summary ===`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount > 0) {
      console.error(`\nModule verification FAILED`);
      process.exit(1);
    }

    console.log(`\nModule verification PASSED`);
    process.exit(0);
  } catch (error) {
    console.error(`\nFATAL: Failed to load module: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
