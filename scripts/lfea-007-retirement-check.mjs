#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  APPLICATION_NAVIGATION_ORDER_V10,
  APPLICATION_NAVIGATION_ORDER_V11,
  CONSUMER_IDS,
  createWorkspaceConsumerRegistryV10,
  createWorkspaceConsumerRegistryV11,
  validateWorkspaceConsumerRegistryV10,
  validateWorkspaceConsumerRegistryV11,
} from '../src/core/workspace-consumers/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RETIRED_PATHS = Object.freeze([
  '.github/workflows/lfea-007-certification.yml',
  'docs/element-fea/LFEA-007_APPLICATION_CONSUMER.md',
  'e2e/lfea-007-local-fea-consumer.spec.js',
  'scripts/lfea-007-check.mjs',
  'scripts/lfea-007-contract-check.mjs',
  'scripts/lfea-007-controller-check.mjs',
  'scripts/lfea-007-determinism-check.mjs',
  'scripts/lfea-007-failure-check.mjs',
  'scripts/lfea-007-fixtures.mjs',
  'scripts/lfea-007-registration-check.mjs',
  'scripts/lfea-007-source-guard.mjs',
  'scripts/lfea-007-source-intake-check.mjs',
  'scripts/lfea-007-view-model-check.mjs',
  'src/core/lfea-consumer',
  'src/workspace/lfea-consumer-controller.js',
  'src/workspace/lfea-consumer-view.js',
]);

for (const relativePath of RETIRED_PATHS) {
  assert.equal(
    fs.existsSync(path.join(ROOT, relativePath)),
    false,
    `Retired LFEA-007 path remains: ${relativePath}`,
  );
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scriptEntries = Object.entries(packageJson.scripts ?? {});
assert.equal(
  scriptEntries.some(([name, command]) => name.includes('lfea.007') || command.includes('lfea-007')),
  false,
  'package.json still registers the retired LFEA-007 suite.',
);

const legacyRegistry = createWorkspaceConsumerRegistryV10();
assert.equal(validateWorkspaceConsumerRegistryV10(legacyRegistry).ok, true);
assert.equal(
  legacyRegistry.consumers.filter((entry) => entry.consumerId === CONSUMER_IDS.LOCAL_FEA).length,
  1,
  'Historical v10 LOCAL_FEA contract changed during retirement.',
);
assert.equal(APPLICATION_NAVIGATION_ORDER_V10.includes(CONSUMER_IDS.LOCAL_FEA), true);

const activeRegistry = createWorkspaceConsumerRegistryV11();
assert.equal(validateWorkspaceConsumerRegistryV11(activeRegistry).ok, true);
assert.equal(
  activeRegistry.consumers.some((entry) => entry.consumerId === CONSUMER_IDS.LOCAL_FEA),
  false,
  'Active v11 registry advertises retired LOCAL_FEA.',
);
assert.equal(APPLICATION_NAVIGATION_ORDER_V11.includes(CONSUMER_IDS.LOCAL_FEA), false);
assert.equal(APPLICATION_NAVIGATION_ORDER_V11.includes(CONSUMER_IDS.LAFEA), true);
assert.equal(APPLICATION_NAVIGATION_ORDER_V11.includes(CONSUMER_IDS.LFEA), true);

const activeLfea = activeRegistry.consumers.find((entry) => entry.consumerId === CONSUMER_IDS.LFEA);
assert(activeLfea, 'Active v11 LFEA workbench is missing.');
assert.equal(activeLfea.implementationStatus, 'IMPLEMENTED');
assert.equal(
  activeLfea.engineeringClaimPolicy,
  'INDEPENDENT_LFEA_DOCUMENT_AND_QUALIFIED_KERNELS_ONLY',
);

const retirementDecision = path.join(ROOT, 'docs/LFEA_007_RETIREMENT_DECISION.md');
assert.equal(fs.existsSync(retirementDecision), true, 'Retirement decision is missing.');
const decisionText = fs.readFileSync(retirementDecision, 'utf8');
for (const required of [
  'AUD-L007-001',
  'formally retired',
  'historical v10 registry schema',
  'current v11 application registry',
  'not the Priority 2 piping consumer',
]) {
  assert(decisionText.includes(required), `Retirement decision is missing required text: ${required}`);
}

console.log(JSON.stringify({
  schema: 'lfea-007-retirement-evidence/v1',
  status: 'RETIRED_FROM_ACTIVE_APPLICATION',
  removedPathCount: RETIRED_PATHS.length,
  legacyRegistry: legacyRegistry.schema,
  activeRegistry: activeRegistry.schema,
  activeApplicationViews: APPLICATION_NAVIGATION_ORDER_V11,
  priority2EvidenceEligible: false,
}));
