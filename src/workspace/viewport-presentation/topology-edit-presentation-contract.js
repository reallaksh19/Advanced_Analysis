import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  CANONICAL_VISIBILITY_ACTIONS,
  createTopologyEditCanonicalVisibility,
  reduceTopologyEditCanonicalVisibility,
} from './topology-edit-visibility-model.js';
import {
  TOPOLOGY_EDIT_SECTION_ACTIONS,
  createTopologyEditSectionState,
  reduceTopologyEditSectionState,
} from './topology-edit-section-model.js';

export const TOPOLOGY_EDIT_PRESENTATION_SCHEMA = 'TopologyEditViewportPresentation.v1';
export const TOPOLOGY_EDIT_PRESENTATION_POLICY_SCHEMA = 'TopologyEditPresentationPolicy.v1';

export const PRESENTATION_BASIS_STATUS = Object.freeze({
  CURRENT: 'CURRENT',
  STALE: 'STALE_BASIS',
  INCOMPLETE: 'INCOMPLETE_BASIS',
});

export const DEFAULT_TOPOLOGY_EDIT_PRESENTATION_POLICY = Object.freeze({
  schema: TOPOLOGY_EDIT_PRESENTATION_POLICY_SCHEMA,
  sourceOpacity: 0.4,
  draftOpacity: 1,
  sourceVisible: true,
  draftVisible: true,
  authority: 'DISPLAY_ONLY_DEFAULT',
  disclosure: 'Source and draft visibility, opacity, hide, isolate, and section controls are display-only preferences. They do not modify canonical topology, engineering geometry, command authority, edit scope, or exported data.',
});

const ACTIONS = Object.freeze({
  REBASE: 'REBASE_BASIS',
  RESET: 'RESET_PRESENTATION',
  VISIBILITY: 'SET_LAYER_VISIBILITY',
  OPACITY: 'SET_LAYER_OPACITY',
  HIDE_IDS: CANONICAL_VISIBILITY_ACTIONS.HIDE,
  ISOLATE_IDS: CANONICAL_VISIBILITY_ACTIONS.ISOLATE,
  SHOW_ALL_IDS: CANONICAL_VISIBILITY_ACTIONS.SHOW_ALL,
  RECONCILE_IDS: CANONICAL_VISIBILITY_ACTIONS.RECONCILE,
  SET_SECTION_BOX: TOPOLOGY_EDIT_SECTION_ACTIONS.SET_BOX,
  CLEAR_SECTION_BOX: TOPOLOGY_EDIT_SECTION_ACTIONS.CLEAR,
});

export function createTopologyEditPresentationPolicy(input = DEFAULT_TOPOLOGY_EDIT_PRESENTATION_POLICY) {
  const sourceOpacity = normalizedOpacity(input.sourceOpacity, 'sourceOpacity');
  const draftOpacity = normalizedOpacity(input.draftOpacity, 'draftOpacity');
  const disclosure = requiredText(input.disclosure, 'disclosure');
  const policy = {
    schema: TOPOLOGY_EDIT_PRESENTATION_POLICY_SCHEMA,
    sourceOpacity,
    draftOpacity,
    sourceVisible: input.sourceVisible !== false,
    draftVisible: input.draftVisible !== false,
    authority: 'DISPLAY_ONLY_DEFAULT',
    disclosure,
  };
  return deepFreeze({ ...policy, policyHash: semanticHash(policy) });
}

export function createTopologyEditPresentationBasis(input = {}) {
  return deepFreeze({
    sourceHash: optionalText(input.sourceHash),
    baseCanonicalHash: optionalText(input.baseCanonicalHash),
    draftCanonicalHash: optionalText(input.draftCanonicalHash),
    visualModelHash: optionalText(input.visualModelHash),
    scopeHash: optionalText(input.scopeHash),
  });
}

export function createTopologyEditPresentationState(input = {}) {
  const policy = createTopologyEditPresentationPolicy(input.policy);
  const basis = createTopologyEditPresentationBasis(input.basis);
  return finalizeState({
    schema: TOPOLOGY_EDIT_PRESENTATION_SCHEMA,
    basis,
    basisStatus: classifyTopologyEditPresentationBasis(basis, basis),
    policy,
    sourceVisible: input.sourceVisible ?? policy.sourceVisible,
    draftVisible: input.draftVisible ?? policy.draftVisible,
    sourceOpacity: normalizedOpacity(input.sourceOpacity ?? policy.sourceOpacity, 'sourceOpacity'),
    draftOpacity: normalizedOpacity(input.draftOpacity ?? policy.draftOpacity, 'draftOpacity'),
    canonicalVisibility: createTopologyEditCanonicalVisibility(input.canonicalVisibility),
    section: createTopologyEditSectionState(input.section),
  });
}

