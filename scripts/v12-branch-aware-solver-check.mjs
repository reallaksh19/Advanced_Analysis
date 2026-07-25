#!/usr/bin/env node

/**
 * V12 Static Verification Script
 * Checks that required exports and structures are present in V12 files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const errors = [];

function checkFile(filePath, checks) {
  if (!fs.existsSync(filePath)) {
    errors.push(`File not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  checks.forEach(({ pattern, name }) => {
    if (!pattern.test(content)) {
      errors.push(`Missing export/pattern in ${filePath}: ${name}`);
    }
  });
}

// Check classifySolverTopology.js
checkFile(path.join(root, 'src/core/solvers/routing/classifySolverTopology.js'), [
  { pattern: /export\s+const\s+SOLVER_TOPOLOGY_TYPE/, name: 'SOLVER_TOPOLOGY_TYPE export' },
  { pattern: /export\s+function\s+classifySolverTopology/, name: 'classifySolverTopology function' },
  { pattern: /export\s+const\s+SOLVER_TOPOLOGY_SCHEMA_VERSION/, name: 'SOLVER_TOPOLOGY_SCHEMA_VERSION export' },
]);

// Check solveBranchScreening.js
checkFile(path.join(root, 'src/core/solvers/branch/solveBranchScreening.js'), [
  { pattern: /export\s+function\s+solveBranchScreening/, name: 'solveBranchScreening function' },
  { pattern: /export\s+const\s+BRANCH_SCREENING_SCHEMA_VERSION/, name: 'BRANCH_SCREENING_SCHEMA_VERSION export' },
]);

// Check solveByTopologyRouter.js
checkFile(path.join(root, 'src/core/solvers/routing/solveByTopologyRouter.js'), [
  { pattern: /export\s+(async\s+)?function\s+solveByTopologyRouter/, name: 'solveByTopologyRouter function' },
  { pattern: /export\s+const\s+SOLVER_ROUTER_SCHEMA_VERSION/, name: 'SOLVER_ROUTER_SCHEMA_VERSION export' },
]);

// Check GC3D solver has routingHint
checkFile(path.join(root, 'src/solvers/3d/solveGC3D.js'), [
  { pattern: /routingHint/, name: 'routingHint field in GC3D rejection' },
  { pattern: /recommendedRouter/, name: 'recommendedRouter in routing hint' },
  { pattern: /branchSolver/, name: 'branchSolver in routing hint' },
]);

if (errors.length > 0) {
  console.error('V12 Static Verification FAILED:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log('V12 Static Verification PASSED');
process.exit(0);
