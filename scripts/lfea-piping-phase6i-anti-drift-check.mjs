#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PHASE6I_ANTI_DRIFT_CATALOG,
  PHASE6I_ANTI_DRIFT_CATALOG_SCHEMA,
  SUPERSEDED_PHASE6I_HEADS as CATALOG_SUPERSEDED_HEADS,
} from './lfea-piping-phase6i-anti-drift-catalog.mjs';
import {
  SUPERSEDED_PHASE6I_HEADS as POLICY_SUPERSEDED_HEADS,
} from './lfea-piping-phase6i-evidence-policy.mjs';

const EXPECTED_IDS = Object.freeze(Array.from(
  { length: 25 },
  (_unused, index) => `AD-${String(index + 1).padStart(2, '0')}`,
));
const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const release = JSON.parse(fs.readFileSync(
  'release-evidence/lfea-piping-release-evidence.json',
  'utf8',
));
const wrapper = fs.readFileSync('scripts/lfea-piping-release-readiness-check.mjs', 'utf8');
const self = fs.readFileSync('scripts/lfea-piping-phase6i-anti-drift-check.mjs', 'utf8');

assert.equal(PHASE6I_ANTI_DRIFT_CATALOG.schema, PHASE6I_ANTI_DRIFT_CATALOG_SCHEMA);
assert.equal(PHASE6I_ANTI_DRIFT_CATALOG.status, 'ENFORCEMENT_CATALOG_ONLY');
assert.equal(PHASE6I_ANTI_DRIFT_CATALOG.scenarioCount, 25);
assert.equal(PHASE6I_ANTI_DRIFT_CATALOG.scenarios.length, 25);
assert.deepEqual(
  PHASE6I_ANTI_DRIFT_CATALOG.scenarios.map((entry) => entry.id),
  EXPECTED_IDS,
);
assert.equal(
  new Set(PHASE6I_ANTI_DRIFT_CATALOG.scenarios.map((entry) => entry.id)).size,
  25,
);
assert.deepEqual(CATALOG_SUPERSEDED_HEADS, POLICY_SUPERSEDED_HEADS);
assert.equal(Object.isFrozen(PHASE6I_ANTI_DRIFT_CATALOG), true);
assert.equal(Object.isFrozen(PHASE6I_ANTI_DRIFT_CATALOG.scenarios), true);

for (const scenario of PHASE6I_ANTI_DRIFT_CATALOG.scenarios) {
  assert.match(scenario.id, /^AD-(?:0[1-9]|1[0-9]|2[0-5])$/u);
  assert.ok(nonEmpty(scenario.name), `${scenario.id} requires a scenario name.`);
  assert.ok(nonEmpty(scenario.injection), `${scenario.id} requires an injection.`);
  assert.ok(nonEmpty(scenario.requiredResult), `${scenario.id} requires a result.`);
  assert.ok(Array.isArray(scenario.enforcement) && scenario.enforcement.length > 0,
    `${scenario.id} requires enforcement evidence.`);
  for (const evidence of scenario.enforcement) {
    assert.ok(isSafeRepositoryPath(evidence.path),
      `${scenario.id} has an unsafe enforcement path: ${evidence.path}`);
    assert.equal(fs.existsSync(evidence.path), true,
      `${scenario.id} enforcement file is missing: ${evidence.path}`);
    assert.ok(Array.isArray(evidence.requiredTokens) && evidence.requiredTokens.length > 0,
      `${scenario.id} enforcement evidence requires tokens.`);
    const source = fs.readFileSync(evidence.path, 'utf8');
    for (const token of evidence.requiredTokens) {
      assert.ok(source.includes(token),
        `${scenario.id} lost token ${JSON.stringify(token)} in ${evidence.path}`);
    }
  }
}

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.ok(Object.values(release.gates).every((status) => status !== 'VERIFIED'));
assert.ok(Object.values(release.artifacts).every((value) => value === null));

assert.equal(
  packageValue.scripts['check:lfea-piping-phase6i-anti-drift'],
  'node scripts/lfea-piping-phase6i-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-piping-release-policy'],
  /lfea-piping-release-readiness-check\.mjs/u);
assert.match(packageValue.scripts.gate, /check:lfea-piping-release-policy/u);
assert.match(wrapper, /lfea-piping-phase6i-anti-drift-check\.mjs/u);
for (const token of [
  'child_' + 'process',
  'spawn' + 'Sync',
  'exec' + 'File',
  'shell' + 'js',
  'write' + 'File',
  'append' + 'File',
  'create' + 'WriteStream',
]) {
  assert.equal(self.includes(token), false,
    `Phase 6I aggregate qualification contains prohibited token ${token}.`);
}

await import('./lfea-piping-phase6i-evidence-policy-check.mjs');
await import('./lfea-piping-phase6i-pr371-boundary-check.mjs');
await import('./lfea-piping-phase6i-project-authority-index-check.mjs');
await import('./lfea-piping-phase6i-independent-closure-anti-drift-check.mjs');
await import('./linear-piping-project-qualification-anti-drift-check.mjs');
await import('./lfea-piping-phase6c-anti-drift-check.mjs');
await import('./lfea-piping-phase6d-anti-drift-check.mjs');
await import('./lfea-piping-phase6e-anti-drift-check.mjs');
await import('./lfea-piping-phase6f-anti-drift-check.mjs');
await import('./lfea-piping-phase6g-anti-drift-check.mjs');
await import('./lfea-piping-phase6h-anti-drift-check.mjs');
await import('./linear-piping-interface-anti-drift-check.mjs');
await import('./linear-piping-code-application-anti-drift-check.mjs');
await import('./linear-piping-presentation-anti-drift-check.mjs');
await import('./lfea-b4.0-source-guard.mjs');

console.log(JSON.stringify({
  schema: 'lfea-piping-phase6i-anti-drift-result/v1',
  status: 'PASS',
  scenarioCount: PHASE6I_ANTI_DRIFT_CATALOG.scenarioCount,
  executedEngineeringCommands: false,
  releaseEvidenceEligible: false,
}));

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isSafeRepositoryPath(value) {
  if (!nonEmpty(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  return !path.posix.isAbsolute(normalized)
    && !/^[A-Za-z]:\//u.test(normalized)
    && !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}
