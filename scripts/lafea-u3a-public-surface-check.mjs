#!/usr/bin/env node

import assert from 'node:assert/strict';
import * as lifecycle from '../src/workspace/lafea-lifecycle.js';
import * as publicApi from '../src/workspace/lafea-workbench.js';

const required = Object.freeze([
  'LAFEA_ARTIFACT_KINDS',
  'LAFEA_ARTIFACT_RECORD_SCHEMA',
  'LAFEA_ARTIFACT_STATUSES',
  'LAFEA_ARTIFACT_REGISTRATION_SCHEMA',
  'LAFEA_LIFECYCLE_CHANGE_CLASSES',
  'LAFEA_LIFECYCLE_EVENT_SCHEMA',
  'LAFEA_LIFECYCLE_SCHEMA',
  'LAFEA_QUALIFICATION_STATES',
  'applyLafeaLifecycleEvent',
  'createLafeaArtifactRecord',
  'createLafeaLifecycle',
  'createLafeaLifecycleEvent',
  'lafeaLifecycleReadiness',
  'registerLafeaArtifact',
]);

for (const name of required) {
  assert.ok(name in lifecycle, `Lifecycle module is missing ${name}.`);
  assert.ok(name in publicApi, `Public workbench surface is missing ${name}.`);
  assert.strictEqual(publicApi[name], lifecycle[name], `${name} must be re-exported without wrapping.`);
}

console.log(JSON.stringify({
  check: 'lafea-u3a-public-surface',
  status: 'PASS',
  exportedContracts: required,
}));
