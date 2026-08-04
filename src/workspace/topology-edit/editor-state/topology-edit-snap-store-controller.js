import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  acceptTopologyEditSnapResult,
  assertTopologyEditSnapResult,
  TOPOLOGY_EDIT_SNAP_KINDS,
} from '../../viewport-interaction/topology-edit-snap-contract.js';

const DEFAULT_PREFERENCES = deepFreeze({
  enabledSnapKinds: TOPOLOGY_EDIT_SNAP_KINDS,
  snapPriorityKinds: TOPOLOGY_EDIT_SNAP_KINDS,
  gridSpacingMm: 100,
  snapAcquireRadiusPx: 10,
  snapReleaseRadiusPx: 14,
});

/**
 * Owns compact Zustand snap summaries. Per-pointer rays, candidate arrays,
 * camera snapshots, indices and full transient results remain in the runtime.
 */
export class TopologyEditSnapStoreController {
  constructor(store) {
    if (!store?.getState || !store?.setState) {
      throw new TypeError('TopologyEditSnapStoreController requires a Zustand store.');
    }
    this.store = store;
    this.lastSummaryHash = null;
    this.ensureDefaults();
  }

  ensureDefaults() {
    const state = this.store.getState();
    const preferences = normalizePreferences({
      ...DEFAULT_PREFERENCES,
      ...state.preferences,
    });
    const snapping = snapState({
      ...state.snapping,
      enabledKinds: preferences.enabledSnapKinds,
    });
    this.store.setState({ preferences, snapping });
    return preferences;
  }

  preferences() {
    return normalizePreferences(this.store.getState().preferences);
  }

  updatePreferences(input = {}) {
    const current = this.preferences();
    const preferences = normalizePreferences({ ...current, ...input });
    const currentSnapping = this.store.getState().snapping;
    this.store.setState({
      preferences,
      snapping: snapState({
        ...currentSnapping,
        enabledKinds: preferences.enabledSnapKinds,
        activeResult: null,
        candidateCount: 0,
        cycleIndex: 0,
      }),
    });
    this.lastSummaryHash = null;
    return preferences;
  }

  beginInteraction(interactionId) {
    const id = requiredText(interactionId, 'interactionId');
    const state = this.store.getState();
    this.store.setState({
      interaction: deepFreeze({
        ...state.interaction,
        mode: 'DRAGGING_GIZMO',
        interactionId: id,
        pendingRequestId: null,
      }),
      snapping: snapState({
        ...state.snapping,
        activeResult: null,
        candidateCount: 0,
        cycleIndex: 0,
      }),
    });
    this.lastSummaryHash = null;
  }

  beginQuery({ interactionId, queryId }) {
    const state = this.store.getState();
    if (state.interaction.interactionId !== interactionId) {
      return deepFreeze({ disposition: 'STALE_INTERACTION' });
    }
    this.store.setState({
      interaction: deepFreeze({
        ...state.interaction,
        pendingRequestId: requiredText(queryId, 'queryId'),
      }),
    });
    return deepFreeze({ disposition: 'ACCEPTED' });
  }

  applyResult(resultInput, identity) {
    const result = assertTopologyEditSnapResult(resultInput);
    const accepted = acceptTopologyEditSnapResult(result, identity);
    if (accepted.disposition !== 'ACCEPTED') return accepted;
    const state = this.store.getState();
    if (state.interaction.pendingRequestId !== result.queryId) {
      return deepFreeze({
        disposition: 'STALE',
        staleFields: ['pendingRequestId'],
        result: null,
      });
    }
    const summaryHash = semanticHash({
      status: result.status,
      candidateId: result.candidateId,
      candidateCount: result.candidateCount,
      candidateSetHash: result.candidateSetHash,
      cycleIndex: result.cycleIndex,
      retainedByHysteresis: result.retainedByHysteresis,
    });
    if (summaryHash === this.lastSummaryHash) {
      return deepFreeze({ disposition: 'UNCHANGED', result });
    }
    this.lastSummaryHash = summaryHash;
    this.store.setState({
      snapping: snapState({
        ...state.snapping,
        activeResult: result.status === 'RESOLVED' ? result : null,
        candidateCount: result.candidateCount,
        cycleIndex: result.cycleIndex,
      }),
    });
    return deepFreeze({ disposition: 'APPLIED', result });
  }

