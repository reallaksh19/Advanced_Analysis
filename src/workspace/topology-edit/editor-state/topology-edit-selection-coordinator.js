/** Coordinates canonical selection requests without acquiring topology authority. */
import { EVENT_TOPICS } from '../../../workspace/event-topics.js';
import { topologyEditEntityIdsForObject } from '../topology-edit-render-packet.js';
import {
  createTopologyEditSelectionChanged,
  assertTopologyEditSelectionRequest,
  TOPOLOGY_EDIT_SELECTION_EVENTS,
} from './topology-edit-selection-events.js';
import {
  createTopologyEditSelectionFromLegacy,
  topologyEditLegacySelection,
} from './topology-edit-selection-contract.js';

export class TopologyEditSelectionCoordinator {
  constructor({ store, eventBus, getTopology, onSelectionChanged = null }) {
    if (!store?.getState || !store?.subscribe) {
      throw new TypeError('TopologyEditSelectionCoordinator: Zustand store is required.');
    }
    if (!eventBus?.publish || !eventBus?.subscribe) {
      throw new TypeError('TopologyEditSelectionCoordinator: eventBus is required.');
    }
    if (typeof getTopology !== 'function') {
      throw new TypeError('TopologyEditSelectionCoordinator: getTopology is required.');
    }
    this.store = store;
    this.eventBus = eventBus;
    this.getTopology = getTopology;
    this.onSelectionChanged = onSelectionChanged;
    this.unsubscribeRequest = null;
    this.unsubscribeStore = null;
  }

  connect() {
    if (this.unsubscribeRequest || this.unsubscribeStore) return;
    this.unsubscribeRequest = this.eventBus.subscribe(
      TOPOLOGY_EDIT_SELECTION_EVENTS.REQUESTED,
      (payload) => this.handleRequest(payload),
    );
    this.unsubscribeStore = this.store.subscribe((state, previous) => {
      if (state.selection.selectionHash === previous.selection.selectionHash
        && state.dataset === previous.dataset) return;
      this.publishSelection(state.selection);
    });
    this.publishSelection(this.store.getState().selection);
  }

  disconnect() {
    this.unsubscribeRequest?.();
    this.unsubscribeStore?.();
    this.unsubscribeRequest = null;
    this.unsubscribeStore = null;
  }

  legacySelection() {
    return topologyEditLegacySelection(this.store.getState().selection);
  }

  applyLegacySelection(value, source = 'command') {
    const current = this.store.getState().selection;
    const normalized = createTopologyEditSelectionFromLegacy(
      value,
      source,
      current.revision,
    );
    return this.store.getState().actions.replaceSelection(
      normalized.canonicalIds,
      source,
      {
        primaryId: normalized.primaryId,
        anchorId: normalized.anchorId,
      },
    );
  }

  requestCanonical(action, canonicalIds, source, options = {}) {
    return this.store.getState().actions.applySelectionRequest({
      action,
      canonicalIds,
      source,
      ...options,
    });
  }

  selectPick(pick, event = {}) {
    if (!pick?.objectId) {
      return this.requestCanonical('CLEAR', [], 'viewport');
    }
    if (!['node', 'component', 'edge'].includes(pick.objectKind)) {
      return { disposition: 'IGNORED', selection: this.store.getState().selection };
    }
    const action = event.ctrlKey || event.metaKey
      ? 'TOGGLE'
      : event.shiftKey
        ? 'ADD'
        : 'REPLACE';
    return this.requestCanonical(action, [pick.objectId], 'viewport', {
      primaryId: pick.objectId,
      anchorId: action === 'REPLACE' ? pick.objectId : undefined,
    });
  }

