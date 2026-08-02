import { semanticHash } from '../../core/shared-piping-model/index.js';

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
  disclosure: 'Source and draft visibility and opacity are display-only preferences. They do not modify canonical topology, engineering geometry, command authority, or exported data.',
});

const ACTIONS = Object.freeze({
  REBASE: 'REBASE_BASIS',
  RESET: 'RESET_PRESENTATION',
  VISIBILITY: 'SET_LAYER_VISIBILITY',
  OPACITY: 'SET_LAYER_OPACITY',
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
  const state = {
    schema: TOPOLOGY_EDIT_PRESENTATION_SCHEMA,
    basis,
    basisStatus: classifyTopologyEditPresentationBasis(basis, basis),
    policy,
    sourceVisible: input.sourceVisible ?? policy.sourceVisible,
    draftVisible: input.draftVisible ?? policy.draftVisible,
    sourceOpacity: normalizedOpacity(input.sourceOpacity ?? policy.sourceOpacity, 'sourceOpacity'),
    draftOpacity: normalizedOpacity(input.draftOpacity ?? policy.draftOpacity, 'draftOpacity'),
  };
  return finalizeState(state);
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
    default:
      throw new Error(`Unknown topology-edit presentation action "${String(action.type)}".`);
  }
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
  });
}

function setLayerVisibility(state, layer, visible) {
  const key = layerKey(layer, 'Visible');
  return finalizeState({ ...state, [key]: Boolean(visible) });
}

function setLayerOpacity(state, layer, opacity) {
  const key = layerKey(layer, 'Opacity');
  return finalizeState({ ...state, [key]: normalizedOpacity(opacity, key) });
}

function layerKey(layer, suffix) {
  if (layer !== 'source' && layer !== 'draft') throw new Error(`Unsupported presentation layer "${String(layer)}".`);
  return `${layer}${suffix}`;
}

function finalizeState(state) {
  const serializable = {
    schema: state.schema,
    basis: state.basis,
    basisStatus: state.basisStatus,
    policyHash: state.policy.policyHash,
    sourceVisible: state.sourceVisible,
    draftVisible: state.draftVisible,
    sourceOpacity: state.sourceOpacity,
    draftOpacity: state.draftOpacity,
  };
  return deepFreeze({ ...state, presentationHash: semanticHash(serializable) });
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
