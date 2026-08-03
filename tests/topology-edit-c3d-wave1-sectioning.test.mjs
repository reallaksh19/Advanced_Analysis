import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { TopologyEditViewportBackend } from '../src/workspace/topology-edit/topology-edit-viewport-backend.js';
import {
  createTopologyEditPresentationState,
  parseTopologyEditPresentationState,
  reduceTopologyEditPresentationState,
  serializeTopologyEditPresentationState,
  topologyEditPresentationActions,
} from '../src/workspace/viewport-presentation/topology-edit-presentation-contract.js';
import {
  TopologyEditPresentationRuntime,
  applyTopologyEditSectionPresentation,
} from '../src/workspace/viewport-presentation/topology-edit-presentation-runtime.js';
import {
  createTopologyEditSectionBox,
  createTopologyEditSectionState,
  isEngineeringPointInsideSectionPlanes,
  topologyEditSectionBoxToPlaneEquations,
} from '../src/workspace/viewport-presentation/topology-edit-section-model.js';

const ACTIONS = topologyEditPresentationActions();
const completeBasis = Object.freeze({
  sourceHash: 'source-1',
  baseCanonicalHash: 'base-1',
  draftCanonicalHash: 'draft-1',
  visualModelHash: 'visual-1',
  scopeHash: 'scope-1',
});
const box = Object.freeze({
  min: Object.freeze({ x: -10, y: -20, z: -30 }),
  max: Object.freeze({ x: 10, y: 20, z: 30 }),
});

test('section boxes are immutable, deterministic, and engineering-coordinate based', () => {
  const first = createTopologyEditSectionState({ box });
  const second = createTopologyEditSectionState({ box: { ...box, camera: { x: 99 } } });
  assert.equal(first.sectionHash, second.sectionHash);
  assert.equal(first.box.coordinateSpace, 'ENGINEERING');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.box.min), true);
});

test('section box validation fails closed without hidden bounds', () => {
  assert.throws(() => createTopologyEditSectionBox(), /min is required/);
  assert.throws(
    () => createTopologyEditSectionBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 1, z: 1 } }),
    /max.x must be greater/,
  );
  assert.throws(
    () => createTopologyEditSectionBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: Number.NaN, z: 1 } }),
    /max.y must be finite/,
  );
});

test('section box produces six exact inward-facing clipping equations', () => {
  const state = createTopologyEditSectionState({ box });
  const planes = topologyEditSectionBoxToPlaneEquations(state);
  assert.equal(planes.length, 6);
  assert.deepEqual(planes[0], { normal: { x: 1, y: 0, z: 0 }, constant: 10 });
  assert.deepEqual(planes[1], { normal: { x: -1, y: 0, z: 0 }, constant: 10 });
  assert.deepEqual(planes[5], { normal: { x: 0, y: 0, z: -1 }, constant: 30 });
});

test('clipped hit predicate rejects outside points and accepts boundaries', () => {
  const planes = topologyEditSectionBoxToPlaneEquations(createTopologyEditSectionState({ box }));
  assert.equal(isEngineeringPointInsideSectionPlanes({ x: 0, y: 0, z: 0 }, planes), true);
  assert.equal(isEngineeringPointInsideSectionPlanes({ x: 10, y: 20, z: 30 }, planes), true);
  assert.equal(isEngineeringPointInsideSectionPlanes({ x: 10.01, y: 0, z: 0 }, planes), false);
});

test('presentation section actions do not mutate canonical data and reset deterministically', () => {
  const canonical = Object.freeze({ nodes: Object.freeze([{ id: 'N1' }]) });
  const initial = createTopologyEditPresentationState({ basis: completeBasis });
  const active = reduceTopologyEditPresentationState(initial, {
    type: ACTIONS.SET_SECTION_BOX,
    box,
  });
  const hidden = reduceTopologyEditPresentationState(active, {
    type: ACTIONS.HIDE_IDS,
    canonicalIds: ['N1'],
  });
  const reset = reduceTopologyEditPresentationState(hidden, { type: ACTIONS.RESET });
  assert.equal(active.section.box.max.z, 30);
  assert.equal(reset.section.box, null);
  assert.deepEqual(reset.canonicalVisibility.hiddenCanonicalIds, []);
  assert.deepEqual(canonical, { nodes: [{ id: 'N1' }] });
});

