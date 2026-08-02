import { TOPOLOGY_EDIT_PRESENTATION_SCHEMA } from './topology-edit-presentation-contract.js';

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
    return state.presentationHash;
  }

  destroy() {
    this.viewportBackend = null;
    this.state = null;
  }
}

export function applyTopologyEditLayerPresentation(group, options) {
  if (!group) throw new TypeError('A renderer group is required.');
  applyLayer(group, options.visible, options.opacity);
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

function assertState(state) {
  if (state?.schema !== TOPOLOGY_EDIT_PRESENTATION_SCHEMA) {
    throw new TypeError('A valid topology-edit presentation state is required.');
  }
}
