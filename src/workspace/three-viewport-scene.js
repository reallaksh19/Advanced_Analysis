/**
 * Render-model projection and resource cleanup for the Three viewport.
 */
import { createThreePrimitive } from './three-primitive-factory.js';
import { disposeThreeEngineeringObject } from './three-object-disposal.js';
import { ThreeSceneResourcePool } from './three-scene-resource-pool.js';
import { assertViewportRenderModel } from './viewport-render-model.js';
import { markWorkspaceInvocation, markWorkspaceMilestone, measureWorkspaceStage } from './workspace-performance.js';

export function renderThreeModel(backend, model, options = {}) {
  assertViewportRenderModel(model);
  markWorkspaceInvocation('three-render-model', { datasetId: model.datasetId });
  backend.applyModelConfiguration(model);
  const isFirstLoad = !backend.hasFittedFirstModel || options.resetCamera === true;
  const compiled = measureWorkspaceStage(
    'three-materialization',
    () => compileThreeModel(model),
    { datasetId: model.datasetId },
  );

  try {
    measureWorkspaceStage(
      'scene-installation',
      () => installCompiledThreeModel(backend, model, compiled),
      { datasetId: model.datasetId },
    );
  } catch (error) {
    disposeCompiledThreeModel(compiled);
    throw error;
  }

  updateThreeHostMetadata(backend);
  scheduleFirstMeaningfulFrameEvidence(backend, model);

  // Only perform expensive camera fitView on initial model load, not on every single incremental edit click.
  if (isFirstLoad) {
    measureWorkspaceStage('fit', () => backend.fitView(), { datasetId: model.datasetId });
    backend.hasFittedFirstModel = true;
    backend.initialCameraState = {
      position: backend.camera.position.clone(),
      target: backend.controls.target.clone(),
      zoom: backend.camera.zoom,
    };
  } else if (backend.controls) {
    backend.controls.update();
  }
}

export function compileThreeModel(model) {
  assertViewportRenderModel(model);
  const resourcePool = new ThreeSceneResourcePool();
  const compiled = {
    resourcePool,
    physicalObjects: [],
    supportObjects: [],
    diagnosticObjects: [],
    objects: new Map(),
  };
  try {
    projectPrimitives(model.physicalPrimitives ?? [], compiled.physicalObjects, compiled.objects, resourcePool);
    projectPrimitives(model.supportOverlayPrimitives ?? [], compiled.supportObjects, compiled.objects, resourcePool);
    projectPrimitives(model.diagnosticPrimitives ?? [], compiled.diagnosticObjects, compiled.objects, resourcePool);
    compiled.resourceEvidence = resourcePool.evidence();
    return compiled;
  } catch (error) {
    disposeCompiledThreeModel(compiled);
    throw error;
  }
}

export function clearThreeSceneObjects(backend) {
  backend.sceneBoundsCache = null;
  [
    backend.physicalGroup,
    backend.supportGroup,
    backend.diagnosticGroup,
  ].forEach((group) => {
    if (!group) return;
    [...group.children].forEach((object) => {
      group.remove(object);
      disposeThreeEngineeringObject(object);
    });
  });
  backend.objects.clear();
  backend.sceneResourcePool?.dispose();
  backend.sceneResourcePool = null;
  backend.sceneResourceEvidence = null;
}

export function updateThreeHostMetadata(backend) {
  if (!backend.hostElement) return;
  const summary = backend.model?.summary ?? {};
  const resources = backend.sceneResourceEvidence ?? {};
  const data = backend.hostElement.dataset;
  data.renderableCount = String(summary.renderableCount ?? 0);
  data.skippedCount = String(summary.skippedCount ?? 0);
  data.resolvedCount = String(summary.resolvedCount ?? 0);
  data.fallbackCount = String(summary.fallbackCount ?? 0);
  data.componentKinds = Object.keys(summary.byKind ?? {})
    .sort()
    .join(',');
  data.selectedEntityId = backend.selectedEntityId;
  data.sceneGeometryCount = String(resources.geometryCount ?? 0);
  data.sceneMaterialCount = String(resources.materialCount ?? 0);
  data.sceneGeometryReuseCount = String(resources.geometryReuseCount ?? 0);
  data.sceneMaterialReuseCount = String(resources.materialReuseCount ?? 0);
}

