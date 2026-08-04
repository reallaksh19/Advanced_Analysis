/** Zustand-owned UI and interaction state for the production 3D Edit workspace. */
import { createStore } from '../../../vendor/zustand-vanilla.js';
import { deepFreeze } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditCanonicalSelection,
  createTopologyEditCanonicalSelection,
  normalizeTopologyEditSelectionSource,
  sameTopologyEditSelectionSemantics,
} from './topology-edit-selection-contract.js';
import {
  normalizeTopologyEditCanonicalId,
  normalizeTopologyEditCanonicalIds,
} from '../professional/topology-edit-canonical-id.js';

const DEFAULT_SNAP_KINDS = deepFreeze([
  'NODE', 'PORT', 'CENTERLINE', 'MIDPOINT', 'GRID', 'ORTHOGONAL', 'COLLINEAR',
]);

export function createTopologyEditEditorStore(input = {}) {
  const initialSelection = createTopologyEditCanonicalSelection(
    input.selection ?? {},
  );
  return createStore((set, get) => {
    const commitSelection = (candidateInput) => {
      const current = assertTopologyEditCanonicalSelection(get().selection);
      const provisional = createTopologyEditCanonicalSelection({
        ...candidateInput,
        revision: current.revision,
      });
      const semanticChange = !sameTopologyEditSelectionSemantics(
        current,
        provisional,
      );
      const next = createTopologyEditCanonicalSelection({
        ...candidateInput,
        revision: semanticChange ? current.revision + 1 : current.revision,
      });
      if (next.selectionHash !== current.selectionHash) set({ selection: next });
      return deepFreeze({
        disposition: semanticChange ? 'CHANGED' : 'UNCHANGED',
        selection: next,
      });
    };

    const action = (source, builder) => {
      const current = assertTopologyEditCanonicalSelection(get().selection);
      return commitSelection(builder(current, normalizeTopologyEditSelectionSource(source)));
    };

    return {
      dataset: datasetIdentity(input.dataset),
      selection: initialSelection,
      interaction: deepFreeze({
        mode: 'IDLE',
        interactionId: null,
        dragSession: null,
        pendingRequestId: null,
      }),
      snapping: deepFreeze({
        activeResult: null,
        candidateCount: 0,
        enabledKinds: DEFAULT_SNAP_KINDS,
        cycleIndex: 0,
      }),
      componentHud: deepFreeze({
        operation: null,
        draft: null,
        validationFindings: [],
        previewReceipt: null,
      }),
      tree: deepFreeze({
        focusedCanonicalId: null,
        expandedBranchIds: [],
        contextMenu: null,
      }),
      presentation: deepFreeze({ revision: 0 }),
      preferences: deepFreeze({
        enabledSnapKinds: DEFAULT_SNAP_KINDS,
        gridSpacingMm: 100,
        coordinateSpace: 'WORLD',
        gizmoSize: 1,
        lastComponentFamily: null,
      }),
      actions: {
        replaceDatasetIdentity(nextIdentity, options = {}) {
          const current = get().dataset;
          const next = datasetIdentity(nextIdentity);
          const replacement = current.sourceHash !== next.sourceHash
            || current.sessionVersion !== next.sessionVersion;
          const changed = replacement || current.canonicalHash !== next.canonicalHash;
          if (changed) set({ dataset: next });
          if (replacement) {
            if (options.crosswalk) {
              return get().actions.reconcileSelection(
                { replacedIds: options.crosswalk },
                'command',
              );
            }
            return get().actions.clearSelection('command');
          }
          return deepFreeze({ disposition: 'UNCHANGED', selection: get().selection });
        },

        updateCanonicalIdentity(canonicalHash, canonicalIds = null, receipt = null) {
          const current = get().dataset;
          const next = datasetIdentity({ ...current, canonicalHash });
          if (next.canonicalHash !== current.canonicalHash) set({ dataset: next });
          if (receipt) get().actions.reconcileSelection(receipt, 'command');
          if (canonicalIds) {
            return get().actions.reconcileCanonicalIds(
              canonicalIds,
              get().selection.source,
            );
          }
          return deepFreeze({ disposition: 'UNCHANGED', selection: get().selection });
        },

        replaceSelection(ids, source, options = {}) {
          const normalized = normalizeTopologyEditCanonicalIds(ids, 'canonicalIds');
          const primaryId = selectedOption(options.primaryId, normalized)
            ?? normalized.at(-1) ?? null;
          const anchorId = selectedOption(options.anchorId, normalized)
            ?? normalized[0] ?? null;
          return action(source, () => ({
            canonicalIds: normalized,
            primaryId,
            anchorId,
            source,
          }));
        },

        addSelection(ids, source, options = {}) {
          const additions = normalizeTopologyEditCanonicalIds(ids, 'canonicalIds');
          return action(source, (current) => {
            const canonicalIds = normalizeTopologyEditCanonicalIds(
              [...current.canonicalIds, ...additions],
              'canonicalIds',
            );
            return {
              canonicalIds,
              primaryId: selectedOption(options.primaryId, canonicalIds)
                ?? additions.at(-1)
                ?? current.primaryId,
              anchorId: selectedOption(options.anchorId, canonicalIds)
                ?? current.anchorId
                ?? additions[0]
                ?? null,
              source,
            };
          });
        },

        toggleSelection(id, source) {
          const canonicalId = normalizeTopologyEditCanonicalId(id);
          return action(source, (current) => {
            const selected = current.canonicalIds.includes(canonicalId);
            const canonicalIds = selected
              ? current.canonicalIds.filter((value) => value !== canonicalId)
              : normalizeTopologyEditCanonicalIds(
                [...current.canonicalIds, canonicalId],
                'canonicalIds',
              );
            return {
              canonicalIds,
              primaryId: selected
                ? fallbackSelected(current.primaryId, canonicalIds)
                : canonicalId,
              anchorId: selected
                ? fallbackSelected(current.anchorId, canonicalIds)
                : current.anchorId ?? canonicalId,
              source,
            };
          });
        },

        rangeSelection(anchorId, targetId, source, orderedCanonicalIds) {
          const ordered = orderedUniqueCanonicalIds(orderedCanonicalIds);
          const anchor = normalizeTopologyEditCanonicalId(anchorId, 'anchorId');
          const target = normalizeTopologyEditCanonicalId(targetId, 'targetId');
          const from = ordered.indexOf(anchor);
          const to = ordered.indexOf(target);
          if (from < 0 || to < 0) {
            throw new RangeError(
              'TopologyEditEditorStore: range endpoints must exist in orderedCanonicalIds.',
            );
          }
          const start = Math.min(from, to);
          const end = Math.max(from, to);
          return get().actions.replaceSelection(
            ordered.slice(start, end + 1),
            source,
            { primaryId: target, anchorId: anchor },
          );
        },

        removeSelection(ids, source) {
          const removals = new Set(normalizeTopologyEditCanonicalIds(ids, 'canonicalIds'));
          return action(source, (current) => {
            const canonicalIds = current.canonicalIds.filter((id) => !removals.has(id));
            return {
              canonicalIds,
              primaryId: fallbackSelected(current.primaryId, canonicalIds),
              anchorId: fallbackSelected(current.anchorId, canonicalIds),
              source,
            };
          });
        },

        clearSelection(source) {
          return action(source, () => ({
            canonicalIds: [],
            primaryId: null,
            anchorId: null,
            source,
          }));
        },

        reconcileSelection(receipt = {}, source = 'command') {
          const identity = receipt.replacementIdentityMap
            ?? receipt.identityMap
            ?? receipt;
          const replacements = identity.replacedIds ?? {};
          const removed = new Set(identity.removedIds ?? []);
          return action(source, (current) => {
            const remap = (id) => {
              const replacement = replacements[id];
              if (replacement) return normalizeTopologyEditCanonicalId(replacement);
              return removed.has(id) ? null : id;
            };
            const canonicalIds = normalizeTopologyEditCanonicalIds(
              current.canonicalIds.map(remap).filter(Boolean),
              'canonicalIds',
            );
            return {
              canonicalIds,
              primaryId: fallbackSelected(remap(current.primaryId), canonicalIds),
              anchorId: fallbackSelected(remap(current.anchorId), canonicalIds),
              source,
            };
          });
        },

        reconcileCanonicalIds(ids, source = 'command') {
          const valid = new Set(normalizeTopologyEditCanonicalIds(ids, 'canonicalIds'));
          return action(source, (current) => {
            const canonicalIds = current.canonicalIds.filter((id) => valid.has(id));
            return {
              canonicalIds,
              primaryId: fallbackSelected(current.primaryId, canonicalIds),
              anchorId: fallbackSelected(current.anchorId, canonicalIds),
              source,
            };
          });
        },

        applySelectionRequest(request = {}) {
          const dataset = get().dataset;
          const selection = get().selection;
          const staleFields = [];
          if (
            request.expectedDatasetSessionVersion !== undefined
            && request.expectedDatasetSessionVersion !== null
            && request.expectedDatasetSessionVersion !== dataset.sessionVersion
          ) staleFields.push('datasetSessionVersion');
          if (
            request.expectedCanonicalHash !== undefined
            && request.expectedCanonicalHash !== null
            && request.expectedCanonicalHash !== dataset.canonicalHash
          ) staleFields.push('canonicalHash');
          if (
            request.expectedSelectionRevision !== undefined
            && request.expectedSelectionRevision !== null
            && request.expectedSelectionRevision !== selection.revision
          ) staleFields.push('selectionRevision');
          if (staleFields.length) {
            return deepFreeze({
              disposition: 'STALE',
              staleFields,
              selection,
            });
          }
          const source = request.source ?? 'command';
          const ids = request.canonicalIds ?? [];
          switch (String(request.action ?? 'REPLACE').toUpperCase()) {
            case 'REPLACE': return get().actions.replaceSelection(ids, source, request);
            case 'ADD': return get().actions.addSelection(ids, source, request);
            case 'TOGGLE': return get().actions.toggleSelection(ids[0], source);
            case 'REMOVE': return get().actions.removeSelection(ids, source);
            case 'CLEAR': return get().actions.clearSelection(source);
            case 'RANGE': return get().actions.rangeSelection(
              request.anchorId,
              request.primaryId,
              source,
              request.orderedCanonicalIds,
            );
            default: throw new RangeError(
              `TopologyEditEditorStore: unsupported selection action ${request.action}.`,
            );
          }
        },
      },
    };
  });
}

function datasetIdentity(input = {}) {
  const sessionVersion = Number(input.sessionVersion ?? 0);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) {
    throw new RangeError(
      'TopologyEditEditorStore: dataset.sessionVersion must be a non-negative integer.',
    );
  }
  return deepFreeze({
    sourceHash: optionalText(input.sourceHash),
    canonicalHash: optionalText(input.canonicalHash),
    sessionVersion,
  });
}

function selectedOption(value, selectedIds) {
  if (value === null || value === undefined || value === '') return null;
  const id = normalizeTopologyEditCanonicalId(value);
  if (!selectedIds.includes(id)) {
    throw new RangeError(
      'TopologyEditEditorStore: selected option must be included in canonicalIds.',
    );
  }
  return id;
}

function fallbackSelected(value, selectedIds) {
  return value && selectedIds.includes(value) ? value : selectedIds.at(-1) ?? null;
}

function orderedUniqueCanonicalIds(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      'TopologyEditEditorStore: orderedCanonicalIds must be an array.',
    );
  }
  const result = [];
  const seen = new Set();
  value.forEach((row, index) => {
    const id = normalizeTopologyEditCanonicalId(row, `orderedCanonicalIds[${index}]`);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  });
  return result;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}