  cycle(direction = 1) {
    const state = this.store.getState();
    const count = state.snapping.candidateCount;
    if (!(count > 1)) return state.snapping.cycleIndex;
    const delta = Number(direction) < 0 ? -1 : 1;
    const cycleIndex = (state.snapping.cycleIndex + delta + count) % count;
    this.store.setState({
      snapping: snapState({ ...state.snapping, cycleIndex }),
    });
    this.lastSummaryHash = null;
    return cycleIndex;
  }

  endInteraction() {
    const state = this.store.getState();
    this.store.setState({
      interaction: deepFreeze({
        ...state.interaction,
        mode: 'PREVIEW_READY',
        interactionId: null,
        pendingRequestId: null,
      }),
    });
  }

  clear(mode = 'IDLE') {
    const state = this.store.getState();
    this.store.setState({
      interaction: deepFreeze({
        ...state.interaction,
        mode,
        interactionId: null,
        pendingRequestId: null,
      }),
      snapping: snapState({
        ...state.snapping,
        activeResult: null,
        candidateCount: 0,
        cycleIndex: 0,
      }),
    });
    this.lastSummaryHash = null;
  }
}

export function normalizeTopologyEditSnapPreferences(input = {}) {
  return normalizePreferences(input);
}

function normalizePreferences(input = {}) {
  const enabledSnapKinds = kindArray(
    input.enabledSnapKinds ?? DEFAULT_PREFERENCES.enabledSnapKinds,
    'enabledSnapKinds',
  );
  const snapPriorityKinds = kindArray(
    input.snapPriorityKinds ?? enabledSnapKinds,
    'snapPriorityKinds',
  );
  for (const kind of enabledSnapKinds) {
    if (!snapPriorityKinds.includes(kind)) {
      throw new RangeError(`snapPriorityKinds must include enabled kind ${kind}.`);
    }
  }
  const snapAcquireRadiusPx = positive(
    input.snapAcquireRadiusPx ?? DEFAULT_PREFERENCES.snapAcquireRadiusPx,
    'snapAcquireRadiusPx',
  );
  const snapReleaseRadiusPx = positive(
    input.snapReleaseRadiusPx ?? DEFAULT_PREFERENCES.snapReleaseRadiusPx,
    'snapReleaseRadiusPx',
  );
  if (snapReleaseRadiusPx < snapAcquireRadiusPx) {
    throw new RangeError('snapReleaseRadiusPx must be at least snapAcquireRadiusPx.');
  }
  return deepFreeze({
    ...input,
    enabledSnapKinds,
    snapPriorityKinds,
    gridSpacingMm: positive(
      input.gridSpacingMm ?? DEFAULT_PREFERENCES.gridSpacingMm,
      'gridSpacingMm',
    ),
    snapAcquireRadiusPx,
    snapReleaseRadiusPx,
  });
}

function snapState(input = {}) {
  return deepFreeze({
    activeResult: input.activeResult ?? null,
    candidateCount: nonNegativeInteger(input.candidateCount ?? 0, 'candidateCount'),
    enabledKinds: kindArray(
      input.enabledKinds ?? DEFAULT_PREFERENCES.enabledSnapKinds,
      'enabledKinds',
    ),
    cycleIndex: nonNegativeInteger(input.cycleIndex ?? 0, 'cycleIndex'),
  });
}

function kindArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const allowed = new Set(TOPOLOGY_EDIT_SNAP_KINDS);
  const result = [];
  const seen = new Set();
  value.forEach((row, index) => {
    const kind = String(row ?? '').trim().toUpperCase();
    if (!allowed.has(kind)) {
      throw new RangeError(`${label}[${index}] is not a supported snap kind.`);
    }
    if (!seen.has(kind)) {
      seen.add(kind);
      result.push(kind);
    }
  });
  if (!result.length) throw new RangeError(`${label} must not be empty.`);
  return deepFreeze(result);
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return number;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}