  handleRequest(payload) {
    const request = assertTopologyEditSelectionRequest(payload);
    const canonicalIds = request.canonicalIds.length
      ? request.canonicalIds
      : request.workspaceEntityIds.flatMap((entityId) => (
        canonicalIdsForWorkspaceEntity(this.getTopology(), entityId)
      ));
    const current = this.store.getState().selection;
    const primaryId = request.primaryId
      || canonicalIdsForWorkspaceEntity(
        this.getTopology(),
        request.workspaceEntityIds.at(-1),
      ).at(-1)
      || canonicalIds.at(-1)
      || null;
    const anchorId = request.anchorId || (
      request.action === 'RANGE'
        ? current.anchorId || canonicalIds[0] || null
        : undefined
    );
    const normalizedRequest = {
      ...request,
      canonicalIds,
      primaryId,
      anchorId,
      orderedCanonicalIds: request.action === 'RANGE' ? canonicalIds : undefined,
    };
    if (request.action === 'RANGE') {
      return this.store.getState().actions.replaceSelection(
        canonicalIds,
        request.source,
        { primaryId, anchorId },
      );
    }
    return this.store.getState().actions.applySelectionRequest(normalizedRequest);
  }

  publishSelection(selection) {
    const topology = this.getTopology();
    const workspaceEntityIds = workspaceEntityIdsForSelection(topology, selection.canonicalIds);
    const primaryWorkspaceEntityId = workspaceEntityIdsForSelection(
      topology,
      selection.primaryId ? [selection.primaryId] : [],
    )[0] ?? null;
    const anchorWorkspaceEntityId = workspaceEntityIdsForSelection(
      topology,
      selection.anchorId ? [selection.anchorId] : [],
    )[0] ?? null;
    const state = this.store.getState();
    const payload = createTopologyEditSelectionChanged({
      selection,
      workspaceEntityIds,
      primaryWorkspaceEntityId,
      anchorWorkspaceEntityId,
      dataset: state.dataset,
    });
    this.eventBus.publish(TOPOLOGY_EDIT_SELECTION_EVENTS.CHANGED, payload);
    if (primaryWorkspaceEntityId) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: primaryWorkspaceEntityId,
        source: 'topology-edit-3d',
      });
    }
    this.onSelectionChanged?.(payload);
    return payload;
  }
}

export function canonicalIdsForWorkspaceEntity(topology, entityIdInput) {
  const entityId = String(entityIdInput ?? '').trim();
  if (!entityId || !topology) return [];
  const direct = [];
  for (const edge of topology.edges ?? []) {
    if (edge.componentKey === entityId || edge.sourceComponentKey === entityId
      || edge.sourceEntityIds?.includes?.(entityId)) direct.push(edge.id);
  }
  for (const junction of topology.junctions ?? []) {
    if (junction.componentKey === entityId || junction.sourceEntityIds?.includes?.(entityId)) {
      direct.push(junction.id);
    }
  }
  for (const support of topology.supports ?? []) {
    if (support.entityId === entityId || support.sourceEntityIds?.includes?.(entityId)) {
      direct.push(support.id);
    }
  }
  for (const collection of ['boundaries', 'rigids', 'bends']) {
    for (const row of topology[collection] ?? []) {
      if (row.entityId === entityId || row.componentKey === entityId
        || row.sourceEntityIds?.includes?.(entityId)) direct.push(row.id);
    }
  }
  if (direct.length) return [...new Set(direct)].sort();
  const nodes = [];
  for (const node of topology.nodes ?? []) {
    if ((node.portKeys ?? []).some((key) => String(key).startsWith(`${entityId}:`))) {
      nodes.push(node.id);
    }
  }
  return [...new Set(nodes)].sort();
}

export function workspaceEntityIdsForSelection(topology, canonicalIds = []) {
  if (!topology) return [];
  const result = new Set();
  canonicalIds.forEach((canonicalId) => {
    topologyEditEntityIdsForObject(topology, canonicalId).forEach((id) => result.add(id));
    for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
      const row = (topology[collection] ?? []).find((candidate) => candidate.id === canonicalId);
      if (row?.entityId) result.add(row.entityId);
      if (row?.componentKey) result.add(row.componentKey);
      (row?.sourceEntityIds ?? []).forEach((id) => result.add(id));
    }
  });
  return [...result].sort();
}
