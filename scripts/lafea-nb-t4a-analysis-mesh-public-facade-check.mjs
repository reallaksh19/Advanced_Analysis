#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { triangleSource } from './lafea.3-fixtures.mjs';
import * as custody from '../src/workspace/lafea-analysis-mesh-custody.js';
import * as projection from '../src/workspace/lafea-analysis-mesh-custody-projection.js';
import * as validator from '../src/workspace/lafea-analysis-mesh-evidence-validator.js';
import * as storeModule from '../src/workspace/lafea-lifecycle-workbench-store.js';
import {
  LafeaWorkbenchController,
} from '../src/workspace/lafea-workbench-controller.js';
import * as publicApi from '../src/workspace/lafea-workbench.js';

for (const [module, names] of [
  [custody, [
    'LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA',
    'LAFEA_ANALYSIS_MESH_CUSTODY_STATES',
    'selectLafeaAnalysisMeshCustody',
  ]],
  [projection, [
    'LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA',
    'buildAnalysisMeshCustodyProjection',
  ]],
  [validator, ['validateLafeaAnalysisMeshEvidence']],
]) {
  for (const name of names) {
    assert.ok(name in publicApi, `Public workbench surface is missing ${name}.`);
    assert.strictEqual(publicApi[name], module[name],
      `${name} must be re-exported without wrapping.`);
  }
}

assert.equal(
  publicApi.LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA,
  'lafea-analysis-mesh-custody-projection/v1',
);
assert.deepEqual(publicApi.LAFEA_ANALYSIS_MESH_CUSTODY_STATES, [
  'NOT_APPLICABLE', 'ABSENT', 'STALE', 'CURRENT_PASS',
  'CURRENT_WARNING', 'CURRENT_BLOCK', 'INVALID',
]);

const store = storeModule.createLafeaWorkbenchStore({
  initialStage: 'LAFEA.3',
  initialDocument: triangleSource(),
});
for (const method of [
  'validateLafeaAnalysisMeshEvidence',
  'registerAnalysisMeshEvidence',
  'selectRetainedAnalysisMeshEvidence',
  'buildAnalysisMeshCustodyProjection',
  'exportAnalysisMeshEvidence',
  'recoverAnalysisMeshEvidence',
]) assert.equal(typeof store[method], 'function', `Store is missing ${method}.`);
store.destroy();

for (const method of [
  'validateLafeaAnalysisMeshEvidence',
  'registerAnalysisMeshEvidence',
  'selectRetainedAnalysisMeshEvidence',
  'buildAnalysisMeshCustodyProjection',
  'exportAnalysisMeshEvidence',
  'recoverAnalysisMeshEvidence',
]) {
  assert.equal(typeof LafeaWorkbenchController.prototype[method], 'function',
    `Controller is missing ${method}.`);
}

const note = fs.readFileSync(
  'docs/LAFEA_WP_MC1_Analysis_Mesh_Custody.md',
  'utf8',
);
for (const required of [
  'Hash reappearance does not restore authority',
  'lafea-analysis-mesh-custody-projection/v1',
  'meshConfig remains an unapplied preference',
  'No mesh generation',
]) assert.ok(note.includes(required), `Architecture note is missing: ${required}`);

for (const path of [
  'src/workspace/lafea-workbench.js',
  'src/workspace/lafea-workbench-controller.js',
  'scripts/lafea-nb-t4a-analysis-mesh-public-facade-check.mjs',
]) assert.ok(fs.readFileSync(path, 'utf8').trimEnd().split('\n').length < 300,
  `${path} exceeds 300 lines`);

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-public-facade',
  status: 'PASS',
  validatorPublic: true,
  custodySelectorPublic: true,
  projectionPublic: true,
  liveStoreCommandsPublic: true,
  controllerFacadeComplete: true,
  architectureNotePresent: true,
  moduleLineLimitExclusive: 300,
}));