test('presentation state serializes and restores without hash drift', () => {
  const active = reduceTopologyEditPresentationState(
    createTopologyEditPresentationState({ basis: completeBasis }),
    { type: ACTIONS.SET_SECTION_BOX, box },
  );
  const restored = parseTopologyEditPresentationState(
    serializeTopologyEditPresentationState(active),
  );
  assert.equal(restored.presentationHash, active.presentationHash);
  assert.deepEqual(restored.section, active.section);
});

test('runtime applies and clears section planes through the renderer boundary', () => {
  const calls = [];
  const backend = fakeBackend((planes) => {
    calls.push(planes);
    return planes.length;
  });
  const runtime = new TopologyEditPresentationRuntime(backend);
  const active = reduceTopologyEditPresentationState(
    createTopologyEditPresentationState({ basis: completeBasis }),
    { type: ACTIONS.SET_SECTION_BOX, box },
  );
  runtime.apply(active);
  assert.equal(calls.at(-1).length, 6);
  runtime.destroy();
  runtime.destroy();
  assert.equal(calls.at(-1).length, 0);
});

test('runtime fails closed when an active section lacks backend support', () => {
  const backend = fakeBackend();
  delete backend.setPresentationSectionPlanes;
  const active = reduceTopologyEditPresentationState(
    createTopologyEditPresentationState({ basis: completeBasis }),
    { type: ACTIONS.SET_SECTION_BOX, box },
  );
  assert.throws(
    () => applyTopologyEditSectionPresentation(backend, active.section),
    /does not support section planes/,
  );
});

test('[SIMULATED] production backend clips only engineering groups and clears deterministically', () => {
  const backend = new TopologyEditViewportBackend();
  const renderer = { localClippingEnabled: false };
  backend.renderer = renderer;

  const sectionedMaterials = [
    ...addMaterialFixture(backend.groups.sourceGroup, false),
    ...addMaterialFixture(backend.groups.draftGroup, true),
    ...addMaterialFixture(backend.groups.supportGroup, false),
    ...addMaterialFixture(backend.groups.ghostGroup, false),
  ];
  const overlayMaterials = [
    ...addMaterialFixture(backend.groups.connectorGroup, false),
    ...addMaterialFixture(backend.groups.transientGroup, false),
    ...addMaterialFixture(backend.groups.selectionGroup, false),
    ...addMaterialFixture(backend.groups.measurementGroup, false),
    ...addMaterialFixture(backend.groups.issueGroup, false),
  ];
  const planes = topologyEditSectionBoxToPlaneEquations(createTopologyEditSectionState({ box }));

  assert.throws(() => backend.setPresentationSectionPlanes({}), /must be an array/);
  assert.throws(
    () => backend.setPresentationSectionPlanes(planes.slice(0, 1)),
    /must contain zero or six equations/,
  );
  assert.equal(backend.setPresentationSectionPlanes(planes), 6);
  assert.equal(renderer.localClippingEnabled, true);
  sectionedMaterials.forEach((material) => {
    assert.equal(material.clippingPlanes.length, 6);
    assert.equal(material.clippingPlanes.every((plane) => plane instanceof THREE.Plane), true);
  });
  overlayMaterials.forEach((material) => assert.equal(material.clippingPlanes, null));

  assert.equal(backend.setPresentationSectionPlanes([]), 0);
  assert.equal(renderer.localClippingEnabled, false);
  sectionedMaterials.forEach((material) => assert.equal(material.clippingPlanes, null));
  overlayMaterials.forEach((material) => assert.equal(material.clippingPlanes, null));

  backend.renderer = null;
  backend.destroy();
});

test('[SIMULATED] active clipping is applied to late session and ghost materials', () => {
  const backend = new TopologyEditViewportBackend();
  const planes = topologyEditSectionBoxToPlaneEquations(createTopologyEditSectionState({ box }));
  backend.setPresentationSectionPlanes(planes);
  backend.renderSession({
    source: projection('source', 0),
    draft: projection('draft', 1),
    supports: projection('support', 2),
    ghost: projection('ghost', 3),
  });

  [
    backend.groups.sourceGroup,
    backend.groups.draftGroup,
    backend.groups.supportGroup,
    backend.groups.ghostGroup,
  ].forEach((group) => {
    const materials = groupMaterials(group);
    assert.ok(materials.length > 0);
    materials.forEach((material) => assert.equal(material.clippingPlanes.length, 6));
  });

  backend.setPresentationSectionPlanes([]);
  backend.renderGhost(projection('later-ghost', 4));
  groupMaterials(backend.groups.ghostGroup)
    .forEach((material) => assert.equal(material.clippingPlanes, null));
  backend.destroy();
});

