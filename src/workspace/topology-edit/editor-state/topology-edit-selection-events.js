/** Authorized synchronous event contracts for cross-surface canonical selection. */
import { deepFreeze } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditCanonicalSelection,
  normalizeTopologyEditSelectionSource,
} from './topology-edit-selection-contract.js';

export const TOPOLOGY_EDIT_SELECTION_EVENTS = deepFreeze({
  REQUESTED: 'topologyEditSelection:requested',
  CHANGED: 'topologyEditSelection:changed',
});

const ACTIONS = new Set(['REPLACE', 'ADD', 'TOGGLE', 'RANGE', 'REMOVE', 'CLEAR']);

export function createTopologyEditSelectionRequest(input = {}) {
  const action = String(input.action ?? 'REPLACE').trim().toUpperCase();
  if (!ACTIONS.has(action)) {
    throw new RangeError(
      `TopologyEditSelectionEvent: unsupported request action ${action}.`,
    );
  }
  const material = {
    action,
    source: normalizeTopologyEditSelectionSource(input.source),
    canonicalIds: textArray(input.canonicalIds),
    workspaceEntityIds: textArray(input.workspaceEntityIds),
    primaryId: optionalText(input.primaryId),
    anchorId: optionalText(input.anchorId),
    expectedDatasetSessionVersion: optionalInteger(
      input.expectedDatasetSessionVersion,
      'expectedDatasetSessionVersion',
    ),
    expectedCanonicalHash: optionalText(input.expectedCanonicalHash),
    expectedSelectionRevision: optionalInteger(
      input.expectedSelectionRevision,
      'expectedSelectionRevision',
    ),
  };
  if (action !== 'CLEAR' && !material.canonicalIds.length
    && !material.workspaceEntityIds.length) {
    throw new RangeError(
      'TopologyEditSelectionEvent: non-clear requests require canonicalIds or workspaceEntityIds.',
    );
  }
  return deepFreeze(material);
}

export function assertTopologyEditSelectionRequest(value) {
  return createTopologyEditSelectionRequest(value);
}

export function createTopologyEditSelectionChanged(input = {}) {
  const selection = assertTopologyEditCanonicalSelection(input.selection);
  const material = {
    selection,
    workspaceEntityIds: textArray(input.workspaceEntityIds),
    primaryWorkspaceEntityId: optionalText(input.primaryWorkspaceEntityId),
    anchorWorkspaceEntityId: optionalText(input.anchorWorkspaceEntityId),
    dataset: datasetIdentity(input.dataset),
  };
  return deepFreeze(material);
}

export function assertTopologyEditSelectionChanged(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('TopologyEditSelectionEvent: changed payload must be an object.');
  }
  return createTopologyEditSelectionChanged(value);
}

function datasetIdentity(input = {}) {
  const sessionVersion = Number(input.sessionVersion ?? 0);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) {
    throw new RangeError(
      'TopologyEditSelectionEvent: dataset.sessionVersion must be non-negative.',
    );
  }
  return {
    sourceHash: optionalText(input.sourceHash),
    canonicalHash: optionalText(input.canonicalHash),
    sessionVersion,
  };
}

function textArray(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('TopologyEditSelectionEvent: ID collections must be arrays.');
  }
  return [...new Set(value.map((row) => {
    const text = String(row ?? '').trim();
    if (!text) throw new TypeError('TopologyEditSelectionEvent: IDs must be non-empty strings.');
    return text;
  }))];
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function optionalInteger(value, label) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(`TopologyEditSelectionEvent: ${label} must be non-negative.`);
  }
  return number;
}
