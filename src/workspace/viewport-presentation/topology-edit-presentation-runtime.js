import { TOPOLOGY_EDIT_PRESENTATION_SCHEMA } from './topology-edit-presentation-contract.js';
import { topologyEditSectionBoxToPlaneEquations } from './topology-edit-section-model.js';
import { isTopologyEditCanonicalIdVisible } from './topology-edit-visibility-model.js';

const MATRIX_SIZE = 16;

export class TopologyEditPresentationRuntime {
  constructor(viewportBackend) {
    if (!viewportBackend?.groups) throw new TypeError('TopologyEditPresentationRuntime requires a viewport backend.');
    this.viewportBackend = viewportBackend;
    this.state = null;
  }

  apply(state) {
    assertState(state);
    this.state = state;
    applyLayer(this.viewportBackend.groups.sourceGroup, state.sourceVisible, state.sourceOpacity);
    applyLayer(this.viewportBackend.groups.draftGroup, state.draftVisible, state.draftOpacity);
    applyTopologyEditCanonicalVisibility(this.viewportBackend.groups.sourceGroup, state.canonicalVisibility);
    applyTopologyEditCanonicalVisibility(this.viewportBackend.groups.draftGroup, state.canonicalVisibility);
    applyTopologyEditSectionPresentation(this.viewportBackend, state.section);
    this.viewportBackend.invalidate?.('presentation-state');
    return state.presentationHash;
  }

  destroy() {
    if (!this.viewportBackend) return;
    clearTopologyEditSectionPresentation(this.viewportBackend);
    this.viewportBackend.invalidate?.('presentation-destroy');
    this.viewportBackend = null;
    this.state = null;
  }
}

export function applyTopologyEditLayerPresentation(group, options) {
  if (!group) throw new TypeError('A renderer group is required.');
  applyLayer(group, options.visible, options.opacity);
}

export function applyTopologyEditCanonicalVisibility(group, visibilityState) {
  if (!group) throw new TypeError('A renderer group is required.');
  group.traverse?.((object) => applyObjectVisibility(object, visibilityState));
}

export function applyTopologyEditSectionPresentation(viewportBackend, sectionState) {
  const planes = topologyEditSectionBoxToPlaneEquations(sectionState);
  if (typeof viewportBackend?.setPresentationSectionPlanes !== 'function') {
    if (planes.length) throw new TypeError('Viewport backend does not support section planes.');
    return 0;
  }
  return viewportBackend.setPresentationSectionPlanes(planes);
}

function clearTopologyEditSectionPresentation(viewportBackend) {
  viewportBackend.setPresentationSectionPlanes?.([]);
}

function applyLayer(group, visible, opacity) {
  group.visible = Boolean(visible);
  group.traverse?.((object) => applyObjectOpacity(object, opacity));
}

function applyObjectOpacity(object, opacity) {
  if (!object?.material) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach((material) => applyMaterialOpacity(material, opacity));
}

function applyMaterialOpacity(material, opacity) {
  material.opacity = opacity;
  material.transparent = opacity < 1;
  material.needsUpdate = true;
}

function applyObjectVisibility(object, visibilityState) {
  if (isInstancedObject(object)) {
    applyInstancedVisibility(object, visibilityState);
    return;
  }
  const canonicalId = object?.userData?.canonicalId;
  if (!canonicalId) return;
  object.visible = isTopologyEditCanonicalIdVisible(visibilityState, canonicalId);
}

function isInstancedObject(object) {
  return Array.isArray(object?.userData?.pickTable) && object?.instanceMatrix?.array;
}

function applyInstancedVisibility(object, visibilityState) {
  const pickTable = object.userData.pickTable;
  const current = object.instanceMatrix.array;
  const base = ensureBaseInstanceMatrices(object, current);
  const count = Math.min(pickTable.length, Math.floor(current.length / MATRIX_SIZE));
  for (let index = 0; index < count; index += 1) {
    const offset = index * MATRIX_SIZE;
    const visible = isTopologyEditCanonicalIdVisible(visibilityState, pickTable[index]);
    writeInstanceMatrix(current, base, offset, visible);
  }
  object.instanceMatrix.needsUpdate = true;
  object.computeBoundingSphere?.();
}

function ensureBaseInstanceMatrices(object, current) {
  const existing = object.userData.presentationBaseInstanceMatrices;
  if (existing?.length === current.length) return existing;
  const snapshot = Float32Array.from(current);
  object.userData.presentationBaseInstanceMatrices = snapshot;
  return snapshot;
}

function writeInstanceMatrix(current, base, offset, visible) {
  for (let index = 0; index < MATRIX_SIZE; index += 1) current[offset + index] = base[offset + index];
  if (visible) return;
  [0, 1, 2, 4, 5, 6, 8, 9, 10].forEach((index) => {
    current[offset + index] = 0;
  });
}

function assertState(state) {
  if (state?.schema !== TOPOLOGY_EDIT_PRESENTATION_SCHEMA) {
    throw new TypeError('A valid topology-edit presentation state is required.');
  }
}
