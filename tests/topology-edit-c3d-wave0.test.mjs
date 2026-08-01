import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_TOPOLOGY_EDIT_PRESENTATION_POLICY,
  PRESENTATION_BASIS_STATUS,
  classifyTopologyEditPresentationBasis,
  createTopologyEditPresentationBasis,
  createTopologyEditPresentationState,
  reduceTopologyEditPresentationState,
  topologyEditPresentationActions,
} from '../src/workspace/viewport-presentation/topology-edit-presentation-contract.js';
import {
  TopologyEditPresentationRuntime,
  applyTopologyEditLayerPresentation,
} from '../src/workspace/viewport-presentation/topology-edit-presentation-runtime.js';

const ACTIONS = topologyEditPresentationActions();
const completeBasis = Object.freeze({
  sourceHash: 'source-1',
  baseCanonicalHash: 'base-1',
  draftCanonicalHash: 'draft-1',
  visualModelHash: 'visual-1',
  scopeHash: 'scope-1',
});

test('presentation state is immutable and deterministic', () => {
  const first = createTopologyEditPresentationState({ basis: completeBasis });
  const second = createTopologyEditPresentationState({ basis: completeBasis });
  assert.equal(first.basisStatus, PRESENTATION_BASIS_STATUS.CURRENT);
  assert.equal(first.presentationHash, second.presentationHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.basis), true);
  assert.equal(first.policy.authority, 'DISPLAY_ONLY_DEFAULT');
});

test('incomplete and stale authority bases remain explicit', () => {
  const incomplete = createTopologyEditPresentationBasis({ sourceHash: 'source-1' });
  assert.equal(classifyTopologyEditPresentationBasis(incomplete, incomplete), PRESENTATION_BASIS_STATUS.INCOMPLETE);
  assert.equal(
    classifyTopologyEditPresentationBasis(completeBasis, { ...completeBasis, draftCanonicalHash: 'draft-2' }),
    PRESENTATION_BASIS_STATUS.STALE,
  );
});

test('presentation actions change only display state', () => {
  const initial = createTopologyEditPresentationState({ basis: completeBasis });
  const hidden = reduceTopologyEditPresentationState(initial, {
    type: ACTIONS.VISIBILITY,
    layer: 'source',
    visible: false,
  });
  const faded = reduceTopologyEditPresentationState(hidden, {
    type: ACTIONS.OPACITY,
    layer: 'draft',
    opacity: 0.55,
  });
  const reset = reduceTopologyEditPresentationState(faded, { type: ACTIONS.RESET });
  assert.equal(hidden.sourceVisible, false);
  assert.equal(faded.draftOpacity, 0.55);
  assert.equal(reset.sourceVisible, DEFAULT_TOPOLOGY_EDIT_PRESENTATION_POLICY.sourceVisible);
  assert.equal(reset.draftOpacity, DEFAULT_TOPOLOGY_EDIT_PRESENTATION_POLICY.draftOpacity);
  assert.deepEqual(reset.basis, initial.basis);
});

test('invalid presentation values fail closed', () => {
  const initial = createTopologyEditPresentationState({ basis: completeBasis });
  assert.throws(
    () => reduceTopologyEditPresentationState(initial, { type: ACTIONS.OPACITY, layer: 'source', opacity: 2 }),
    /between 0 and 1/,
  );
  assert.throws(
    () => reduceTopologyEditPresentationState(initial, { type: ACTIONS.VISIBILITY, layer: 'ghost', visible: true }),
    /Unsupported presentation layer/,
  );
});

test('presentation runtime mutates only owned renderer groups', () => {
  const sourceMaterial = {};
  const draftMaterial = {};
  const sourceGroup = fakeGroup(sourceMaterial);
  const draftGroup = fakeGroup(draftMaterial);
  const runtime = new TopologyEditPresentationRuntime({ groups: { sourceGroup, draftGroup } });
  const state = createTopologyEditPresentationState({
    basis: completeBasis,
    sourceVisible: false,
    draftOpacity: 0.65,
  });
  runtime.apply(state);
  assert.equal(sourceGroup.visible, false);
  assert.equal(sourceMaterial.opacity, state.sourceOpacity);
  assert.equal(draftMaterial.opacity, 0.65);
  assert.equal(draftMaterial.transparent, true);
  assert.equal(draftMaterial.needsUpdate, true);
  runtime.destroy();
});

test('layer presentation supports material arrays', () => {
  const materials = [{}, {}];
  const group = fakeGroup(materials);
  applyTopologyEditLayerPresentation(group, { visible: true, opacity: 1 });
  assert.equal(group.visible, true);
  materials.forEach((material) => {
    assert.equal(material.opacity, 1);
    assert.equal(material.transparent, false);
  });
});

test('production controller consumes toolbar, runtime and explicit unavailable bases', async () => {
  const controller = await readFile(new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url), 'utf8');
  const toolbar = await readFile(new URL('../src/workspace/viewport-presentation/topology-edit-presentation-toolbar.js', import.meta.url), 'utf8');
  assert.match(controller, /new TopologyEditPresentationToolbar/);
  assert.match(controller, /new TopologyEditPresentationRuntime/);
  assert.match(controller, /presentationRuntime\?\.apply\(this\.presentationState\)/);
  assert.match(controller, /visualModelHash: null/);
  assert.match(controller, /scopeHash: null/);
  assert.match(toolbar, /Presentation policy information/);
  assert.match(toolbar, /state\.policy\.disclosure/);
  assert.match(toolbar, /Unavailable basis fields/);
});

function fakeGroup(material) {
  return {
    visible: true,
    traverse(visitor) {
      visitor({ material });
    },
  };
}
