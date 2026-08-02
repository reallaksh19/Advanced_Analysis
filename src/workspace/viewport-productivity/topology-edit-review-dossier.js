import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA = 'TopologyEditReviewDossier.v1';

export function createTopologyEditReviewDossier(input = {}) {
  const bookmarks = sortedRows(input.bookmarks, bookmarkKey);
  const provenance = normalizeEvidence(input.provenance, 'entries', canonicalEntryKey);
  const comparison = normalizeEvidence(input.comparison, 'entries', canonicalEntryKey);
  const issueOverlay = normalizeEvidence(input.issueOverlay, 'entries', issueEntryKey);
  const inspection = optionalClone(input.inspection);
  const routeTrace = optionalClone(input.routeTrace);
  const visualDiagnostics = sortedRows(input.visualDiagnostics, stableKey);
  const basis = requiredClone(input.basis, 'basis');
  const camera = requiredClone(input.camera, 'camera');
  const presentationState = requiredClone(input.presentationState, 'presentationState');
  const selection = requiredClone(input.selection, 'selection');
  const coverageCanonicalIds = collectCoverageCanonicalIds({
    selection,
    bookmarks,
    provenance,
    comparison,
    issueOverlay,
    inspection,
    routeTrace,
  });
  const payload = {
    schema: TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA,
    basis,
    camera,
    presentationState,
    selection,
    bookmarks,
    provenance,
    comparison,
    issueOverlay,
    inspection,
    routeTrace,
    visualDiagnostics,
    coverageCanonicalIds,
    summary: dossierSummary({
      bookmarks,
      provenance,
      comparison,
      issueOverlay,
      inspection,
      routeTrace,
      visualDiagnostics,
      coverageCanonicalIds,
    }),
    evidenceHashes: evidenceHashes({
      provenance,
      comparison,
      issueOverlay,
      inspection,
      routeTrace,
      presentationState,
    }),
    authority: 'PORTABLE_DISPLAY_REVIEW_ARTIFACT',
    persistenceAuthorityChanged: false,
    auditExportAuthorityChanged: false,
    workspaceAuthorityChanged: false,
    calculationAuthorityChanged: false,
    releaseQualified: false,
    disclosure: 'This dossier is a portable display-review artifact. It is not topology draft persistence, governed audit export, workspace commit, calculation evidence, engineering certification, or release evidence.',
  };
  return deepFreeze({ ...payload, dossierHash: semanticHash(payload) });
}

export function assertTopologyEditReviewDossier(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA) {
    throw new TypeError(`Review dossier must use ${TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditReviewDossier(value);
  if (rebuilt.dossierHash !== value.dossierHash) {
    throw new Error('TopologyEditReviewDossier: dossier hash mismatch.');
  }
  return value;
}

export function topologyEditReviewDossierJson(value) {
  assertTopologyEditReviewDossier(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function topologyEditReviewDossierFilename(value) {
  assertTopologyEditReviewDossier(value);
  return `topology-edit-review-${value.dossierHash.slice(0, 16)}.json`;
}

export function collectCoverageCanonicalIds(input = {}) {
  const ids = new Set();
  addSelection(ids, input.selection);
  for (const bookmark of input.bookmarks ?? []) {
    addSelection(ids, bookmark.selection);
    addProvenance(ids, bookmark.provenance);
  }
  addProvenance(ids, input.provenance);
  addValues(ids, input.comparison?.changedCanonicalIds);
  for (const entry of input.issueOverlay?.entries ?? []) addValues(ids, entry.canonicalIds);
  addValues(ids, input.inspection?.canonicalIds);
  addValues(ids, input.routeTrace?.canonicalIds);
  return [...ids].sort();
}

function dossierSummary(input) {
  return {
    bookmarkCount: input.bookmarks.length,
    provenanceEntryCount: input.provenance?.entries?.length ?? 0,
    comparisonChangeCount: input.comparison?.entries?.length ?? 0,
    issueCount: input.issueOverlay?.entries?.length ?? 0,
    inspectionStatus: input.inspection?.status ?? 'UNAVAILABLE',
    routeStatus: input.routeTrace?.status ?? 'UNAVAILABLE',
    visualDiagnosticCount: input.visualDiagnostics.length,
    coverageCanonicalCount: input.coverageCanonicalIds.length,
  };
}

function evidenceHashes(input) {
  return {
    presentationHash: text(input.presentationState?.presentationHash),
    provenanceHash: text(input.provenance?.provenanceHash),
    comparisonHash: text(input.comparison?.comparisonHash),
    issueOverlayHash: text(input.issueOverlay?.overlayHash),
    inspectionHash: text(input.inspection?.inspectionHash),
    routeTraceHash: text(input.routeTrace?.routeTraceHash),
  };
}

function normalizeEvidence(value, collectionKey, keyBuilder) {
  if (!value || typeof value !== 'object') return null;
  const clone = structuredClone(value);
  if (Array.isArray(clone[collectionKey])) {
    clone[collectionKey] = [...clone[collectionKey]].sort((left, right) =>
      keyBuilder(left).localeCompare(keyBuilder(right)));
  }
  return clone;
}

function sortedRows(values, keyBuilder) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => structuredClone(value))
    .sort((left, right) => keyBuilder(left).localeCompare(keyBuilder(right)));
}

function requiredClone(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} is required.`);
  return structuredClone(value);
}
function optionalClone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : null;
}

function addSelection(ids, selection) {
  addValues(ids, selection?.nodeIds);
  addValues(ids, [selection?.edgeId]);
}
function addProvenance(ids, provenance) {
  for (const entry of provenance?.entries ?? []) addValues(ids, [entry.canonicalId]);
}
function addValues(ids, values) {
  for (const value of values ?? []) {
    const id = text(value);
    if (id) ids.add(id);
  }
}

function bookmarkKey(value) {
  return `${String(value?.sequence ?? '').padStart(12, '0')}:${text(value?.bookmarkId) ?? stableKey(value)}`;
}
function canonicalEntryKey(value) {
  return `${text(value?.canonicalId) ?? ''}:${text(value?.objectKind) ?? ''}:${stableKey(value)}`;
}
function issueEntryKey(value) {
  return `${text(value?.issueId) ?? ''}:${stableKey(value)}`;
}
function stableKey(value) {
  return semanticHash(value ?? null);
}
function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}
