#!/usr/bin/env node

/**
 * U4 Sketcher Topology Check
 * Verifies that required exports exist in topology modules and GraphTranslator
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

let passed = true;
const checks = [];

function check(name, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  checks.push({ name, status, details });
  if (!condition) passed = false;
}

try {
  // Check 1: validateSketchTopology.js exists and exports required functions
  const validatePath = `${rootDir}/src/sketcher/topology/validateSketchTopology.js`;
  if (fs.existsSync(validatePath)) {
    const content = fs.readFileSync(validatePath, 'utf-8');
    check('validateSketchTopology.js exists', true);
    check('exports SKETCH_TOPOLOGY_SCHEMA_VERSION', content.includes('export const SKETCH_TOPOLOGY_SCHEMA_VERSION'));
    check('exports buildConnectionIndex', content.includes('export function buildConnectionIndex'));
    check('exports validateSketchTopology', content.includes('export function validateSketchTopology'));
  } else {
    check('validateSketchTopology.js exists', false, 'File not found');
  }

  // Check 2: classifyTeeMainBranch.js exists and exports required function
  const classifyPath = `${rootDir}/src/sketcher/topology/classifyTeeMainBranch.js`;
  if (fs.existsSync(classifyPath)) {
    const content = fs.readFileSync(classifyPath, 'utf-8');
    check('classifyTeeMainBranch.js exists', true);
    check('exports classifyTeeMainBranch', content.includes('export function classifyTeeMainBranch'));
  } else {
    check('classifyTeeMainBranch.js exists', false, 'File not found');
  }

  // Check 3: GraphTranslator.js contains required constants and functions
  const translatorPath = `${rootDir}/src/sketcher/GraphTranslator.js`;
  if (fs.existsSync(translatorPath)) {
    const content = fs.readFileSync(translatorPath, 'utf-8');
    check('GraphTranslator.js exists', true);
    check('contains buildComponentsFromGraphWithDiagnostics', content.includes('buildComponentsFromGraphWithDiagnostics'));
    check('contains MAIN_SEGMENT_A reference', content.includes('MAIN_SEGMENT_A'));
    check('contains VECTOR_COLINEARITY reference', content.includes('VECTOR_COLINEARITY'));
  } else {
    check('GraphTranslator.js exists', false, 'File not found');
  }

} catch (err) {
  console.error('Error during checks:', err.message);
  passed = false;
}

// Print results
console.log('\n=== U4 SKETCHER TOPOLOGY CHECK ===\n');
checks.forEach(({ name, status, details }) => {
  const symbol = status === 'PASS' ? '✓' : '✗';
  console.log(`${symbol} ${status.padEnd(4)} ${name}${details ? ' — ' + details : ''}`);
});

console.log(`\n${passed ? 'All checks passed!' : 'Some checks failed.'}\n`);
process.exit(passed ? 0 : 1);