export function reduceTopologyEditPresentationState(state, action = {}) {
  assertPresentationState(state);
  switch (action.type) {
    case ACTIONS.REBASE:
      return rebaseState(state, action.basis);
    case ACTIONS.RESET:
      return resetState(state);
    case ACTIONS.VISIBILITY:
      return setLayerVisibility(state, action.layer, action.visible);
    case ACTIONS.OPACITY:
      return setLayerOpacity(state, action.layer, action.opacity);
    case ACTIONS.HIDE_IDS:
    case ACTIONS.ISOLATE_IDS:
    case ACTIONS.SHOW_ALL_IDS:
    case ACTIONS.RECONCILE_IDS:
      return updateCanonicalVisibility(state, action);
    case ACTIONS.SET_SECTION_BOX:
    case ACTIONS.CLEAR_SECTION_BOX:
      return updateSection(state, action);
    default:
      throw new Error(`Unknown topology-edit presentation action "${String(action.type)}".`);
  }
}

export function serializeTopologyEditPresentationState(state) {
  assertPresentationState(state);
  return JSON.stringify(serializableState(state));
}

export function parseTopologyEditPresentationState(serialized) {
  const input = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  if (input?.schema !== TOPOLOGY_EDIT_PRESENTATION_SCHEMA) {
    throw new TypeError('Serialized topology-edit presentation state has an invalid schema.');
  }
  return createTopologyEditPresentationState(input);
}

export function classifyTopologyEditPresentationBasis(savedBasis, currentBasis) {
  const saved = createTopologyEditPresentationBasis(savedBasis);
  const current = createTopologyEditPresentationBasis(currentBasis);
  if (Object.values(current).some((value) => value === null)) return PRESENTATION_BASIS_STATUS.INCOMPLETE;
  return basisEquals(saved, current) ? PRESENTATION_BASIS_STATUS.CURRENT : PRESENTATION_BASIS_STATUS.STALE;
}

export function topologyEditPresentationActions() {
  return ACTIONS;
}

function rebaseState(state, basisInput) {
  const basis = createTopologyEditPresentationBasis(basisInput);
  return finalizeState({ ...state, basis, basisStatus: classifyTopologyEditPresentationBasis(basis, basis) });
}

function resetState(state) {
  return finalizeState({
    ...state,
    sourceVisible: state.policy.sourceVisible,
    draftVisible: state.policy.draftVisible,
    sourceOpacity: state.policy.sourceOpacity,
    draftOpacity: state.policy.draftOpacity,
    canonicalVisibility: createTopologyEditCanonicalVisibility(),
    section: createTopologyEditSectionState(),
  });
}

function setLayerVisibility(state, layer, visible) {
  return finalizeState({ ...state, [layerKey(layer, 'Visible')]: Boolean(visible) });
}

function setLayerOpacity(state, layer, opacity) {
  const key = layerKey(layer, 'Opacity');
  return finalizeState({ ...state, [key]: normalizedOpacity(opacity, key) });
}

function updateCanonicalVisibility(state, action) {
  return finalizeState({
    ...state,
    canonicalVisibility: reduceTopologyEditCanonicalVisibility(state.canonicalVisibility, action),
  });
}

function updateSection(state, action) {
  return finalizeState({
    ...state,
    section: reduceTopologyEditSectionState(state.section, action),
  });
}

function layerKey(layer, suffix) {
  if (layer !== 'source' && layer !== 'draft') throw new Error(`Unsupported presentation layer "${String(layer)}".`);
  return `${layer}${suffix}`;
}

function finalizeState(state) {
  const serializable = serializableState(state);
  return deepFreeze({ ...state, presentationHash: semanticHash(serializable) });
}

function serializableState(state) {
  return {
    schema: state.schema,
    basis: state.basis,
    basisStatus: state.basisStatus,
    policy: policyInput(state.policy),
    sourceVisible: state.sourceVisible,
    draftVisible: state.draftVisible,
    sourceOpacity: state.sourceOpacity,
    draftOpacity: state.draftOpacity,
    canonicalVisibility: state.canonicalVisibility,
    section: state.section,
  };
}

function policyInput(policy) {
  return {
    sourceOpacity: policy.sourceOpacity,
    draftOpacity: policy.draftOpacity,
    sourceVisible: policy.sourceVisible,
    draftVisible: policy.draftVisible,
    disclosure: policy.disclosure,
  };
}

function assertPresentationState(state) {
  if (state?.schema !== TOPOLOGY_EDIT_PRESENTATION_SCHEMA) {
    throw new TypeError('A valid topology-edit presentation state is required.');
  }
}

function normalizedOpacity(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
  return number;
}

function basisEquals(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function requiredText(value, name) {
  const text = optionalText(value);
  if (!text) throw new TypeError(`${name} is required.`);
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
