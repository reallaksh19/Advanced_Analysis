#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const errors = [];

// Check 1: Verify solverResultContract.js exists and has required exports
const contractPath = path.join(repoRoot, 'src/core/solvers/certification/solverResultContract.js');
console.log(`[U5] Checking solver result contract at ${contractPath}...`);

if (!fs.existsSync(contractPath)) {
  errors.push(`solverResultContract.js not found at ${contractPath}`);
} else {
  const contractContent = fs.readFileSync(contractPath, 'utf8');
  const requiredExports = [
    'SOLVER_RESULT_SCHEMA_VERSION',
    'ENGINEERING_LEVEL',
    'createSolverResultContract',
    'validateSolverResultContract',
    'unwrapSolverResults',
  ];

  for (const exp of requiredExports) {
    if (!contractContent.includes(`export ${exp.startsWith('SOLVER') || exp.startsWith('ENGINEERING') ? 'const' : 'function'}`)) {
      if (!contractContent.includes(`export { ${exp}`) && !contractContent.includes(`export const ${exp}`) && !contractContent.includes(`export function ${exp}`)) {
        errors.push(`solverResultContract.js missing export: ${exp}`);
      }
    }
  }

  // Check for schema version string
  if (!contractContent.includes('solver-result-contract-v1')) {
    errors.push('solverResultContract.js missing schema version string');
  }
}

// Check 2: Verify Simplified 2D solver file
const simplifiedSolverPath = path.join(repoRoot, 'src/core/solvers/simplified2d/solveSimplified2D.js');
console.log(`[U5] Checking Simplified 2D solver at ${simplifiedSolverPath}...`);

if (!fs.existsSync(simplifiedSolverPath)) {
  errors.push(`Simplified 2D solver not found at ${simplifiedSolverPath}`);
} else {
  const solverContent = fs.readFileSync(simplifiedSolverPath, 'utf8');
  if (!solverContent.includes('solver-result-contract-v1')) {
    errors.push('Simplified 2D solver does not contain solver-result-contract-v1 marker (not updated)');
  }
}

// Report
if (errors.length === 0) {
  console.log('[U5] ✓ All checks passed');
  process.exit(0);
} else {
  console.error('[U5] ✗ Checks failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}
