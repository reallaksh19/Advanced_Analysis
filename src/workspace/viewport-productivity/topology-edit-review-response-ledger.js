import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditReviewDossier } from './topology-edit-review-dossier.js';
import {
  assertTopologyEditReviewResponse,
  topologyEditDossierIssueEntries,
  topologyEditIssueEvidenceHash,
} from './topology-edit-review-response.js';
import {
  assertTopologyEditReviewResponseIntake,
  reconcileTopologyEditReviewResponse,
} from './topology-edit-review-response-intake.js';
import {
  assertTopologyEditReviewLedgerContext as assertCreationContext,
  assertTopologyEditReviewLedgerCurrentContext as assertCurrentContext,
  assertTopologyEditReviewLedgerEmbeddedIntake as assertEmbeddedIntake,
  createTopologyEditReviewLedgerContext as createCreationContext,
  topologyEditReviewLedgerAuthorityFlags as authorityFlags,
  topologyEditReviewLedgerNonNegativeInteger as nonNegativeInteger,
  topologyEditReviewLedgerNormalizedIds as normalizedIds,
  topologyEditReviewLedgerPositiveInteger as positiveInteger,
  topologyEditReviewLedgerToken as token,
} from './topology-edit-review-response-ledger-validation.js';

export const TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_SCHEMA =
  'TopologyEditReviewResponseLedger.v1';
export const TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES = 20 * 1024 * 1024;
export const TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_PACKAGES = 32;

export function createTopologyEditReviewResponseLedger({
  dossier,
  currentBasis,
  canonicalTopology,
  responses = [],
} = {}) {
  assertTopologyEditReviewDossier(dossier);
  assertCurrentContext(currentBasis, canonicalTopology);
  if (!Array.isArray(responses)) throw new TypeError('Review ledger responses must be an array.');
  if (responses.length > TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_PACKAGES) {
    throw new RangeError(
      `Review ledger exceeds ${TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_PACKAGES} packages.`,
    );
  }
  const creationContext = createCreationContext(currentBasis, canonicalTopology);
  const seen = new Set();
  const packages = responses.map((response) => {
    assertTopologyEditReviewResponse(response);
    if (response.sourceDossierHash !== dossier.dossierHash) {
      throw new Error(`Review response ${response.responseHash} binds another dossier.`);
    }
    if (seen.has(response.responseHash)) {
      throw new Error(`Duplicate review response package: ${response.responseHash}.`);
    }
    seen.add(response.responseHash);
    const intake = reconcileTopologyEditReviewResponse({
      response,
      dossier,
      currentBasis,
      canonicalTopology,
    });
    return deepFreeze({
      response: structuredClone(response),
      intake: structuredClone(intake),
    });
  }).sort((left, right) => left.response.responseHash.localeCompare(right.response.responseHash));
  const dossierIssues = normalizedDossierIssues(dossier);
  const issueMatrix = buildIssueMatrix(dossierIssues, packages);
  const payload = {
    schema: TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_SCHEMA,
    sourceDossierHash: dossier.dossierHash,
    sourceIssueOverlayHash: token(dossier.issueOverlay?.overlayHash),
    creationContext,
    dossierIssues,
    packages,
    issueMatrix,
    conflictingIssueIds: issueMatrix
      .filter((row) => row.status === 'CONFLICTING')
      .map((row) => row.issueId),
    summary: ledgerSummary(issueMatrix, packages),
    coverage: aggregateCoverage(packages),
    authority: 'DISPLAY_REVIEW_RESPONSE_LEDGER_ONLY',
    checkerAuthorityChanged: false,
    autofixAuthorityChanged: false,
    persistenceAuthorityChanged: false,
    auditExportAuthorityChanged: false,
    workspaceAuthorityChanged: false,
    calculationAuthorityChanged: false,
    engineeringApprovalAuthorityChanged: false,
    releaseQualified: false,
    disclosure: 'The review ledger aggregates exact response packages for comparison only. It does not identify an authoritative reviewer, resolve findings, approve engineering, or establish release readiness.',
  };
  const byteLength = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (byteLength > TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES) {
    throw new RangeError(
      `Review ledger exceeds the ${TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES}-byte limit.`,
    );
  }
  return deepFreeze({ ...payload, ledgerHash: semanticHash(payload) });
}

