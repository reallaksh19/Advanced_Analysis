import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AnalyzeController } from '../src/analyze/analyze-controller.js';

const ROOT = path.resolve('src');
const LEGACY_DEFINITION = path.normalize('src/core/linear-piping-analysis-consumer/generic-inputxml-solve.js');

test('PF-25 repository public call sites cannot bypass governed InputXML authorization', () => {
  assert.equal(typeof AnalyzeController, 'function');
  const violations = [];
  for (const absolutePath of sourceFiles(ROOT)) {
    const relativePath = path.normalize(path.relative(process.cwd(), absolutePath));
    if (relativePath === LEGACY_DEFINITION) continue;
    const source = fs.readFileSync(absolutePath, 'utf8');
    if (source.includes('solveInputXmlGeneric')) {
      violations.push(`${relativePath}: references solveInputXmlGeneric`);
    }
    if (source.includes('linear-piping-analysis-consumer/generic-inputxml-solve.js')) {
      violations.push(`${relativePath}: imports the retired raw-solve module`);
    }
  }
  assert.deepEqual(violations, []);

  const controllerPath = path.resolve('src/analyze/analyze-controller.js');
  const controller = fs.readFileSync(controllerPath, 'utf8');
  assert.match(controller, /PREFEA_AUTHORIZATION_REQUIRED/);
  assert.match(controller, /diagnostics-only/);
  assert.match(controller, /replaceResultantsWithAuthorizationNotice/);
  assert.doesNotMatch(controller, /runSolve\s*\(/);
  assert.doesNotMatch(controller, /solveInputXmlGeneric/);
});

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(absolutePath));
    } else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}
