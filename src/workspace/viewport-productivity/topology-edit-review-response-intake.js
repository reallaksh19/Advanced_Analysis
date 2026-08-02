import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { classifyReviewBasis } from './topology-edit-review-bookmark.js';
import { assertTopologyEditReviewDossier } from './topology-edit-review-dossier.js';
import {
  assertTopologyEditReviewResponse,
  topologyEditIssueEvidenceHash,
} from './topology-edit-review-response.js';

export const TOPOLOGY_EDIT_REVIEW_RESPONSE_INTAKE_SCHEMA =
  'TopologyEditReviewResponseIntake.v1';

export function reconcileTopologyEditReviewResponse({
  response,
  dossier,
  currentBasis,
  canonicalTopology,
} = {}) {
  assertTopologyEditReviewResponse(response);
  assertTopologyEditReviewDossier(dossier);
  if (!currentBasis || typeof currentBasis !== 'object') {
    throw new TypeError('Current review basis is required for response reconciliation.');
  }
  if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
    throw new TypeError('Current canonical topology is required for response reconciliation.');
  }
  const dossierStatus = response.sourceDossierHash === dossier.dossierHash
    ? 'MATCH'
    : 'MISMATCH';
  const basisStatus = classifyReviewBasis(response.responderBasis, currentBasis);
  const issues = new Map((dossier.issueOverlay?.entries ?? [])
    .filter((issue) => token(issue?.issueId))
    .map((issue) => [token(issue.issueId), issue]));
  const issueComparisons = response.responses.map((row) => {
    const issue = issues.get(row.issueId);
    const status = !issue
      ? 'UNKNOWN_ISSUE'
      : topologyEditIssueEvidenceHash(issue) === row.issueEvidenceHash
        ? 'MATCH'
        : 'ISSUE_EVIDENCE_DRIFT';
    return deepFreeze({
      issueId: row.issueId,
      status,
      savedIssueEvidenceHash: row.issueEvidenceHash,
      currentIssueEvidenceHash: issue ? topologyEditIssueEvidenceHash(issue) : null,
    });
  });
  const unknownIssueIds = issueComparisons
    .filter((row) => row.status === 'UNKNOWN_ISSUE')
    .map((row) => row.issueId);
  const driftedIssueIds = issueComparisons
    .filter((row) => row.status === 'ISSUE_EVIDENCE_DRIFT')
    .map((row) => row.issueId);
  if (dossierStatus === 'MATCH' && unknownIssueIds.length) {
    throw new Error(
      `Review response references unknown exact dossier issue IDs: ${unknownIssueIds.join(', ')}.`,
    );
  }
  const responseStatus = dossierStatus === 'MISMATCH'
    ? 'DOSSIER_MISMATCH'
    : driftedIssueIds.length
      ? 'ISSUE_SET_DRIFT'
      : 'MATCH';
  const requestedCanonicalIds = normalizedIds(
    response.responses.flatMap((row) => row.canonicalIds ?? []),
  );
  const currentIds = currentCanonicalIds(canonicalTopology);
  const availableCanonicalIds = requestedCanonicalIds.filter((id) => currentIds.has(id));
  const missingCanonicalIds = requestedCanonicalIds.filter((id) => !currentIds.has(id));
  const coverageStatus = classifyCoverage(
    requestedCanonicalIds.length,
    availableCanonicalIds.length,
    missingCanonicalIds.length,
  );
  const payload = {
    schema: TOPOLOGY_EDIT_REVIEW_RESPONSE_INTAKE_SCHEMA,
    responseHash: response.responseHash,
    sourceDossierHash: response.sourceDossierHash,
    currentDossierHash: dossier.dossierHash,
    dossierStatus,
    responseStatus,
    basisStatus,
    issueComparisons,
    unknownIssueIds,
    driftedIssueIds,
    requestedCanonicalIds,
    availableCanonicalIds,
    missingCanonicalIds,
    coverageStatus,
    focusEligible: availableCanonicalIds.length > 0,
    summary: {
      responseCount: response.responses.length,
      issueMatchCount: issueComparisons.filter((row) => row.status === 'MATCH').length,
      unknownIssueCount: unknownIssueIds.length,
      driftedIssueCount: driftedIssueIds.length,
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
    disclosure: 'Response reconciliation verifies package identity and current review compatibility only. It does not resolve checker findings, approve engineering, or establish release readiness.',
  };
  return deepFreeze({ ...payload, responseIntakeHash: semanticHash(payload) });
}

export function assertTopologyEditReviewResponseIntake(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_RESPONSE_INTAKE_SCHEMA) {
    throw new TypeError(
      `Review response intake must use ${TOPOLOGY_EDIT_REVIEW_RESPONSE_INTAKE_SCHEMA}.`,
    );
  }
  const payload = { ...value };
  delete payload.responseIntakeHash;
  if (value.responseIntakeHash !== semanticHash(payload)) {
    throw new Error('TopologyEditReviewResponseIntake: intake hash mismatch.');
  }
  return value;
}

function currentCanonicalIds(canonicalTopology) {
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
  return [...new Set((values ?? []).map(token).filter(Boolean))].sort();
}
function token(value) {
  const result = String(value ?? '').trim();
  return result || null;
}