test('[SIMULATED] ray fallback skips clipped hits, preserves instanced identity, and clear restores picks', () => {
  const backend = new TopologyEditViewportBackend();
  const planes = topologyEditSectionBoxToPlaneEquations(createTopologyEditSectionState({ box }));
  const outside = pickObject({ objectId: 'outside', nodeId: 'outside' });
  const inside = pickObject({ objectId: 'inside', nodeId: 'inside' });
  backend.groups.sourceGroup.add(outside);
  backend.groups.draftGroup.add(inside);

  backend.pickRaycaster = raycasterSpy([
    { object: outside, point: new THREE.Vector3(50, 0, 0) },
    { object: inside, point: new THREE.Vector3(0, 0, 0) },
  ]);
  backend.setPresentationSectionPlanes(planes);
  assert.equal(backend.pickWithRaycaster(new THREE.Vector2()).objectId, 'inside');

  backend.pickRaycaster = raycasterSpy([
    { object: outside, point: new THREE.Vector3(50, 0, 0) },
  ]);
  assert.equal(backend.pickWithRaycaster(new THREE.Vector2()), null);

  const instanced = new THREE.Object3D();
  instanced.userData.pickTable = [
    { objectKind: 'node', objectId: 'instance-0', nodeId: 'instance-0' },
    { objectKind: 'node', objectId: 'instance-1', nodeId: 'instance-1' },
  ];
  backend.groups.supportGroup.add(instanced);
  backend.pickRaycaster = raycasterSpy([
    { object: instanced, instanceId: 1, point: new THREE.Vector3(0, 0, 0) },
  ]);
  assert.equal(backend.pickWithRaycaster(new THREE.Vector2()).objectId, 'instance-1');

  backend.setPresentationSectionPlanes([]);
  backend.pickRaycaster = raycasterSpy([
    { object: outside, point: new THREE.Vector3(50, 0, 0) },
  ]);
  assert.equal(backend.pickWithRaycaster(new THREE.Vector2()).objectId, 'outside');

  const outsideOverlay = pickObject({ objectId: 'outside-overlay', nodeId: 'outside-overlay' });
  backend.groups.issueGroup.add(outsideOverlay);
  backend.setPresentationSectionPlanes(planes);
  backend.pickRaycaster = raycasterSpy([
    { object: outside, point: new THREE.Vector3(50, 0, 0) },
    { object: outsideOverlay, point: new THREE.Vector3(50, 0, 0) },
  ]);
  assert.equal(backend.pickWithRaycaster(new THREE.Vector2()).objectId, 'outside-overlay');
  backend.destroy();
});

test('toolbar requires explicit six-axis bounds and discloses display-only authority', async () => {
  const source = await readFile(
    new URL('../src/workspace/viewport-presentation/topology-edit-presentation-toolbar.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /SECTION_FIELDS = Object\.freeze\(\['min-x', 'max-x', 'min-y', 'max-y', 'min-z', 'max-z'\]\)/);
  assert.match(source, /data-section-bound=\"\$\{name\}\"/);
  assert.match(source, /Enter all six finite section bounds/);
  assert.match(source, /do not modify geometry, command scope, or export/);
  assert.doesNotMatch(source, /data-section-bound="min-x"[^>]*value=/);
});

function fakeBackend(setPresentationSectionPlanes) {
  const group = { visible: true, traverse() {} };
  const backend = {
    groups: { sourceGroup: group, draftGroup: { ...group } },
  };
  if (setPresentationSectionPlanes) backend.setPresentationSectionPlanes = setPresentationSectionPlanes;
  return backend;
}

function addMaterialFixture(group, materialArray) {
  const materials = [
    new THREE.MeshBasicMaterial(),
    ...(materialArray ? [new THREE.MeshBasicMaterial()] : []),
  ];
  materials.forEach((material) => { material.clippingPlanes = null; });
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    materialArray ? materials : materials[0],
  );
  group.add(object);
  return materials;
}

function projection(id, x) {
  return {
    elements: [{
      id,
      entityId: id,
      type: 'node',
      x,
      y: 0,
      z: 0,
      pickTarget: { objectKind: 'node', objectId: id, nodeId: id },
    }],
    segments: [],
  };
}

function groupMaterials(group) {
  const materials = new Set();
  group.traverse((object) => {
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  return [...materials];
}

function pickObject(target) {
  const object = new THREE.Object3D();
  object.userData.pickTarget = { objectKind: 'node', ...target };
  return object;
}

function raycasterSpy(hits) {
  return {
    setFromCamera() {},
    intersectObjects() { return hits; },
  };
}
