#!/usr/bin/env node

/**
 * Static T0 authority guard.
 *
 * The consumer may orchestrate qualified packages but may not become a second
 * mechanics, interface, code, workspace, or empirical-reaction authority.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-piping-analysis-consumer');
const files = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(ROOT, name));

const forbidden = [
  ['WORKSPACE_IMPORT', /from\s+['"][^'"]*workspace/u],
  ['EMPIRICAL_REACTION', /tributary|percentageOfWeight|reactionFactor|0\.6\s*\*/u],
  ['INTERFACE_MECHANICS_PREMATURE', /momentAtReference|offsetMoment|nozzleUtilization/u],
  ['SOLVER_REIMPLEMENTATION', /assembleGlobal|factorizeFree|solveScaled|stiffnessMatrix/u],
  ['RANDOM_IDENTITY', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
  ['HIDDEN_DEFAULT_PARAMETER', /function\s+\w+\s*\([^)]*=/u],
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines < 300, `${file} has ${lines} physical lines; limit is <300`);
  forbidden.forEach(([code, pattern]) => {
    assert.doesNotMatch(source, pattern, `${code}: ${file}`);
  });
}

const consumer = fs.readFileSync(path.join(ROOT, 'consumer.js'), 'utf8');
assert.match(consumer, /compileSolverExecution/u);
assert.match(consumer, /compileResultRecovery/u);
assert.match(consumer, /interfaceLoadResults:\s*null/u);
assert.match(consumer, /nozzleAssessments:\s*null/u);
assert.match(consumer, /codeResults:\s*null/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:linear-piping-analysis-consumer'],
  'node scripts/linear-piping-analysis-consumer-check.mjs && node scripts/linear-piping-analysis-consumer-anti-drift-check.mjs',
);
assert.match(packageValue.scripts.gate, /check:linear-piping-analysis-consumer/u);

console.log('Linear piping analysis consumer T0 anti-drift check PASS');
