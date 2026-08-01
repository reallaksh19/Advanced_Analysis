#!/usr/bin/env node

import assert from 'node:assert/strict';
import * as sceneModule from '../src/workspace/lafea-engineering-scene.js';
import * as publicApi from '../src/workspace/lafea-workbench.js';

const required = Object.freeze([
  'LAFEA_SOURCE_PRIMITIVE_KINDS',
  'LAFEA_SOURCE_PRIMITIVE_SCHEMA',
  'LAFEA_SOURCE_RENDER_REQUEST_SCHEMA',
  'createLafeaSourceEngineeringScene',
  'createLafeaSourceRenderRequest',
  'createLafeaSourceViewportState',
  'validateSourceScene',
  'validateSourceViewport',
]);

for (const name of required) {
  assert.ok(name in sceneModule, `U4A scene module is missing ${name}.`);
  assert.ok(name in publicApi, `Public LAFEA workbench surface is missing ${name}.`);
  assert.strictEqual(
    publicApi[name],
    sceneModule[name],
    `${name} must be re-exported without wrapping or recomputation.`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-u4a-public-surface',
  status: 'PASS',
  exportedContracts: required,
}));
