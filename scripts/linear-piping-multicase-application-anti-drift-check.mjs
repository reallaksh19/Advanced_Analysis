#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = path.join(ROOT, 'src/core/linear-piping-multicase-application');
const orchestrator = fs.readFileSync(path.join(PACKAGE, 'orchestrator.js'), 'utf8');
const contracts = fs.readFileSync(path.join(PACKAGE, 'contracts.js'), 'utf8');
const index = fs.readFileSync(path.join(PACKAGE, 'index.js'), 'utf8');
const compiler = fs.readFileSync(
  path.join(ROOT, 'src/core/linear-fea-model-compiler/model-compiler.js'),
  'utf8',
);
const consumerGuard = fs.readFileSync(
  path.join(ROOT, 'scripts/linear-piping-analysis-consumer-anti-drift-check.mjs'),
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

assert.match(contracts, /linear-piping-multicase-application-request\/v1/u);
assert.match(contracts, /linear-piping-multicase-application\/v1/u);
assert.match(orchestrator, /requireLinearPipingInputXmlAnalysisContext/u);
assert.match(orchestrator, /compileLinearPipingInterfaceSet/u);
assert.match(orchestrator, /recoverLinearPipingInterfaceLoads/u);
assert.match(orchestrator, /createLinearPipingInterfaceEnvelope/u);
assert.match(orchestrator, /compileNozzleAllowableAssessment/u);
assert.match(orchestrator, /compileLinearPipingB31Application/u);
assert.match(orchestrator, /sealLinearPipingQualifiedApplicationResult/u);
assert.match(index, /compileLinearPipingMulticaseApplication/u);
assert.match(index, /requireLinearPipingMulticaseApplication/u);

assert.match(compiler, /buildNodes\(topology, nodeBindings, elementBindings\)/u);
assert.match(compiler, /incidentComponentIds/u);
assert.match(compiler, /span\.sourceComponentUid/u);
assert.match(compiler, /binding\?\.sourceComponentId/u);
assert.match(compiler, /sourceComponentIds:\s*\[\.\.\.sourceComponentIds\]\.sort\(compareAscii\)/u);

for (const prohibited of [
  /inputXmlToCanonicalGeometry/u,
  /conditionGeometry/u,
  /compileMechanicalModel/u,
  /compilePhysicalLoadCase/u,
  /compileSolverExecution/u,
  /compileResultRecovery/u,
  /compileCodeResult/u,
  /elementContributionsFrom/u,
  /localAction\s*:/u,
  /Math\.random/u,
  /Date\.now/u,
  /new Date/u,
  /ASME[^\n]*\d+\.\d+/u,
]) {
  assert.doesNotMatch(orchestrator, prohibited);
}

assert.doesNotMatch(contracts, /allowableStress|stressIntensification|flexibilityFactor/u);
assert.ok(orchestrator.split('\n').length <= 560, 'Phase 2E orchestrator must remain bounded.');
assert.ok(contracts.split('\n').length <= 260, 'Phase 2E contracts must remain bounded.');

assert.match(consumerGuard, /linear-piping-multicase-application-check\.mjs/u);
assert.match(consumerGuard, /linear-piping-multicase-application-anti-drift-check\.mjs/u);
assert.match(packageJson.scripts['check:lfea-linear-core'] ?? '', /check:linear-piping-analysis-consumer/u);
assert.match(packageJson.scripts.gate ?? '', /check:linear-piping-analysis-consumer/u);

console.log(JSON.stringify({
  check: 'linear-piping-multicase-application-anti-drift',
  status: 'PASS',
  authority: 'ORCHESTRATION_ONLY',
  nodeAncestry: 'INCIDENT_BOUND_COMPONENTS',
  registration: 'check:linear-piping-analysis-consumer',
  prohibitedMechanics: true,
}));
