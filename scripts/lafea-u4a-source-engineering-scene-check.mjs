#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { createLafeaLifecycle } from '../src/workspace/lafea-lifecycle.js';
import {
  LAFEA_SOURCE_PRIMITIVE_KINDS,
  LAFEA_SOURCE_PRIMITIVE_SCHEMA,
  LAFEA_SOURCE_RENDER_REQUEST_SCHEMA,
  createLafeaSourceEngineeringScene,
  createLafeaSourceRenderRequest,
  createLafeaSourceViewportState,
  validateSourceScene,
  validateSourceViewport,
} from '../src/workspace/lafea-engineering-scene.js';
import { resolveLafeaRenderer } from '../src/workspace/lafea-canvas/render-policy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const document = continuumFixture();
const policy = Object.freeze({
  schema: 'LafeaRenderPolicy.v1',
  policyId: 'U4A-SOURCE-POLICY',
  sourceRevision: 1,
  svgMeshLimit: { source: 'QUALIFICATION_INPUT', value: 0 },
  svgFallbackLimit: { source: 'QUALIFICATION_INPUT', value: 0 },
  canvas2dFallbackLimit: { source: 'QUALIFICATION_INPUT', value: 0 },
  allowedFallbackModes: [],
  semanticHash: 'sha256:u4a-source-policy',
});

const noLifecycleScene = createLafeaSourceEngineeringScene({
  stageId: 'LAFEA.3',
  document,
  sceneRevision: 1,
  lifecycle: null,
  lifecycleBinding: null,
});
assert.equal(noLifecycleScene.schema, 'LafeaEngineeringScene.v2');
assert.equal(noLifecycleScene.sourceSemanticHash, null);
assert.equal(noLifecycleScene.topologySemanticHash, null);
assert.equal(noLifecycleScene.meshSemanticHash, null);
assert.equal(noLifecycleScene.recoverySemanticHash, null);
assert.deepEqual(noLifecycleScene.meshReferences, []);
assert.deepEqual(noLifecycleScene.resultFields, []);
assert.ok(noLifecycleScene.diagnostics.some(
  (row) => row.code === 'LAFEA_SCENE_SOURCE_HASH_UNAVAILABLE',
));
assert.ok(Object.isFrozen(noLifecycleScene));

const sourceHash = 'sha256:u4a-source-A';
const lifecycle = createLafeaLifecycle('LAFEA.3', sourceHash);
const currentBinding = Object.freeze({
  schema: 'lafea-lifecycle-binding/v1',
  status: 'CURRENT',
  boundDocumentDigest: 'fnv1a64:revision-token',
  currentDocumentDigest: 'fnv1a64:revision-token',
  reason: null,
  originRef: 'U4A-CHECK',
});
const scene = createLafeaSourceEngineeringScene({
  stageId: 'LAFEA.3',
  document,
  sceneRevision: 7,
  lifecycle,
  lifecycleBinding: currentBinding,
});
assert.equal(scene.sourceSemanticHash, sourceHash);
assert.deepEqual(scene.parentHashes, [{ authorityLayer: 'SOURCE', hash: sourceHash }]);
assert.equal(scene.sourcePrimitives.length, document.nodes.length + document.elements.length);
assert.ok(scene.sourcePrimitives.every(
  (row) => row.schema === LAFEA_SOURCE_PRIMITIVE_SCHEMA,
));
assert.ok(scene.sourcePrimitives.every(
  (row) => LAFEA_SOURCE_PRIMITIVE_KINDS.includes(row.kind),
));
assert.ok(scene.sourcePrimitives.every(
  (row) => row.parentIdentity.authorityLayer === 'SOURCE'
    && row.parentIdentity.sourceEntityId === row.sourceEntityId
    && row.parentIdentity.sourcePath === row.sourcePath,
));
assert.ok(scene.sourcePrimitives.every((row) => row.displayRole === 'SVG_SOURCE_AUTHORING'));
assert.ok(scene.sourcePrimitives.some((row) => row.sourceEntityId === 'B'));
assert.doesNotThrow(() => validateSourceScene(scene));

const staleScene = createLafeaSourceEngineeringScene({
  stageId: 'LAFEA.3',
  document,
  sceneRevision: 8,
  lifecycle,
  lifecycleBinding: { ...currentBinding, status: 'STALE_DOCUMENT_REVISION' },
});
assert.equal(staleScene.sourceSemanticHash, null);
assert.deepEqual(staleScene.parentHashes, []);
assert.ok(staleScene.diagnostics.some(
  (row) => row.code === 'LAFEA_SCENE_SOURCE_BINDING_NOT_CURRENT',
));

