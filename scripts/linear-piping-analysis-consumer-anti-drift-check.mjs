#!/usr/bin/env node

/**
 * Static T0 and Phase 2A authority guard.
 *
 * The consumer may orchestrate qualified packages but may not become a second
 * mechanics, interface, code, workspace, raw-import, or empirical-reaction
 * authority.
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
  ['RAW_IMPORT_AUTHORITY', /DOMParser|FileReader|parsePcf|parseInputXml|readFileSync\([^)]*source/u],
  ['EMPIRICAL_REACTION', /tributary|percentageOfWeight|reactionFactor|0\.6\s*\*/u],
  ['INTERFACE_MECHANICS_PREMATURE', /momentAtReference|offsetMoment|nozzleUtilization/u],
  ['SOLVER_REIMPLEMENTATION', /assembleGlobal|factorizeFree|solveScaled|stiffnessMatrix/u],
  ['MATERIAL_SECTION_AXIS_REIMPLEMENTATION', /interpolateMaterial|calculateSection|constructLocalAxes/u],
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

const sourceGateway = fs.readFileSync(path.join(ROOT, 'source-orchestration.js'), 'utf8');
assert.match(sourceGateway, /compileMechanicalModel/u);
assert.match(sourceGateway, /compilePhysicalLoadCase/u);
assert.match(sourceGateway, /modelReferenceFromCompilation/u);
assert.match(sourceGateway, /runLinearPipingAnalysis/u);
assert.match(sourceGateway, /PIPING_SOURCE_AUTHORITY_MISMATCH/u);
assert.doesNotMatch(sourceGateway, /compileSolverExecution|compileResultRecovery/u);
assert.doesNotMatch(sourceGateway, /interfaceLoadResults|nozzleAssessments|codeResults/u);

const index = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
assert.match(index, /runLinearPipingAnalysisFromSourceAuthorities/u);
assert.match(index, /validateLinearPipingSourceAnalysisRequest/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:linear-piping-analysis-consumer'],
  'node scripts/linear-piping-analysis-consumer-check.mjs && node scripts/linear-piping-analysis-consumer-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-core'], /check:linear-piping-analysis-consumer/u);
assert.match(packageValue.scripts.gate, /check:linear-piping-analysis-consumer/u);

await import('./linear-piping-source-orchestration-check.mjs');

console.log('Linear piping analysis consumer T0 and Phase 2A anti-drift check PASS');
