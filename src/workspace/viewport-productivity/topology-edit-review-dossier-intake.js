import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { classifyReviewBasis } from './topology-edit-review-bookmark.js';
import {
  assertTopologyEditReviewDossier,
  TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA,
} from './topology-edit-review-dossier.js';

export const TOPOLOGY_EDIT_REVIEW_DOSSIER_INTAKE_SCHEMA =
  'TopologyEditReviewDossierIntake.v1';
export const TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES = 5 * 1024 * 1024;

const EVIDENCE_KEYS = Object.freeze([
  'presentationHash',
  'provenanceHash',
  'comparisonHash',
  'issueOverlayHash',
  'inspectionHash',
  'routeTraceHash',
]);

export function parseTopologyEditReviewDossierJson(
  text,
  { byteLength = null, maxBytes = TOPOLOGY_EDIT_REVIEW_DOSSIER_MAX_BYTES } = {},
) {
  if (typeof text !== 'string') {
    throw new TypeError('Review dossier JSON text is required.');
  }
  const limit = positiveInteger(maxBytes, 'maxBytes');
  const bytes = byteLength === null ? utf8Length(text) : nonNegativeInteger(byteLength, 'byteLength');
  if (bytes > limit) {
    throw new RangeError(`Review dossier exceeds the ${limit}-byte intake limit.`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(
      `Review dossier JSON is malformed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertTopologyEditReviewDossier(value);
  return deepFreeze(structuredClone(value));
}

export function reconcileTopologyEditReviewDossier({
  dossier,
  currentBasis,
  canonicalTopology,
  currentEvidenceHashes = {},
} = {}) {
  assertTopologyEditReviewDossier(dossier);
  if (!currentBasis || typeof currentBasis !== 'object') {
    throw new TypeError('Current review basis is required.');
  }
  if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
    throw new TypeError('Current canonical topology nodes and edges are required.');
  }

  const basisStatus = classifyReviewBasis(dossier.basis, currentBasis);
  const currentIds = collectCurrentCanonicalIds(canonicalTopology);
  const requestedCanonicalIds = normalizedIds(dossier.coverageCanonicalIds);
  const availableCanonicalIds = requestedCanonicalIds.filter((id) => currentIds.has(id));
  const missingCanonicalIds = requestedCanonicalIds.filter((id) => !currentIds.has(id));
  const coverageStatus = classifyCoverage(
    requestedCanonicalIds.length,
    availableCanonicalIds.length,
    missingCanonicalIds.length,
  );
  const evidenceComparisons = compareEvidenceHashes(
    dossier.evidenceHashes,
    currentEvidenceHashes,
  );
  const mismatchedEvidenceKeys = evidenceComparisons
    .filter((row) => row.status === 'MISMATCH')
    .map((row) => row.key);
  const unavailableCurrentEvidenceKeys = evidenceComparisons
    .filter((row) => row.status === 'CURRENT_UNAVAILABLE')
    .map((row) => row.key);
  const viewpointReplayEligible = basisStatus === 'CURRENT'
    && missingCanonicalIds.length === 0;

  const payload = {
    schema: TOPOLOGY_EDIT_REVIEW_DOSSIER_INTAKE_SCHEMA,
    dossierSchema: TOPOLOGY_EDIT_REVIEW_DOSSIER_SCHEMA,
    dossierHash: dossier.dossierHash,
    basisStatus,
    coverageStatus,
    requestedCanonicalIds,
    availableCanonicalIds,
    missingCanonicalIds,
    evidenceComparisons,
    mismatchedEvidenceKeys,
    unavailableCurrentEvidenceKeys,
    viewpointReplayEligible,
    summary: {
      requestedCanonicalCount: requestedCanonicalIds.length,
      availableCanonicalCount: availableCanonicalIds.length,
      missingCanonicalCount: missingCanonicalIds.length,
      evidenceMatchCount: evidenceComparisons.filter((row) => row.status === 'MATCH').length,
      evidenceMismatchCount: mismatchedEvidenceKeys.length,
      evidenceUnavailableCount: unavailableCurrentEvidenceKeys.length,
    },
    authority: 'DISPLAY_REVIEW_INTAKE_ONLY',
    topologyAuthorityChanged: false,
    persistenceAuthorityChanged: false,
    auditExportAuthorityChanged: false,
    workspaceAuthorityChanged: false,
    calculationAuthorityChanged: false,
    releaseQualified: false,
    disclosure: 'Imported dossier evidence is review-only. Integrity and basis reconciliation do not establish engineering correctness, governed audit status, workspace authority, or release readiness.',
  };
  return deepFreeze({ ...payload, intakeHash: semanticHash(payload) });
}

export function assertTopologyEditReviewDossierIntake(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_DOSSIER_INTAKE_SCHEMA) {
    throw new TypeError(
      `Dossier intake must use ${TOPOLOGY_EDIT_REVIEW_DOSSIER_INTAKE_SCHEMA}.`,
    );
  }
  const payload = { ...value };
  delete payload.intakeHash;
  if (value.intakeHash !== semanticHash(payload)) {
    throw new Error('TopologyEditReviewDossierIntake: intake hash mismatch.');
  }
  return value;
}

export function topologyEditCurrentEvidenceHashes({
  presentationState,
  provenance,
  comparison,
  issueOverlay,
  inspection,
  routeTrace,
} = {}) {
  return deepFreeze({
    presentationHash: token(presentationState?.presentationHash),
    provenanceHash: token(provenance?.provenanceHash),
    comparisonHash: token(comparison?.comparisonHash),
    issueOverlayHash: token(issueOverlay?.overlayHash),
    inspectionHash: token(inspection?.inspectionHash),
    routeTraceHash: token(routeTrace?.routeTraceHash),
  });
}

function compareEvidenceHashes(saved = {}, current = {}) {
  return EVIDENCE_KEYS.map((key) => {
    const savedHash = token(saved?.[key]);
    const currentHash = token(current?.[key]);
    const status = !savedHash
      ? 'NOT_RETAINED'
      : !currentHash
        ? 'CURRENT_UNAVAILABLE'
        : savedHash === currentHash
          ? 'MATCH'
          : 'MISMATCH';
    return { key, savedHash, currentHash, status };
  });
}

function collectCurrentCanonicalIds(canonicalTopology) {
  const ids = new Set();
  for (const collection of [
    canonicalTopology.nodes,
    canonicalTopology.edges,
    canonicalTopology.supports,
    canonicalTopology.junctions,
  ]) {
    for (const record of collection ?? []) {
      const id = token(record?.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function classifyCoverage(requested, available, missing) {
  if (requested === 0) return 'EMPTY';
  if (missing === 0) return 'COMPLETE';
  if (available === 0) return 'ABSENT';
  return 'PARTIAL';
}

function normalizedIds(values) {
  return Array.isArray(values)
    ? [...new Set(values.map(token).filter(Boolean))].sort()
    : [];
}
function token(value) {
  const result = String(value ?? '').trim();
  return result || null;
}
function utf8Length(value) {
  return new TextEncoder().encode(value).length;
}
function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return number;
}
function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  return number;
}
