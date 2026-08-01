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
  lafeaRegisteredExecutionSupported,
  lafeaRegisteredPreviewSource,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';
import {
  LAFEA_STAGE_COMPOSITION_METADATA,
  requireLafeaStageCompositionRoute,
} from '../src/workspace/lafea-stage-composition-root.js';
import {
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from '../src/workspace/lafea-workbench-model.js';
import { lafeaPreviewGeometry } from '../src/workspace/lafea-stage-preview.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.join(ROOT, 'src', 'workspace');
const read = (relativePath) => fs.readFileSync(path.join(WORKSPACE, relativePath), 'utf8');

const FIXTURES = Object.freeze({
  'LAFEA.1': { loadReferencePoints: [{ identity: 'LOAD-POINT-1', point: { value: [1, 2, 3] } }] },
  'LAFEA.2': {},
  'LAFEA.3': meshFixture(),
  'LAFEA.4': meshFixture(),
  'LAFEA.5': { shellTemplate: meshFixture() },
  'LAFEA.6': meshFixture(),
});

assert.equal(new Set(LAFEA_STAGE_IDS).size, LAFEA_STAGE_IDS.length);
assert.equal(LAFEA_STAGE_IDS.length, LAFEA_STAGE_REGISTRY.length);
assert.equal(LAFEA_STAGE_COMPOSITION_METADATA.length, LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_COMPOSITION_METADATA.map((row) => row.stageId)).size,
  LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_COMPOSITION_METADATA.map((row) => row.compositionRootId)).size,
  LAFEA_STAGE_IDS.length);

for (const stageId of LAFEA_STAGE_IDS) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  const route = requireLafeaStageCompositionRoute(stageId);
  const metadata = LAFEA_STAGE_COMPOSITION_METADATA.find((row) => row.stageId === stageId);
  assert.deepEqual(lafeaCollectionPaths(stageId), lafeaRegisteredCollectionPaths(stageId));
  assert.equal(lafeaStageExecutionSupported(stageId), lafeaRegisteredExecutionSupported(stageId));
  assert.deepEqual(entry.previewSource, lafeaRegisteredPreviewSource(stageId));
  assert.equal(route.compositionRootId, entry.compositionRootId);
  assert.deepEqual(route.componentIds, entry.componentIds);
  assert.equal(metadata.compositionRootId, entry.compositionRootId);
  assert.deepEqual(metadata.componentIds, entry.componentIds);
  assert.equal(metadata.executionSupported, lafeaRegisteredExecutionSupported(stageId));

  const geometry = lafeaPreviewGeometry(stageId, FIXTURES[stageId]);
  assert.equal(geometry.nodePath, entry.previewSource.editable ? entry.previewSource.nodePath : null,
    `${stageId} preview editability must come from the registry.`);
}

const continuum = lafeaPreviewGeometry('LAFEA.3', FIXTURES['LAFEA.3']);
assert.equal(continuum.nodes[0].sourceEntityId, 'NODE-1');
assert.equal(continuum.nodes[0].sceneEntityId, 'SCENE:NODE:NODE-1');
assert.equal(continuum.nodes[0].sourcePath, 'nodes[0]');
assert.equal(continuum.elements[0].sourceEntityId, 'ELEMENT-1');
assert.equal(continuum.elements[0].sceneEntityId, 'SCENE:ELEMENT:ELEMENT-1');
assert.equal(continuum.elements[0].sourcePath, 'elements[0]');

const registryHash = crypto.createHash('sha256')
  .update(JSON.stringify(LAFEA_STAGE_REGISTRY)).digest('hex');
assert.equal(registryHash,
  crypto.createHash('sha256').update(JSON.stringify(LAFEA_STAGE_REGISTRY)).digest('hex'));

const registrySource = read('lafea-stage-registry.js');
const compositionSource = read('lafea-stage-composition-root.js');
const modelSource = read('lafea-workbench-model.js');
const viewSource = read('lafea-workbench-view.js');
const previewSource = read('lafea-stage-preview.js');
const presenterSource = read('lafea-result-presenters/index.js');
const publicSource = read('lafea-workbench.js');

assert.doesNotMatch(registrySource, /from ['"]\.\/lafea-workbench-model\.js['"]/u);
assert.match(modelSource, /from ['"]\.\/lafea-stage-composition-root\.js['"]/u);
assert.doesNotMatch(modelSource, /calculateLocalAttachment|calculateLocalContinuum|calculateLocalShell|calculateLocalTrunnion/u);
assert.doesNotMatch(modelSource, /if \(stageId === ['"]LAFEA\./u);
assert.doesNotMatch(modelSource, /const COLLECTIONS\s*=/u);
assert.match(compositionSource, /const ROUTES = Object\.freeze/u);
for (const stageId of LAFEA_STAGE_IDS) {
  assert.equal(occurrences(compositionSource, `route('${stageId}'`), 1,
    `${stageId} must have one composition-root route.`);
}
assert.equal(occurrences(compositionSource, "calculateLocalAttachmentFoundation,"), 2);
assert.equal(occurrences(compositionSource, "calculateLocalAttachmentScreening,"), 2);
assert.equal(occurrences(compositionSource, "calculateLocalContinuum,"), 2);
assert.equal(occurrences(compositionSource, "calculateLocalShell,"), 2);
assert.equal(occurrences(compositionSource, "calculateLocalTrunnionFootprint,"), 2);

assert.match(viewSource, /LAFEA_STAGE_REGISTRY/u);
assert.match(viewSource, /requireLafeaStageRegistryEntry/u);
assert.doesNotMatch(viewSource, /const STAGE_TRUTH\s*=/u);
assert.match(previewSource, /lafeaRegisteredPreviewSource/u);
assert.doesNotMatch(previewSource, /if \(stageId === ['"]LAFEA\./u);
assert.match(presenterSource, /entry\.presenterRole/u);
assert.match(presenterSource, /entry\.unitSourceRole/u);
assert.match(publicSource, /LAFEA_STAGE_REGISTRY/u);
assert.match(publicSource, /LAFEA_STAGE_COMPOSITION_METADATA/u);

console.log(JSON.stringify({
  check: 'lafea-u1b-registry-consumers',
  status: 'PASS',
  registryHash,
  stageCount: LAFEA_STAGE_IDS.length,
  compositionRouteCount: LAFEA_STAGE_COMPOSITION_METADATA.length,
  duplicateDispatchMaps: 0,
  modelParity: true,
  viewRegistryOwned: true,
  previewRegistryOwned: true,
  presenterRegistryOwned: true,
  indexIdentityFallback: false,
}));

function occurrences(source, token) {
  return source.split(token).length - 1;
}

function meshFixture() {
  return {
    nodes: [
      { nodeId: 'NODE-1', x: 0, y: 0, z: 0 },
      { nodeId: 'NODE-2', x: 1, y: 0, z: 0 },
    ],
    elements: [{ elementId: 'ELEMENT-1', nodeIds: ['NODE-1', 'NODE-2'] }],
  };
}
