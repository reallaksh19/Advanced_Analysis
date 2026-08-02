export const TOPOLOGY_EDIT_CANONICAL_VISIBILITY_SCHEMA =
  'TopologyEditCanonicalVisibility.v1';

export const CANONICAL_VISIBILITY_ACTIONS = Object.freeze({
  HIDE: 'HIDE_CANONICAL_IDS',
  ISOLATE: 'ISOLATE_CANONICAL_IDS',
  SHOW_ALL: 'SHOW_ALL_CANONICAL_IDS',
  RECONCILE: 'RECONCILE_CANONICAL_IDS',
});

export function createTopologyEditCanonicalVisibility(input = {}) {
  return deepFreeze({
    schema: TOPOLOGY_EDIT_CANONICAL_VISIBILITY_SCHEMA,
    hiddenCanonicalIds: normalizedIds(input.hiddenCanonicalIds),
    isolatedCanonicalIds: normalizedIds(input.isolatedCanonicalIds),
  });
}

export function reduceTopologyEditCanonicalVisibility(state, action = {}) {
  assertVisibilityState(state);
  switch (action.type) {
    case CANONICAL_VISIBILITY_ACTIONS.HIDE:
      return hideCanonicalIds(state, action.canonicalIds);
    case CANONICAL_VISIBILITY_ACTIONS.ISOLATE:
      return isolateCanonicalIds(state, action.canonicalIds);
    case CANONICAL_VISIBILITY_ACTIONS.SHOW_ALL:
      return createTopologyEditCanonicalVisibility();
    case CANONICAL_VISIBILITY_ACTIONS.RECONCILE:
      return reconcileCanonicalIds(state, action.canonicalIds);
    default:
      throw new Error(
        `Unknown canonical visibility action "${String(action.type)}".`,
      );
  }
}

export function isTopologyEditCanonicalIdVisible(state, canonicalId) {
  assertVisibilityState(state);
  const id = requiredId(canonicalId);
  const hidden = new Set(state.hiddenCanonicalIds);
  const isolated = new Set(state.isolatedCanonicalIds);
  if (hidden.has(id)) return false;
  return isolated.size === 0 || isolated.has(id);
}

export function topologyEditVisibilitySummary(state) {
  assertVisibilityState(state);
  return Object.freeze({
    hiddenCount: state.hiddenCanonicalIds.length,
    isolatedCount: state.isolatedCanonicalIds.length,
    mode: state.isolatedCanonicalIds.length ? 'ISOLATED' : 'ALL',
  });
}

function hideCanonicalIds(state, idsInput) {
  const ids = normalizedIds(idsInput);
  if (!ids.length) throw new TypeError('At least one canonical ID is required.');
  const hidden = normalizedIds([...state.hiddenCanonicalIds, ...ids]);
  return createTopologyEditCanonicalVisibility({
    hiddenCanonicalIds: hidden,
    isolatedCanonicalIds: state.isolatedCanonicalIds,
  });
}

function isolateCanonicalIds(state, idsInput) {
  const isolated = normalizedIds(idsInput);
  if (!isolated.length) throw new TypeError('At least one canonical ID is required.');
  const isolatedSet = new Set(isolated);
  return createTopologyEditCanonicalVisibility({
    hiddenCanonicalIds: state.hiddenCanonicalIds.filter(
      (id) => !isolatedSet.has(id),
    ),
    isolatedCanonicalIds: isolated,
  });
}

function reconcileCanonicalIds(state, idsInput) {
  const active = new Set(normalizedIds(idsInput));
  return createTopologyEditCanonicalVisibility({
    hiddenCanonicalIds: state.hiddenCanonicalIds.filter((id) => active.has(id)),
    isolatedCanonicalIds: state.isolatedCanonicalIds.filter((id) => active.has(id)),
  });
}

function normalizedIds(values) {
  if (values == null) return Object.freeze([]);
  if (!Array.isArray(values) && !(values instanceof Set)) {
    throw new TypeError('Canonical IDs must be supplied as an array or Set.');
  }
  return Object.freeze(
    [...new Set([...values].map(requiredId))].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function requiredId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new TypeError('Canonical ID must be non-empty.');
  return id;
}

function assertVisibilityState(state) {
  if (state?.schema !== TOPOLOGY_EDIT_CANONICAL_VISIBILITY_SCHEMA) {
    throw new TypeError('A valid canonical visibility state is required.');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