export function assertTopologyEditReviewResponseLedger(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_SCHEMA) {
    throw new TypeError(
      `Review response ledger must use ${TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_SCHEMA}.`,
    );
  }
  if (!token(value.sourceDossierHash)) throw new TypeError('Ledger source dossier hash is required.');
  const creationContext = assertCreationContext(value.creationContext);
  if (value.authority !== 'DISPLAY_REVIEW_RESPONSE_LEDGER_ONLY'
      || value.releaseQualified !== false) {
    throw new Error('Review ledger authority or release disposition is invalid.');
  }
  for (const key of authorityFlags()) {
    if (value[key] !== false) throw new Error(`Review ledger authority flag must remain false: ${key}.`);
  }
  if (!Array.isArray(value.packages)
      || value.packages.length > TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_PACKAGES) {
    throw new TypeError('Review ledger packages are invalid.');
  }
  const hashes = [];
  for (const entry of value.packages) {
    assertTopologyEditReviewResponse(entry?.response);
    assertTopologyEditReviewResponseIntake(entry?.intake);
    const hash = entry.response.responseHash;
    if (entry.response.sourceDossierHash !== value.sourceDossierHash) {
      throw new Error(`Ledger response ${hash} does not bind the source dossier.`);
    }
    if (entry.intake.responseHash !== hash || entry.intake.dossierStatus !== 'MATCH') {
      throw new Error(`Ledger intake does not bind response ${hash}.`);
    }
    hashes.push(hash);
  }
  if (new Set(hashes).size !== hashes.length) throw new Error('Review ledger contains duplicate packages.');
  if (semanticHash([...hashes].sort()) !== semanticHash(hashes)) {
    throw new Error('Review ledger packages are not sorted by response hash.');
  }
  const dossierIssues = normalizeStoredDossierIssues(value.dossierIssues);
  if (semanticHash(dossierIssues) !== semanticHash(value.dossierIssues)) {
    throw new Error('Review ledger dossier issues are not normalized.');
  }
  assertPackageIssueBindings(dossierIssues, value.packages);
  for (const entry of value.packages) {
    assertEmbeddedIntake({
      response: entry.response,
      intake: entry.intake,
      dossierIssues,
      creationContext,
    });
  }
  const issueMatrix = buildIssueMatrix(dossierIssues, value.packages);
  if (semanticHash(issueMatrix) !== semanticHash(value.issueMatrix)) {
    throw new Error('Review ledger issue matrix does not match packages.');
  }
  if (semanticHash(ledgerSummary(issueMatrix, value.packages)) !== semanticHash(value.summary)) {
    throw new Error('Review ledger summary does not match packages.');
  }
  if (semanticHash(aggregateCoverage(value.packages)) !== semanticHash(value.coverage)) {
    throw new Error('Review ledger coverage does not match packages.');
  }
  const conflicts = issueMatrix
    .filter((row) => row.status === 'CONFLICTING')
    .map((row) => row.issueId);
  if (semanticHash(conflicts) !== semanticHash(value.conflictingIssueIds)) {
    throw new Error('Review ledger conflict identities do not match the issue matrix.');
  }
  const payload = { ...value };
  delete payload.ledgerHash;
  if (value.ledgerHash !== semanticHash(payload)) {
    throw new Error('TopologyEditReviewResponseLedger: ledger hash mismatch.');
  }
  return value;
}

