/**
 * Render-model projection and resource cleanup for the Three viewport.
 */
import { createThreePrimitive } from './three-primitive-factory.js';
import { disposeThreeEngineeringObject } from './three-object-disposal.js';
import { assertViewportRenderModel } from './viewport-render-model.js';

export function renderThreeModel(backend, model) {
  assertViewportRenderModel(model);
  clearThreeSceneObjects(backend);
  backend.model = model;
  backend.selectedEntityId = '';
  backend.raycaster.params.Line.threshold =
    Math.max(model.bounds.radius * 0.015, 0.5);
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
  backend.fitView();
  backend.initialCameraState = {
    position: backend.camera.position.clone(),
    target: backend.controls.target.clone(),
    zoom: backend.camera.zoom,
  };
}

export function clearThreeSceneObjects(backend) {
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
  primitives.forEach((item) => {
    const object = createThreePrimitive(item);
    if (!object) return;
    object.userData.entityId = item.objectId;
    object.traverse((child) => {
      if (!child.userData.entityId) {
        child.userData.entityId = item.objectId;
      }
    });
    const values = backend.objects.get(item.objectId) ?? [];
    values.push(object);
    backend.objects.set(item.objectId, values);
    group.add(object);
  });
}
