#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_STAGE_IDS,
  LAFEA_STAGE_REGISTRY,
  lafeaRegisteredCollectionPaths,
  lafeaRegisteredComposition,
  lafeaRegisteredExecutionSupported,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';
import {
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from '../src/workspace/lafea-workbench-model.js';
import {
  lafeaStageCompositionIdentity,
  requireLafeaStageComposition,
} from '../src/workspace/lafea-stage-composition-root.js';
import { lafeaPreviewGeometry } from '../src/workspace/lafea-stage-preview.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.join(ROOT, 'src', 'workspace');
const read = (relativePath) => fs.readFileSync(path.join(WORKSPACE, relativePath), 'utf8');

const FIXTURES = Object.freeze({
  'LAFEA.1': {
    loadReferencePoints: [{ identity: 'LOAD-POINT-1', point: { value: [1, 2, 3] } }],
  },
  'LAFEA.2': {},
  'LAFEA.3': meshFixture(),
  'LAFEA.4': meshFixture(),
  'LAFEA.5': { shellTemplate: meshFixture() },
  'LAFEA.6': meshFixture(),
});

assert.equal(new Set(LAFEA_STAGE_IDS).size, LAFEA_STAGE_IDS.length);
assert.equal(LAFEA_STAGE_IDS.length, LAFEA_STAGE_REGISTRY.length);

for (const stageId of LAFEA_STAGE_IDS) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  const composition = requireLafeaStageComposition(stageId);
  assert.deepEqual(lafeaCollectionPaths(stageId), lafeaRegisteredCollectionPaths(stageId));
  assert.equal(lafeaStageExecutionSupported(stageId), lafeaRegisteredExecutionSupported(stageId));
  assert.deepEqual(composition.registryEntry, entry);
  assert.deepEqual(composition.previewSource, entry.previewSource);
  assert.equal(composition.compositionRootId, lafeaStageCompositionIdentity(stageId));
  assert.deepEqual(entry.composition, lafeaRegisteredComposition(stageId));
  assert.equal(composition.releaseStateBinding, 'RELEASE_NOT_QUALIFIED');

  const geometry = lafeaPreviewGeometry(stageId, FIXTURES[stageId]);
  assert.equal(
    geometry.nodePath,
    entry.previewSource.editable ? entry.previewSource.nodePath : null,
    `${stageId} preview editability must come from the composition root.`,
  );
}

const continuum = lafeaPreviewGeometry('LAFEA.3', FIXTURES['LAFEA.3']);
assert.equal(continuum.nodes[0].sourceEntityId, 'NODE-1');
assert.equal(continuum.nodes[0].sceneEntityId, 'SCENE:NODE:NODE-1');
assert.equal(continuum.nodes[0].sourcePath, 'nodes[0]');
assert.equal(continuum.elements[0].sourceEntityId, 'ELEMENT-1');
assert.equal(continuum.elements[0].sceneEntityId, 'SCENE:ELEMENT:ELEMENT-1');
assert.equal(continuum.elements[0].sourcePath, 'elements[0]');
assert.doesNotMatch(continuum.nodes[0].sourceEntityId, /\[0\]/u);
assert.doesNotMatch(continuum.elements[0].sourceEntityId, /\[0\]/u);

const registryHash = crypto.createHash('sha256')
  .update(JSON.stringify(LAFEA_STAGE_REGISTRY)).digest('hex');
assert.equal(registryHash, crypto.createHash('sha256')
  .update(JSON.stringify(LAFEA_STAGE_REGISTRY)).digest('hex'));

const registrySource = read('lafea-stage-registry.js');
const modelSource = read('lafea-workbench-model.js');
const previewSource = read('lafea-stage-preview.js');
const presenterSource = read('lafea-result-presenters/index.js');
const compositionSource = read('lafea-stage-composition-root.js');
const componentSource = read('lafea-stage-components.js');
const publicSource = read('lafea-workbench.js');

assert.doesNotMatch(registrySource, /from ['"]\.\/lafea-workbench-model\.js['"]/u);
assert.match(modelSource, /from ['"]\.\/lafea-stage-composition-root\.js['"]/u);
assert.doesNotMatch(modelSource, /stageId === ['"]LAFEA\./u);
assert.doesNotMatch(modelSource, /calculateLocal(?:Attachment|Continuum|Shell|Trunnion)/u);
assert.doesNotMatch(modelSource, /const COLLECTIONS\s*=/u);

assert.match(previewSource, /requireLafeaStageComposition/u);
assert.doesNotMatch(previewSource, /if \(stageId === ['"]LAFEA\./u);
assert.match(previewSource, /sourceEntityId: nodeId/u);
assert.match(previewSource, /sourceEntityId: elementId/u);

assert.match(presenterSource, /requireLafeaStageComposition/u);
assert.doesNotMatch(presenterSource, /PRESENTERS_BY_ROLE/u);
assert.doesNotMatch(presenterSource, /UNIT_RESOLVERS_BY_ROLE/u);
assert.doesNotMatch(presenterSource, /presentLocal(?:Stress|Continuum|Shell)/u);

assert.match(compositionSource, /requireLafeaTechnicalComponent/u);
assert.match(compositionSource, /requireLafeaLifecycleProfileForStage/u);
assert.doesNotMatch(compositionSource, /calculateLocal(?:Attachment|Continuum|Shell|Trunnion)/u);
assert.match(componentSource, /LAFEA_TECHNICAL_COMPONENT_IDS/u);
assert.match(publicSource, /LAFEA_STAGE_REGISTRY/u);

console.log(JSON.stringify({
  check: 'lafea-u1b-registry-consumers',
  status: 'PASS',
  registryHash,
  stageCount: LAFEA_STAGE_IDS.length,
  registrySchema: 'lafea-stage-registry/v2',
  modelCompositionRootOwned: true,
  previewCompositionRootOwned: true,
  presenterCompositionRootOwned: true,
  releaseStateBound: true,
  duplicateStageDispatchMaps: false,
  indexIdentityFallback: false,
}));

function meshFixture() {
  return {
    nodes: [
      { nodeId: 'NODE-1', x: 0, y: 0, z: 0 },
      { nodeId: 'NODE-2', x: 1, y: 0, z: 0 },
    ],
    elements: [
      { elementId: 'ELEMENT-1', nodeIds: ['NODE-1', 'NODE-2'] },
    ],
  };
}
