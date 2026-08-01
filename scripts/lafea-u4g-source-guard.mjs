#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const live = read('../src/workspace/lafea-live-workbench-viewport.js');
const sourceViewport = read('../src/workspace/lafea-source-workbench-viewport.js');
const registry = read('../src/workspace/lafea-workbench-render-evidence.js');
const controller = read('../src/workspace/lafea-workbench-controller.js');
const view = read('../src/workspace/lafea-workbench-view.js');
const publicSurface = read('../src/workspace/lafea-workbench.js');
const accessory = read('../src/workspace/lafea-workbench-accessory-panels.js');

assert.match(view, /mountLafeaLiveWorkbenchViewport/u);
assert.doesNotMatch(
  view,
  /from\s+['"]\.\/lafea-(?:hybrid-result-viewport-public|source-workbench-viewport)\.js['"]/u,
);
assert.match(view, /const VIEW_RENDER_DEPENDENCIES = new WeakMap\(\)/u);
assert.match(view, /VIEW_RENDER_DEPENDENCIES\.set\(this/u);
assert.match(view, /VIEW_RENDER_DEPENDENCIES\.delete\(this\)/u);
assert.doesNotMatch(view, /this\.getRenderPacket\s*=|this\.THREE\s*=/u);
assert.match(live, /evaluateLafeaRenderEvidenceIntake/u);
assert.match(live, /mountLafeaSourceWorkbenchViewportModel/u);
assert.doesNotMatch(live, /mountLafeaSourceWorkbenchViewport\(/u);
assert.match(live, /mountLafeaHybridResultViewport/u);
assert.match(live, /model\.sourceModel/u);
assert.match(live, /intake\.status === 'READY'/u);
assert.match(live, /sourceAuthoring: false/u);
assert.match(live, /deformationScale: 0/u);
assert.doesNotMatch(live, /stage\.execution|execution\.results|packQualified|triangulate|recover|average|smooth/u);
assert.doesNotMatch(live, /SVG_FALLBACK|CANVAS2D_FALLBACK|RASTER_WEBGL_CAPTURE/u);
assert.match(sourceViewport, /export function mountLafeaSourceWorkbenchViewportModel/u);
assert.match(
  sourceViewport,
  /return mountLafeaSourceWorkbenchViewportModel\(root, model, input\)/u,
);

const forbiddenImports = /from\s+['"][^'"]*(?:src\/core|local-shell|mesher|solver|recovery|code-assessment|lafea-templates|benchmark-fixtures)[^'"]*['"]/u;
assert.doesNotMatch(`${live}\n${registry}`, forbiddenImports);
assert.doesNotMatch(
  `${live}\n${registry}`,
  /initializeLifecycle|registerLifecycleArtifact|applyLifecycleEvent|createLafeaArtifactRecord/u,
);
assert.doesNotMatch(registry, /WebGL|createHybridViewport|stage\.execution/u);
assert.match(registry, /initializeLafeaWorkbenchRenderEvidence\(controller, THREE = null\)/u);
assert.match(registry, /THREE: THREE \?\? null/u);
assert.match(registry, /lafeaWorkbenchThreeNamespace/u);
assert.doesNotMatch(registry, /new THREE\.|THREE\.WebGLRenderer|THREE\.Scene/u);
assert.match(registry, /sealRenderPacketV2/u);
assert.match(registry, /const CONTROLLER_STATE = new WeakMap\(\)/u);
assert.match(registry, /packets: new Map\(\)/u);
assert.doesNotMatch(registry, /export function getLafeaWorkbenchDisplayRenderPacket/u);

assert.match(controller, /const \{ accessoryPanels, THREE, \.\.\.storeOptions \} = configuration/u);
assert.match(controller, /setDisplayRenderPacket\(packetValue\)/u);
assert.match(controller, /clearDisplayRenderPacket\(stageId/u);
assert.match(controller, /getDisplayViewportContext\(\)/u);
assert.match(controller, /destroyLafeaWorkbenchRenderEvidence\(this\)/u);
assert.doesNotMatch(controller, /getDisplayRenderPacket\(|getRenderPacket\(stageId\) \{/u);
assert.doesNotMatch(controller, /stage\.execution.*renderPacket|renderPacket.*stage\.execution/u);

assert.doesNotMatch(publicSurface, /lafea-workbench-render-evidence/u);
assert.doesNotMatch(publicSurface, /lafea-live-workbench-viewport/u);
assert.doesNotMatch(publicSurface, /lafeaWorkbenchDisplayRenderPacket/u);
assert.match(accessory, /const CONTROLLER_FACADE_KEYS = Object\.freeze\(\['getState', 'importDocument'\]\)/u);
for (const forbidden of [
  'getDisplayViewportContext',
  'setDisplayRenderPacket',
  'clearDisplayRenderPacket',
]) {
  assert.equal(accessory.includes(forbidden), false);
}

for (const [path, source] of [
  ['src/workspace/lafea-live-workbench-viewport.js', live],
  ['src/workspace/lafea-source-workbench-viewport.js', sourceViewport],
  ['src/workspace/lafea-workbench-render-evidence.js', registry],
]) {
  assert.ok(
    source.split(/\r?\n/u).length <= 300,
    `${path} exceeds the 300-line target.`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-u4g-source-guard',
  status: 'PASS',
  liveViewUsesDedicatedAdapter: true,
  singleSourceSceneInstance: true,
  viewDependenciesPrivate: true,
  packetDerivedFromExecution: false,
  packetRegistryPrivate: true,
  threeNamespaceStoredPrivately: true,
  rendererConstructedInRegistry: false,
  lifecycleMutationPaths: 0,
  numericalImports: 0,
  templateImports: 0,
  fallbackRenderers: 0,
  accessoryFacadeExpanded: false,
  publicRawPacketGetter: false,
  targetModuleLineLimit: 300,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