export function resolveThreeEntityId(object) {
  let current = object;
  while (current) {
    if (current.userData?.entityId) return current.userData.entityId;
    current = current.parent;
  }
  return '';
}

export function clearThreeHostMetadata(hostElement) {
  [
    'viewportBackend',
    'renderableCount',
    'skippedCount',
    'resolvedCount',
    'fallbackCount',
    'componentKinds',
    'selectedEntityId',
    'lastPickEntityId',
    'sceneGeometryCount',
    'sceneMaterialCount',
    'sceneGeometryReuseCount',
    'sceneMaterialReuseCount',
    'firstMeaningfulFrameDatasetId',
  ].forEach((key) => delete hostElement.dataset[key]);
}

function scheduleFirstMeaningfulFrameEvidence(backend, model) {
  if (backend.lastFirstMeaningfulFrameDatasetId === model.datasetId) return;
  const requestFrame = globalThis.requestAnimationFrame;
  if (typeof requestFrame !== 'function') return;
  requestFrame(() => {
    if (backend.model !== model || !backend.hostElement) return;
    backend.lastFirstMeaningfulFrameDatasetId = model.datasetId;
    backend.hostElement.dataset.firstMeaningfulFrameDatasetId = model.datasetId;
    markWorkspaceMilestone('first-meaningful-frame', { datasetId: model.datasetId });
  });
}

function installCompiledThreeModel(backend, model, compiled) {
  const additions = [
    [backend.physicalGroup, compiled.physicalObjects],
    [backend.supportGroup, compiled.supportObjects],
    [backend.diagnosticGroup, compiled.diagnosticObjects],
  ];
  const added = [];
  try {
    additions.forEach(([group, objects]) => objects.forEach((object) => {
      group.add(object);
      added.push({ group, object });
    }));
  } catch (error) {
    added.reverse().forEach(({ group, object }) => group.remove(object));
    throw error;
  }

  const previousObjects = [
    ...backend.physicalGroup.children.filter((object) => !compiled.physicalObjects.includes(object)),
    ...backend.supportGroup.children.filter((object) => !compiled.supportObjects.includes(object)),
    ...backend.diagnosticGroup.children.filter((object) => !compiled.diagnosticObjects.includes(object)),
  ];
  previousObjects.forEach((object) => {
    object.parent?.remove(object);
    disposeThreeEngineeringObject(object);
  });
  backend.sceneResourcePool?.dispose();
  backend.sceneResourcePool = compiled.resourcePool;
  backend.sceneResourceEvidence = compiled.resourceEvidence;
  backend.sceneBoundsCache = null;
  backend.model = model;
  backend.selectedEntityId = '';
  backend.objects.clear();
  compiled.objects.forEach((objects, objectId) => backend.objects.set(objectId, objects));
}

function disposeCompiledThreeModel(compiled) {
  if (!compiled) return;
  [compiled.physicalObjects, compiled.supportObjects, compiled.diagnosticObjects]
    .filter(Array.isArray)
    .flat()
    .forEach(disposeThreeEngineeringObject);
  compiled.resourcePool?.dispose();
}

function projectPrimitives(primitives, target, objectsById, resourcePool) {
  primitives.forEach((item) => {
    const object = createThreePrimitive(item, resourcePool);
    if (!object) return;
    object.userData.entityId = item.objectId;
    object.traverse((child) => {
      if (!child.userData.entityId) child.userData.entityId = item.objectId;
    });
    const values = objectsById.get(item.objectId) ?? [];
    values.push(object);
    objectsById.set(item.objectId, values);
    target.push(object);
  });
}
