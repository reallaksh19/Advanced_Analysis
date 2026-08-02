import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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

test('production backend filters clipped hits before resolving canonical identity', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit/topology-edit-viewport-backend.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /intersects\.find/);
  assert.match(source, /isEngineeringPointInsideSectionPlanes\(candidate\.point/);
  assert.match(source, /pickTable\?\.\[hit\.instanceId\]/);
  assert.match(source, /renderer\.localClippingEnabled/);
  assert.match(source, /setPresentationSectionPlanes\(\[\]\)/);
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
