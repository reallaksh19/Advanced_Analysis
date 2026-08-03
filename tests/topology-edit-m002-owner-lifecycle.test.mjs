import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('M002 mounts the typed backend through the inherited single-lifecycle factory seam', async () => {
  const coreSource = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller-core.js', import.meta.url),
    'utf8',
  );
  const controllerSource = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );

  assert.match(coreSource, /createViewportBackend\(\)/u);
  assert.match(
    coreSource,
    /this\.viewportBackend\s*=\s*this\.createViewportBackend\(\)/u,
  );
  assert.match(
    controllerSource,
    /createViewportBackend\(\)\s*\{\s*return new TopologyEditTypedViewportBackend\(\);\s*\}/u,
  );
  assert.match(controllerSource, /TOPOLOGY_EDIT_TYPED_BACKEND_FACTORY_MISMATCH/u);
  assert.doesNotMatch(controllerSource, /this\.viewportBackend\?\.destroy\(\)/u);
  assert.doesNotMatch(controllerSource, /new TopologyEditPresentationRuntime/u);
});

test('M002 production geometry contains no local component-length policy factors', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit/topology-edit-primitive-geometry.js', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /teeRunLengthFactor|teeBranchLengthFactor|oletLengthFactor|oletTipRadiusFactor|valveNeckRadiusFactor|instrumentStemRadiusFactor/u,
  );
  assert.match(source, /parameters\.runEnds/u);
  assert.match(source, /parameters\.branchEnd/u);
  assert.match(source, /TEE_RUN_DIRECTION_MISMATCH/u);
  assert.match(source, /OLET_BRANCH_DIRECTION_MISMATCH/u);
});
