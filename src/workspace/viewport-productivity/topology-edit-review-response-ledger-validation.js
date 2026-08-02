import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { classifyReviewBasis } from './topology-edit-review-bookmark.js';

const CANONICAL_ID_PATTERN = /^(?:node|edge|support|junction):[^\s]+$/;
const RESPONSE_INTAKE_DISCLOSURE =
  'Response reconciliation verifies package identity and current review compatibility only. It does not resolve checker findings, approve engineering, or establish release readiness.';
const RESPONSE_INTAKE_FLAGS = Object.freeze([
  'checkerAuthorityChanged',
  'autofixAuthorityChanged',
  'persistenceAuthorityChanged',
  'auditExportAuthorityChanged',
  'workspaceAuthorityChanged',
  'calculationAuthorityChanged',
]);

export function assertTopologyEditReviewLedgerCurrentContext(
  currentBasis,
  canonicalTopology,
) {
  if (!currentBasis || typeof currentBasis !== 'object' || Array.isArray(currentBasis)) {
    throw new TypeError('Current review basis is required for ledger creation.');
  }
  if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
    throw new TypeError('Current canonical topology is required for ledger creation.');
  }
}

export function createTopologyEditReviewLedgerContext(
  currentBasis,
  canonicalTopology,
) {
  assertTopologyEditReviewLedgerCurrentContext(currentBasis, canonicalTopology);
  const material = {
    currentBasis: structuredClone(currentBasis),
    canonicalIds: currentCanonicalIds(canonicalTopology),
  };
  return deepFreeze({ ...material, contextHash: semanticHash(material) });
}

export function assertTopologyEditReviewLedgerContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Review ledger creation context is required.');
  }
  if (!value.currentBasis || typeof value.currentBasis !== 'object'
      || Array.isArray(value.currentBasis)) {
    throw new TypeError('Review ledger creation basis is required.');
  }
  const canonicalIds = topologyEditReviewLedgerNormalizedIds(value.canonicalIds);
  if (canonicalIds.some((id) => !CANONICAL_ID_PATTERN.test(id))) {
    throw new TypeError('Review ledger creation context contains a non-canonical ID.');
  }
  if (semanticHash(canonicalIds) !== semanticHash(value.canonicalIds)) {
    throw new Error('Review ledger creation canonical IDs are not normalized.');
  }
  const material = {
    currentBasis: structuredClone(value.currentBasis),
    canonicalIds,
  };
  if (value.contextHash !== semanticHash(material)) {
    throw new Error('Review ledger creation context hash mismatch.');
  }
  return deepFreeze({ ...material, contextHash: value.contextHash });
}

export function expectedTopologyEditReviewLedgerResponseIntake({
  response,
  dossierIssues,
  creationContext,
} = {}) {
  const context = assertTopologyEditReviewLedgerContext(creationContext);
  const issues = new Map((dossierIssues ?? []).map((issue) => [issue.issueId, issue]));
  const issueComparisons = response.responses.map((row) => {
    const issue = issues.get(row.issueId);
    if (!issue || issue.issueEvidenceHash !== row.issueEvidenceHash) {
      throw new Error(`Review ledger response intake is detached from issue ${row.issueId}.`);
    }
    return deepFreeze({
      issueId: row.issueId,
      status: 'MATCH',
      savedIssueEvidenceHash: row.issueEvidenceHash,
      currentIssueEvidenceHash: issue.issueEvidenceHash,
    });
  });
  const requestedCanonicalIds = topologyEditReviewLedgerNormalizedIds(
    response.responses.flatMap((row) => row.canonicalIds ?? []),
  );
  const currentIds = new Set(context.canonicalIds);
  const availableCanonicalIds = requestedCanonicalIds.filter((id) => currentIds.has(id));
  const missingCanonicalIds = requestedCanonicalIds.filter((id) => !currentIds.has(id));
  const payload = {
    schema: 'TopologyEditReviewResponseIntake.v1',
    responseHash: response.responseHash,
    sourceDossierHash: response.sourceDossierHash,
    currentDossierHash: response.sourceDossierHash,
    dossierStatus: 'MATCH',
    responseStatus: 'MATCH',
    basisStatus: classifyReviewBasis(response.responderBasis, context.currentBasis),
    issueComparisons,
    unknownIssueIds: [],
    driftedIssueIds: [],
    requestedCanonicalIds,
    availableCanonicalIds,
    missingCanonicalIds,
    coverageStatus: classifyCoverage(
      requestedCanonicalIds.length,
      availableCanonicalIds.length,
      missingCanonicalIds.length,
    ),
    focusEligible: availableCanonicalIds.length > 0,
    summary: {
      responseCount: response.responses.length,
      issueMatchCount: issueComparisons.length,
      unknownIssueCount: 0,
      driftedIssueCount: 0,
      availableCanonicalCount: availableCanonicalIds.length,
      missingCanonicalCount: missingCanonicalIds.length,
    },
    authority: 'DISPLAY_REVIEW_RESPONSE_INTAKE_ONLY',
    checkerAuthorityChanged: false,
    autofixAuthorityChanged: false,
    persistenceAuthorityChanged: false,
    auditExportAuthorityChanged: false,
    workspaceAuthorityChanged: false,
    calculationAuthorityChanged: false,
    releaseQualified: false,
    disclosure: RESPONSE_INTAKE_DISCLOSURE,
  };
  return deepFreeze({ ...payload, responseIntakeHash: semanticHash(payload) });
}

export function assertTopologyEditReviewLedgerEmbeddedIntake(input = {}) {
  const expected = expectedTopologyEditReviewLedgerResponseIntake(input);
  const actual = input.intake;
  if (semanticHash(expected) !== semanticHash(actual)) {
    throw new Error(
      `Review ledger embedded intake does not match reconstructable response evidence: ${input.response?.responseHash}.`,
    );
  }
  return actual;
}

export function topologyEditReviewLedgerAuthorityFlags() {
  return [
    'checkerAuthorityChanged',
    'autofixAuthorityChanged',
    'persistenceAuthorityChanged',
    'auditExportAuthorityChanged',
    'workspaceAuthorityChanged',
    'calculationAuthorityChanged',
    'engineeringApprovalAuthorityChanged',
  ];
}

export function topologyEditReviewLedgerNormalizedIds(values) {
  if (!Array.isArray(values)) throw new TypeError('Canonical ID values must be an array.');
  return [...new Set(values.map(topologyEditReviewLedgerToken).filter(Boolean))].sort();
}

export function topologyEditReviewLedgerToken(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

export function topologyEditReviewLedgerPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return number;
}

export function topologyEditReviewLedgerNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  return number;
}

function currentCanonicalIds(canonicalTopology) {
  const ids = [];
  for (const collection of [
    canonicalTopology.nodes,
    canonicalTopology.edges,
    canonicalTopology.supports,
    canonicalTopology.junctions,
  ]) {
    for (const record of collection ?? []) {
      const id = topologyEditReviewLedgerToken(record?.id);
      if (id) ids.push(id);
    }
  }
  const normalized = topologyEditReviewLedgerNormalizedIds(ids);
  if (normalized.some((id) => !CANONICAL_ID_PATTERN.test(id))) {
    throw new TypeError('Current canonical topology contains a non-canonical ID.');
  }
  return normalized;
}

function classifyCoverage(requested, available, missing) {
  if (requested === 0) return 'EMPTY';
  if (missing === 0) return 'COMPLETE';
  if (available === 0) return 'ABSENT';
  return 'PARTIAL';
}

export function topologyEditReviewLedgerResponseIntakeFlags() {
  return [...RESPONSE_INTAKE_FLAGS];
}
