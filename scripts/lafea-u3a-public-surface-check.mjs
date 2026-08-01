#!/usr/bin/env node

import assert from 'node:assert/strict';
import * as lifecycle from '../src/workspace/lafea-lifecycle.js';
import * as profiles from '../src/workspace/lafea-lifecycle-profiles.js';
import * as publicApi from '../src/workspace/lafea-workbench.js';

const lifecycleExports = Object.freeze([
  'LAFEA_ARTIFACT_KINDS',
  'LAFEA_ARTIFACT_RECORD_SCHEMA',
  'LAFEA_ARTIFACT_STATUSES',
  'LAFEA_ARTIFACT_REGISTRATION_SCHEMA',
  'LAFEA_LEGACY_ARTIFACT_KINDS',
  'LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA',
  'LAFEA_LEGACY_ARTIFACT_REGISTRATION_SCHEMA',
  'LAFEA_LEGACY_LIFECYCLE_SCHEMA',
  'LAFEA_LIFECYCLE_CHANGE_CLASSES',
  'LAFEA_LIFECYCLE_EVENT_SCHEMA',
  'LAFEA_LIFECYCLE_SCHEMA',
  'LAFEA_QUALIFICATION_STATES',
  'applyLafeaLifecycleEvent',
  'createLafeaArtifactRecord',
  'createLafeaLifecycle',
  'createLafeaLifecycleEvent',
  'lafeaLifecycleReadiness',
  'migrateLafeaLifecycleV1',
  'registerLafeaArtifact',
]);
const profileExports = Object.freeze([
  'LAFEA_LIFECYCLE_PROFILE_IDS',
  'LAFEA_LIFECYCLE_PROFILE_SCHEMA',
  'LAFEA_LIFECYCLE_PROFILES',
  'LAFEA_STAGE_LIFECYCLE_PROFILE_IDS',
  'lafeaLifecycleArtifactKinds',
  'requireLafeaLifecycleArtifactDefinition',
  'requireLafeaLifecycleProfile',
  'requireLafeaLifecycleProfileForStage',
]);

for (const name of lifecycleExports) {
  assert.ok(name in lifecycle, `Lifecycle module is missing ${name}.`);
  assert.ok(name in publicApi, `Public workbench surface is missing ${name}.`);
  assert.strictEqual(publicApi[name], lifecycle[name], `${name} must be re-exported without wrapping.`);
}
for (const name of profileExports) {
  assert.ok(name in profiles, `Lifecycle profile module is missing ${name}.`);
  assert.ok(name in publicApi, `Public workbench surface is missing ${name}.`);
  assert.strictEqual(publicApi[name], profiles[name], `${name} must be re-exported without wrapping.`);
}

assert.equal(publicApi.LAFEA_LIFECYCLE_SCHEMA, 'lafea-analysis-lifecycle/v2');
assert.equal(publicApi.LAFEA_LIFECYCLE_PROFILE_SCHEMA, 'lafea-lifecycle-profile/v1');
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.1'), [
  'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE', 'REPORT_EVIDENCE',
]);
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.6'), []);

console.log(JSON.stringify({
  check: 'lafea-u3a-public-surface',
  status: 'PASS',
  lifecycleExports,
  profileExports,
  stageCorrectProfilesPublic: true,
  legacyMigrationExplicit: true,
}));