const viewport = createLafeaSourceViewportState(scene, {
  cssWidth: 1200,
  cssHeight: 700,
  devicePixelRatio: 2,
  paddingRatio: 0.1,
});
assert.equal(viewport.schema, 'LafeaViewportState.v2');
assert.equal(viewport.projection, 'XY_ENGINEERING');
assert.equal(viewport.cameraMode, 'ORTHOGRAPHIC');
assert.equal(viewport.viewMatrix.length, 16);
assert.equal(viewport.projectionMatrix.length, 16);
assert.equal(viewport.displayOptions.sourceAuthoring, true);
assert.equal(viewport.displayOptions.fieldBounds, null);
assert.equal(viewport.displayOptions.colorMapId, null);
assert.doesNotThrow(() => validateSourceViewport(viewport));
assert.ok(Object.isFrozen(viewport));

const emptyRequest = createLafeaSourceRenderRequest({
  scene,
  viewport,
  policy,
});
assert.equal(emptyRequest.schema, LAFEA_SOURCE_RENDER_REQUEST_SCHEMA);
assert.equal(emptyRequest.mode, 'SOURCE_AUTHORING');
assert.equal(emptyRequest.renderPacket, null);
assert.equal(emptyRequest.selection.sourceEntityId, null);
assert.equal(emptyRequest.displayedPrimitiveCount, scene.sourcePrimitives.length);
assert.equal(resolveLafeaRenderer({
  mode: emptyRequest.mode,
  displayedPrimitiveCount: emptyRequest.displayedPrimitiveCount,
  webglAvailable: false,
  canvas2dAvailable: false,
  policy: emptyRequest.policy,
}), 'SVG');

const selectedRequest = createLafeaSourceRenderRequest({
  scene,
  viewport,
  policy,
  selection: {
    sceneRevision: scene.sceneRevision,
    sourceEntityId: 'B',
    meshEntityId: null,
    entityRole: 'SOURCE',
  },
});
assert.equal(selectedRequest.selection.sourceEntityId, 'B');
assert.throws(
  () => createLafeaSourceRenderRequest({
    scene,
    viewport,
    policy,
    selection: {
      sceneRevision: scene.sceneRevision,
      sourceEntityId: '1',
      meshEntityId: null,
      entityRole: 'SOURCE',
    },
  }),
  (error) => error?.code === 'LAFEA_SOURCE_SELECTION_ENTITY_NOT_IN_SCENE',
);
assert.throws(
  () => createLafeaSourceRenderRequest({
    scene,
    viewport,
    policy,
    selection: {
      sceneRevision: scene.sceneRevision,
      sourceEntityId: 'B',
      meshEntityId: 'MESH-INDEX-0',
      entityRole: 'SOURCE',
    },
  }),
  (error) => error?.code === 'LAFEA_SOURCE_SELECTION_MESH_ID_FORBIDDEN',
);

const duplicateDocument = structuredClone(document);
duplicateDocument.nodes[1].nodeId = duplicateDocument.nodes[0].nodeId;
assert.throws(
  () => createLafeaSourceEngineeringScene({
    stageId: 'LAFEA.3',
    document: duplicateDocument,
    sceneRevision: 9,
    lifecycle,
    lifecycleBinding: currentBinding,
  }),
  (error) => [
    'LAFEA_SOURCE_PRIMITIVE_ID_COLLISION',
    'LAFEA_SCENE_ENTITY_ID_COLLISION',
  ].includes(error?.code),
);

const emptyScene = createLafeaSourceEngineeringScene({
  stageId: 'LAFEA.6',
  document: {
    schema: 'lafea-weld-profile-placeholder/v1',
    identity: 'WELD-NOT-IMPLEMENTED',
  },
  sceneRevision: 1,
  lifecycle: null,
  lifecycleBinding: null,
});
assert.equal(emptyScene.sourcePrimitives.length, 0);
assert.ok(emptyScene.diagnostics.some((row) => row.code === 'LAFEA_SOURCE_SCENE_EMPTY'));

const workspace = path.join(ROOT, 'src', 'workspace');
const source = fs.readFileSync(path.join(workspace, 'lafea-engineering-scene.js'), 'utf8');
assert.match(source, /source-only bridge/u);
assert.match(source, /SVG_SOURCE_AUTHORING/u);
assert.match(source, /meshReferences:\s*\[\]/u);
assert.match(source, /resultFields:\s*\[\]/u);
assert.doesNotMatch(source, /packQualifiedMeshForRendering|createThreeMeshRenderer/u);
assert.doesNotMatch(source, /lafea-templates/u);
assert.doesNotMatch(source, /sourceSemanticHash:\s*lafeaDocumentDigest/u);

console.log(JSON.stringify({
  check: 'lafea-u4a-source-engineering-scene',
  status: 'PASS',
  sceneSchema: scene.schema,
  viewportSchema: viewport.schema,
  renderRequestSchema: emptyRequest.schema,
  sourcePrimitives: scene.sourcePrimitives.length,
  sourceRenderer: 'SVG',
  meshReferences: 0,
  resultFields: 0,
  documentDigestUsedAsEngineeringHash: false,
  syntheticGeometry: false,
  arrayIndexSelectionAuthority: false,
}));
