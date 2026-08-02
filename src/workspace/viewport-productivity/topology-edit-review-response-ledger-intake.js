import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditReviewDossier } from './topology-edit-review-dossier.js';
import { classifyReviewBasis } from './topology-edit-review-bookmark.js';
import {
  topologyEditDossierIssueEntries,
  topologyEditIssueEvidenceHash,
} from './topology-edit-review-response.js';
import {
  assertTopologyEditReviewResponseLedger,
  topologyEditReviewLedgerConflictCanonicalIds,
} from './topology-edit-review-response-ledger.js';

export const TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_INTAKE_SCHEMA =
  'TopologyEditReviewResponseLedgerIntake.v1';

export function reconcileTopologyEditReviewResponseLedger({
  ledger,
  dossier,
  currentBasis,
  canonicalTopology,
} = {}) {
  assertTopologyEditReviewResponseLedger(ledger);
  assertTopologyEditReviewDossier(dossier);
  if (!currentBasis || typeof currentBasis !== 'object') {
    throw new TypeError('Current review basis is required for ledger reconciliation.');
  }
  if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
    throw new TypeError('Current canonical topology is required for ledger reconciliation.');
  }
  const dossierStatus = ledger.sourceDossierHash === dossier.dossierHash ? 'MATCH' : 'MISMATCH';
  const issueComparison = compareIssueEvidence(ledger, dossier);
  const packageComparisons = ledger.packages.map(({ response }) => deepFreeze({
    responseHash: response.responseHash,
    dossierStatus: response.sourceDossierHash === dossier.dossierHash ? 'MATCH' : 'MISMATCH',
    basisStatus: classifyReviewBasis(response.responderBasis, currentBasis),
    responseCount: response.responses.length,
  }));
  const requestedCanonicalIds = normalizedIds(
    ledger.packages.flatMap((entry) => entry.response.responses.flatMap((row) => row.canonicalIds)),
  );
  const currentIds = currentCanonicalIds(canonicalTopology);
  const availableCanonicalIds = requestedCanonicalIds.filter((id) => currentIds.has(id));
  const missingCanonicalIds = requestedCanonicalIds.filter((id) => !currentIds.has(id));
  const conflictCanonicalIds = topologyEditReviewLedgerConflictCanonicalIds(ledger);
  const availableConflictCanonicalIds = conflictCanonicalIds.filter((id) => currentIds.has(id));
  const missingConflictCanonicalIds = conflictCanonicalIds.filter((id) => !currentIds.has(id));
  const payload = {
    schema: TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_INTAKE_SCHEMA,
    ledgerHash: ledger.ledgerHash,
    sourceDossierHash: ledger.sourceDossierHash,
    currentDossierHash: dossier.dossierHash,
    dossierStatus,
    issueSetStatus: issueComparison.status,
    matchedIssueIds: issueComparison.matchedIssueIds,
    missingIssueIds: issueComparison.missingIssueIds,
    addedIssueIds: issueComparison.addedIssueIds,
    driftedIssueIds: issueComparison.driftedIssueIds,
    packageComparisons,
    requestedCanonicalIds,
    availableCanonicalIds,
    missingCanonicalIds,
    coverageStatus: classifyCoverage(
      requestedCanonicalIds.length,
      availableCanonicalIds.length,
      missingCanonicalIds.length,
    ),
    conflictCanonicalIds,
    availableConflictCanonicalIds,
    missingConflictCanonicalIds,
    conflictFocusEligible: availableConflictCanonicalIds.length > 0,
    summary: {
      packageCount: packageComparisons.length,
      currentBasisPackageCount: packageComparisons
        .filter((row) => row.basisStatus === 'CURRENT').length,
      staleBasisPackageCount: packageComparisons
        .filter((row) => row.basisStatus !== 'CURRENT').length,
      matchedIssueCount: issueComparison.matchedIssueIds.length,
      missingIssueCount: issueComparison.missingIssueIds.length,
      addedIssueCount: issueComparison.addedIssueIds.length,
      driftedIssueCount: issueComparison.driftedIssueIds.length,
      availableCanonicalCount: availableCanonicalIds.length,
      missingCanonicalCount: missingCanonicalIds.length,
      availableConflictCanonicalCount: availableConflictCanonicalIds.length,
    },
    authority: 'DISPLAY_REVIEW_RESPONSE_LEDGER_INTAKE_ONLY',
    checkerAuthorityChanged: false,
    autofixAuthorityChanged: false,
    persistenceAuthorityChanged: false,
    auditExportAuthorityChanged: false,
    workspaceAuthorityChanged: false,
    calculationAuthorityChanged: false,
    engineeringApprovalAuthorityChanged: false,
    releaseQualified: false,
    disclosure: 'Ledger reconciliation compares exact package, issue-evidence, basis and canonical identities only. It does not resolve findings, approve engineering, or establish release readiness.',
  };
  return deepFreeze({ ...payload, ledgerIntakeHash: semanticHash(payload) });
}

export function assertTopologyEditReviewResponseLedgerIntake(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_INTAKE_SCHEMA) {
    throw new TypeError(
      `Review ledger intake must use ${TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_INTAKE_SCHEMA}.`,
    );
  }
  if (value.authority !== 'DISPLAY_REVIEW_RESPONSE_LEDGER_INTAKE_ONLY'
      || value.releaseQualified !== false) {
    throw new Error('Review ledger intake authority or release disposition is invalid.');
  }
  for (const key of [
    'checkerAuthorityChanged', 'autofixAuthorityChanged', 'persistenceAuthorityChanged',
    'auditExportAuthorityChanged', 'workspaceAuthorityChanged', 'calculationAuthorityChanged',
    'engineeringApprovalAuthorityChanged',
  ]) {
    if (value[key] !== false) throw new Error(`Review ledger intake flag must remain false: ${key}.`);
  }
  const payload = { ...value };
  delete payload.ledgerIntakeHash;
  if (value.ledgerIntakeHash !== semanticHash(payload)) {
    throw new Error('TopologyEditReviewResponseLedgerIntake: intake hash mismatch.');
  }
  return value;
}

function compareIssueEvidence(ledger, dossier) {
  const saved = new Map(ledger.dossierIssues.map((row) => [row.issueId, row.issueEvidenceHash]));
  const current = new Map(topologyEditDossierIssueEntries(dossier).map((issue) => [
    token(issue.issueId),
    topologyEditIssueEvidenceHash(issue),
  ]));
  const matchedIssueIds = [];
  const missingIssueIds = [];
  const driftedIssueIds = [];
  for (const [issueId, evidenceHash] of saved) {
    if (!current.has(issueId)) missingIssueIds.push(issueId);
    else if (current.get(issueId) === evidenceHash) matchedIssueIds.push(issueId);
    else driftedIssueIds.push(issueId);
  }
  const addedIssueIds = [...current.keys()].filter((issueId) => !saved.has(issueId)).sort();
  return {
    status: missingIssueIds.length || addedIssueIds.length || driftedIssueIds.length
      ? 'ISSUE_SET_DRIFT'
      : 'MATCH',
    matchedIssueIds: matchedIssueIds.sort(),
    missingIssueIds: missingIssueIds.sort(),
    addedIssueIds,
    driftedIssueIds: driftedIssueIds.sort(),
  };
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
