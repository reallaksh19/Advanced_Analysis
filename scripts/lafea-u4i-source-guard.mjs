#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const picker = read('../src/workspace/lafea-canvas/three-primitive-picker.js');
const selection = read('../src/workspace/lafea-canvas/result-selection-authority.js');
const renderer = read('../src/workspace/lafea-canvas/three-mesh-renderer-v2.js');
const coordinator = read('../src/workspace/lafea-hybrid-result-viewport.js');
const liveViewport = read('../src/workspace/lafea-live-workbench-viewport.js');
const publicFacade = read('../src/workspace/lafea-hybrid-result-viewport-public.js');
const publicWorkbench = read('../src/workspace/lafea-workbench.js');

assert.match(picker, /new THREE\.Raycaster\(\)/u);
assert.match(picker, /new THREE\.Vector2\(\)/u);
assert.match(picker, /raycaster\.setFromCamera/u);
assert.match(picker, /raycaster\.intersectObjects\(rendered\.objects, false\)/u);
assert.match(picker, /drawGroup: 'TRIANGLES'/u);
assert.match(picker, /primitiveIndex: intersection\.faceIndex/u);
for (const forbidden of [
  'sourceEntityId', 'meshEntityId', 'entityRole', 'nodeId', 'elementId',
]) {
  assert.equal(
    /return deepFreeze\([\s\S]*?\);/u.exec(picker)?.[0]?.includes(forbidden) ?? false,
    false,
    `Primitive picker return must not expose ${forbidden}.`,
  );
}
assert.doesNotMatch(picker, /pickMap|selection-store|sourceScene/u);

assert.match(selection, /createLafeaSelectionStore/u);
assert.match(selection, /store\.selectMeshPick/u);
assert.match(selection, /visibleSceneRevision: sceneRevision/u);
assert.match(selection, /pickMap: governedPickMap/u);
assert.match(selection, /sourceEntityIds\.has/u);
assert.doesNotMatch(selection, /Raycaster|faceIndex|clientX|clientY/u);

assert.match(renderer, /createThreePrimitivePicker/u);
assert.match(renderer, /pickClientPoint/u);
assert.match(renderer, /typeof THREE\.OrthographicCamera === 'function'/u);
assert.match(renderer, /currentCamera\.isOrthographicCamera = true/u);
assert.match(renderer, /orthographicDepth\(\s*request\.viewport\.projectionMatrix/u);
assert.match(renderer, /const scale = matrix\[10\]/u);
assert.match(renderer, /const offset = matrix\[14\]/u);
assert.match(renderer, /LAFEA_V2_ORTHOGRAPHIC_DEPTH_INVALID/u);
assert.doesNotMatch(renderer, /pickMap|sourceEntityId|meshEntityId|entityRole/u);
assert.match(coordinator, /createLafeaResultSelectionAuthority/u);
assert.match(coordinator, /threeAdapter\.pickClientPoint/u);
assert.match(coordinator, /selectionAuthority\.selectMeshPick\(pick\)/u);
assert.match(coordinator, /root\.addEventListener\('click', handleGpuPick\)/u);
assert.match(coordinator, /closest\?\.\('\[data-node-id\], \[data-element-id\]'\)/u);
assert.doesNotMatch(
  coordinator,
  /selection\s*=\s*\{[^}]*primitiveIndex|meshEntityId\s*:\s*pick\.|sourceEntityId\s*:\s*pick\./u,
);

assert.match(liveViewport, /projectSelectionForSource/u);
assert.match(liveViewport, /meshEntityId: null/u);
assert.match(liveViewport, /entityRole: 'SOURCE'/u);
assert.match(
  liveViewport,
  /sourceInput\(input, model\.sourceModel\.request\.selection\)/u,
);
assert.doesNotMatch(
  liveViewport,
  /projectSelectionForSource[\s\S]*sceneSelections|pickMap|primitiveIndex/u,
);

assert.doesNotMatch(
  `${picker}\n${selection}\n${renderer}\n${coordinator}\n${liveViewport}`,
  /initializeLifecycle|registerLifecycleArtifact|applyLifecycleEvent|stage\.execution/u,
);
assert.doesNotMatch(
  `${picker}\n${selection}`,
  /src\/core|local-shell|lafea-templates|benchmark-fixtures/u,
);

assert.doesNotMatch(publicFacade, /selectMeshPick|pickClientPoint/u);
assert.doesNotMatch(publicWorkbench, /three-primitive-picker|result-selection-authority/u);

for (const [path, source, maximum] of [
  ['src/workspace/lafea-canvas/three-primitive-picker.js', picker, 100],
  ['src/workspace/lafea-canvas/result-selection-authority.js', selection, 150],
  ['src/workspace/lafea-canvas/three-mesh-renderer-v2.js', renderer, 200],
  ['src/workspace/lafea-live-workbench-viewport.js', liveViewport, 300],
]) {
  assert.ok(
    source.split(/\r?\n/u).length <= maximum,
    `${path} exceeds ${maximum} lines.`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-u4i-source-guard',
  status: 'PASS',
  raycasterOutputRole: 'DRAW_PRIMITIVE_ONLY',
  selectionAuthority: 'LAFEA_SELECTION_STORE',
  pickMapRequired: true,
  orthographicCameraRequired: true,
  projectionDepthBound: true,
  resultSelectionProjectsToSource: true,
  positionalIdentityLeak: false,
  publicPickSurfaceExpanded: false,
  lifecycleMutationPaths: 0,
  numericalImports: 0,
  templateImports: 0,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