export function parseTopologyEditReviewResponseLedgerJson(
  text,
  { byteLength = null, maxBytes = TOPOLOGY_EDIT_REVIEW_RESPONSE_LEDGER_MAX_BYTES } = {},
) {
  if (typeof text !== 'string') throw new TypeError('Review ledger JSON text is required.');
  const limit = positiveInteger(maxBytes, 'maxBytes');
  const bytes = byteLength === null
    ? new TextEncoder().encode(text).length
    : nonNegativeInteger(byteLength, 'byteLength');
  if (bytes > limit) throw new RangeError(`Review ledger exceeds the ${limit}-byte intake limit.`);
  let value;
  try { value = JSON.parse(text); } catch (error) {
    throw new SyntaxError(
      `Review ledger JSON is malformed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertTopologyEditReviewResponseLedger(value);
  return deepFreeze(structuredClone(value));
}

export function topologyEditReviewResponseLedgerJson(value) {
  assertTopologyEditReviewResponseLedger(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function topologyEditReviewResponseLedgerFilename(value) {
  assertTopologyEditReviewResponseLedger(value);
  return `topology-edit-review-ledger-${value.ledgerHash.slice(0, 16)}.json`;
}

export function topologyEditReviewLedgerConflictCanonicalIds(value) {
  assertTopologyEditReviewResponseLedger(value);
  return normalizedIds(value.issueMatrix
    .filter((row) => row.status === 'CONFLICTING')
    .flatMap((row) => row.canonicalIds));
}

function normalizedDossierIssues(dossier) {
  return topologyEditDossierIssueEntries(dossier).map((issue) => deepFreeze({
    issueId: token(issue.issueId),
    canonicalIds: normalizedIds(issue.canonicalIds),
    issueEvidenceHash: topologyEditIssueEvidenceHash(issue),
  })).sort((left, right) => left.issueId.localeCompare(right.issueId));
}

function normalizeStoredDossierIssues(values) {
  if (!Array.isArray(values)) throw new TypeError('Review ledger dossier issues are required.');
  const seen = new Set();
  return values.map((issue) => {
    const issueId = token(issue?.issueId);
    if (!issueId || seen.has(issueId)) throw new Error(`Invalid ledger issue identity: ${issueId}.`);
    seen.add(issueId);
    const issueEvidenceHash = token(issue?.issueEvidenceHash);
    if (!issueEvidenceHash) throw new TypeError(`Ledger issue evidence hash is required: ${issueId}.`);
    return {
      issueId,
      canonicalIds: normalizedIds(issue.canonicalIds),
      issueEvidenceHash,
    };
  }).sort((left, right) => left.issueId.localeCompare(right.issueId));
}

function assertPackageIssueBindings(dossierIssues, packages) {
  const issues = new Map(dossierIssues.map((issue) => [issue.issueId, issue]));
  for (const { response } of packages) {
    for (const row of response.responses) {
      const issue = issues.get(row.issueId);
      if (!issue) throw new Error(`Ledger response references unknown dossier issue: ${row.issueId}.`);
      if (row.issueEvidenceHash !== issue.issueEvidenceHash) {
        throw new Error(`Ledger response issue evidence mismatch: ${row.issueId}.`);
      }
      if (semanticHash(normalizedIds(row.canonicalIds)) !== semanticHash(issue.canonicalIds)) {
        throw new Error(`Ledger response canonical IDs mismatch: ${row.issueId}.`);
      }
    }
  }
}

function buildIssueMatrix(dossierIssues, packages) {
  return dossierIssues.map((issue) => {
    const entries = packages.flatMap(({ response, intake }) => response.responses
      .filter((row) => row.issueId === issue.issueId)
      .map((row) => ({
        responseHash: response.responseHash,
        disposition: row.disposition,
        note: row.note,
        basisStatus: intake.basisStatus,
        canonicalIds: normalizedIds(row.canonicalIds),
      }))).sort((left, right) => left.responseHash.localeCompare(right.responseHash));
    const dispositions = [...new Set(entries.map((entry) => entry.disposition))].sort();
    return deepFreeze({
      issueId: issue.issueId,
      issueEvidenceHash: issue.issueEvidenceHash,
      canonicalIds: issue.canonicalIds,
      status: entries.length === 0 ? 'UNANSWERED' : dispositions.length === 1 ? 'CONSISTENT' : 'CONFLICTING',
      responseCount: entries.length,
      dispositions,
      entries,
    });
  });
}

function ledgerSummary(issueMatrix, packages) {
  return {
    packageCount: packages.length,
    responseRowCount: packages.reduce((sum, entry) => sum + entry.response.responses.length, 0),
    issueCount: issueMatrix.length,
    answeredIssueCount: issueMatrix.filter((row) => row.status !== 'UNANSWERED').length,
    consistentIssueCount: issueMatrix.filter((row) => row.status === 'CONSISTENT').length,
    conflictingIssueCount: issueMatrix.filter((row) => row.status === 'CONFLICTING').length,
    currentBasisPackageCount: packages.filter((entry) => entry.intake.basisStatus === 'CURRENT').length,
    staleBasisPackageCount: packages.filter((entry) => entry.intake.basisStatus !== 'CURRENT').length,
  };
}

function aggregateCoverage(packages) {
  return {
    requestedCanonicalIds: normalizedIds(packages.flatMap((entry) => entry.intake.requestedCanonicalIds)),
    availableCanonicalIds: normalizedIds(packages.flatMap((entry) => entry.intake.availableCanonicalIds)),
    missingCanonicalIds: normalizedIds(packages.flatMap((entry) => entry.intake.missingCanonicalIds)),
  };
}
