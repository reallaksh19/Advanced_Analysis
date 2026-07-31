#!/usr/bin/env node

/**
 * Static T0 and Phase 2A-2C authority guard.
 *
 * Phase 2B may invoke the existing InputXML geometry adapter and B-1
 * conditioner. Phase 2C may retain validated compilation/load-case/result
 * objects. No consumer file may become a second engineering or mechanics
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
  ['UNCONTROLLED_RAW_IMPORT', /DOMParser|FileReader|parsePcf|readFileSync\([^)]*source/u],
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
assert.match(sourceGateway, /compileLinearPipingSourceAnalysisContext/u);
assert.match(sourceGateway, /sealLinearPipingSourceAnalysisContext/u);
assert.match(sourceGateway, /runLinearPipingAnalysis/u);
assert.match(sourceGateway, /PIPING_SOURCE_AUTHORITY_MISMATCH/u);
assert.doesNotMatch(sourceGateway, /compileSolverExecution|compileResultRecovery/u);
assert.doesNotMatch(sourceGateway, /interfaceLoadResults|nozzleAssessments|codeResults/u);

const contextContract = fs.readFileSync(path.join(ROOT, 'source-analysis-context.js'), 'utf8');
assert.match(contextContract, /linear-piping-source-analysis-context\/v1/u);
assert.match(contextContract, /requireMechanicalModelCompilation/u);
assert.match(contextContract, /requirePhysicalLoadCase/u);
assert.match(contextContract, /validateLinearPipingAnalysisResult/u);
assert.match(contextContract, /PIPING_SOURCE_CONTEXT_PARENT_MISMATCH/u);
assert.doesNotMatch(
  contextContract,
  /compileMechanicalModel|compilePhysicalLoadCase|compileSolverExecution|compileResultRecovery|recoverLinearPipingInterfaceLoads/u,
);

const inputXmlContract = fs.readFileSync(path.join(ROOT, 'inputxml-source-contract.js'), 'utf8');
assert.match(inputXmlContract, /linear-piping-inputxml-source\/v1/u);
assert.match(inputXmlContract, /computeInputXmlContentHash/u);
assert.match(inputXmlContract, /PIPING_INPUTXML_CONTENT_HASH_MISMATCH/u);
assert.doesNotMatch(inputXmlContract, /inputXmlToCanonicalGeometry|conditionGeometry/u);

const inputXmlGateway = fs.readFileSync(path.join(ROOT, 'inputxml-source-binding.js'), 'utf8');
assert.match(inputXmlGateway, /inputXmlToCanonicalGeometry/u);
assert.match(inputXmlGateway, /conditionGeometry/u);
assert.match(inputXmlGateway, /runLinearPipingAnalysisFromSourceAuthorities/u);
assert.match(inputXmlGateway, /PIPING_INPUTXML_TOPOLOGY_MISMATCH/u);
assert.match(inputXmlGateway, /CANONICAL_ANALYSIS_UNIT/u);
assert.doesNotMatch(
  inputXmlGateway,
  /resolveLinearFeaMaterialState|resolvePipeSection|resolveFrameLocalAxes|compileSolverExecution|compileResultRecovery|recoverLinearPipingInterfaceLoads|compileNozzleAllowableAssessment|compileLinearPipingB31Application/u,
);

const adapterImports = files
  .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }))
  .filter(({ source }) => /inputXmlToCanonicalGeometry/u.test(source))
  .map(({ file }) => path.basename(file));
assert.deepEqual(adapterImports, ['inputxml-source-binding.js']);

const index = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
assert.match(index, /runLinearPipingAnalysisFromSourceAuthorities/u);
assert.match(index, /compileLinearPipingSourceAnalysisContext/u);
assert.match(index, /requireLinearPipingSourceAnalysisContext/u);
assert.match(index, /runLinearPipingAnalysisFromInputXml/u);
assert.match(index, /sealLinearPipingInputXmlSource/u);
assert.match(index, /requireLinearPipingInputXmlAnalysisResult/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:linear-piping-analysis-consumer'],
  'node scripts/linear-piping-analysis-consumer-check.mjs && node scripts/linear-piping-analysis-consumer-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-core'], /check:linear-piping-analysis-consumer/u);
assert.match(packageValue.scripts.gate, /check:linear-piping-analysis-consumer/u);

await import('./linear-piping-source-orchestration-check.mjs');
await import('./linear-piping-inputxml-source-binding-check.mjs');
await import('./linear-piping-source-analysis-context-check.mjs');

console.log('Linear piping analysis consumer T0 and Phase 2A-2C anti-drift check PASS');
