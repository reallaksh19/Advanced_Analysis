/**
 * Render-model projection and resource cleanup for the Three viewport.
 */
import { createThreePrimitive } from './three-primitive-factory.js';
import { disposeThreeEngineeringObject } from './three-object-disposal.js';
import {
  isNonFeaP0ObservabilityEnabled,
  measureNonFeaP0Stage,
  recordNonFeaP0Duration,
} from './non-fea-p0-observability.js';
import { assertViewportRenderModel } from './viewport-render-model.js';

export function renderThreeModel(backend, model, options = {}) {
  assertViewportRenderModel(model);
  backend.applyModelConfiguration(model);
  const isFirstLoad = !backend.hasFittedFirstModel || options.resetCamera === true;

  clearThreeSceneObjects(backend);
  backend.model = model;
  backend.selectedEntityId = '';
  projectPrimitives(
    backend,
    model.physicalPrimitives ?? [],
    backend.physicalGroup,
  );
  projectPrimitives(
    backend,
    model.supportOverlayPrimitives ?? [],
    backend.supportGroup,
  );
  projectPrimitives(
    backend,
    model.diagnosticPrimitives ?? [],
    backend.diagnosticGroup,
  );
  updateThreeHostMetadata(backend);

  // Only perform expensive camera fitView on initial model load, not on every single incremental edit click
  if (isFirstLoad) {
    measureNonFeaP0Stage('FIT', () => backend.fitView());
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
}

export function updateThreeHostMetadata(backend) {
  if (!backend.hostElement) return;
  const summary = backend.model?.summary ?? {};
  const data = backend.hostElement.dataset;
  data.renderableCount = String(summary.renderableCount ?? 0);
  data.skippedCount = String(summary.skippedCount ?? 0);
  data.resolvedCount = String(summary.resolvedCount ?? 0);
  data.fallbackCount = String(summary.fallbackCount ?? 0);
  data.componentKinds = Object.keys(summary.byKind ?? {})
    .sort()
    .join(',');
  data.selectedEntityId = backend.selectedEntityId;
}

export function resolveThreeEntityId(object) {
  let current = object;
  while (current) {
    if (current.userData?.entityId) return current.userData.entityId;
    current = current.parent;
  }
  return '';
}

/**
 * Resolves exactly one Three object for a canonical entity identity. Missing or
 * multiply materialized identities deliberately return null so presentation
 * consumers fail closed rather than choosing a first or nearest object.
 */
export function resolveUniqueThreeEntityObject(backend, entityId) {
  if (typeof entityId !== 'string' || entityId.length === 0) return null;
  const objects = backend?.objects?.get?.(entityId);
  return Array.isArray(objects) && objects.length === 1 ? objects[0] : null;
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
  ].forEach((key) => delete hostElement.dataset[key]);
}

function projectPrimitives(backend, primitives, group) {
  if (!isNonFeaP0ObservabilityEnabled()) {
    primitives.forEach((item) => projectPrimitive(backend, item, group));
    return;
  }
  const startedAtMs = globalThis.performance.now();
  let sceneInstallationMs = 0;
  primitives.forEach((item) => {
    const object = materializePrimitive(backend, item);
    if (!object) return;
    const installStartedAtMs = globalThis.performance.now();
    group.add(object);
    sceneInstallationMs += globalThis.performance.now() - installStartedAtMs;
  });
  const projectionMs = globalThis.performance.now() - startedAtMs;
  recordNonFeaP0Duration('GPU_SCENE_INSTALL', sceneInstallationMs);
  recordNonFeaP0Duration(
    'THREE_MATERIALIZATION',
    Math.max(0, projectionMs - sceneInstallationMs),
  );
}

function projectPrimitive(backend, item, group) {
  const object = materializePrimitive(backend, item);
  if (object) group.add(object);
}

function materializePrimitive(backend, item) {
  const object = createThreePrimitive(item);
  if (!object) return null;
  object.userData.entityId = item.objectId;
  object.traverse((child) => {
    if (!child.userData.entityId) child.userData.entityId = item.objectId;
  });
  const values = backend.objects.get(item.objectId) ?? [];
  values.push(object);
  backend.objects.set(item.objectId, values);
  return object;
}
