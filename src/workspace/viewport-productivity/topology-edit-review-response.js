import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditReviewDossier } from './topology-edit-review-dossier.js';
import {
  assertTopologyEditReviewDossierIntake,
} from './topology-edit-review-dossier-intake.js';

export const TOPOLOGY_EDIT_REVIEW_RESPONSE_SCHEMA = 'TopologyEditReviewResponse.v1';
export const TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES = 5 * 1024 * 1024;
export const TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS = 2000;
export const TOPOLOGY_EDIT_REVIEW_RESPONSE_DISPOSITIONS = Object.freeze([
  'ACKNOWLEDGED',
  'CONTESTED',
  'DEFERRED',
  'CURRENT_DRAFT_CHANGED',
]);

export function createTopologyEditReviewResponse({
  dossier,
  intake = null,
  responderBasis,
  responses = [],
} = {}) {
  assertTopologyEditReviewDossier(dossier);
  if (intake) assertTopologyEditReviewDossierIntake(intake);
  if (!responderBasis || typeof responderBasis !== 'object') {
    throw new TypeError('Responder review basis is required.');
  }
  if (!Array.isArray(responses)) throw new TypeError('Review responses must be an array.');
  if (intake && intake.dossierHash !== dossier.dossierHash) {
    throw new Error('Review response intake hash does not bind the referenced dossier.');
  }
  const issues = issueMap(dossier);
  const seen = new Set();
  const rows = responses.map((response) => {
    const issueId = token(response?.issueId);
    if (!issueId || !issues.has(issueId)) {
      throw new Error(`Review response references unknown dossier issue: ${issueId ?? '<missing>'}.`);
    }
    if (seen.has(issueId)) throw new Error(`Duplicate review response issue: ${issueId}.`);
    seen.add(issueId);
    const issue = issues.get(issueId);
    return deepFreeze({
      issueId,
      disposition: disposition(response?.disposition),
      note: boundedNote(response?.note),
      canonicalIds: normalizedIds(issue.canonicalIds),
      issueEvidenceHash: issueEvidenceHash(issue),
    });
  }).sort((left, right) => left.issueId.localeCompare(right.issueId));
  const payload = {
    schema: TOPOLOGY_EDIT_REVIEW_RESPONSE_SCHEMA,
    sourceDossierHash: dossier.dossierHash,
    sourceIssueOverlayHash: token(dossier.issueOverlay?.overlayHash),
    sourceIntakeHash: token(intake?.intakeHash),
    responderBasis: structuredClone(responderBasis),
    responses: rows,
    summary: responseSummary(rows),
    authority: 'DISPLAY_REVIEW_RESPONSE_ONLY',
    checkerAuthorityChanged: false,
    autofixAuthorityChanged: false,
    persistenceAuthorityChanged: false,
    auditExportAuthorityChanged: false,
    workspaceAuthorityChanged: false,
    calculationAuthorityChanged: false,
    releaseQualified: false,
    disclosure: 'Review responses communicate reviewer observations only. They do not resolve checker findings, approve engineering, accept autofixes, change workspace state, or establish release readiness.',
  };
  return deepFreeze({ ...payload, responseHash: semanticHash(payload) });
}

export function assertTopologyEditReviewResponse(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_RESPONSE_SCHEMA) {
    throw new TypeError(`Review response must use ${TOPOLOGY_EDIT_REVIEW_RESPONSE_SCHEMA}.`);
  }
  if (!token(value.sourceDossierHash)) throw new TypeError('Review response source dossier hash is required.');
  if (!value.responderBasis || typeof value.responderBasis !== 'object') {
    throw new TypeError('Review response responder basis is required.');
  }
  if (value.authority !== 'DISPLAY_REVIEW_RESPONSE_ONLY' || value.releaseQualified !== false) {
    throw new Error('Review response authority or release disposition is invalid.');
  }
  for (const key of [
    'checkerAuthorityChanged', 'autofixAuthorityChanged', 'persistenceAuthorityChanged',
    'auditExportAuthorityChanged', 'workspaceAuthorityChanged', 'calculationAuthorityChanged',
  ]) {
    if (value[key] !== false) throw new Error(`Review response authority flag must remain false: ${key}.`);
  }
  if (!Array.isArray(value.responses)) throw new TypeError('Review response rows are required.');
  const seen = new Set();
  const issueIds = [];
  for (const row of value.responses) {
    const issueId = token(row?.issueId);
    if (!issueId) throw new TypeError('Review response issueId is required.');
    if (seen.has(issueId)) throw new Error(`Duplicate review response issue: ${issueId}.`);
    seen.add(issueId);
    issueIds.push(issueId);
    if (disposition(row.disposition) !== row.disposition) {
      throw new Error(`Review response disposition is not normalized for ${issueId}.`);
    }
    if (boundedNote(row.note) !== row.note) {
      throw new Error(`Review response note is not normalized for ${issueId}.`);
    }
    if (semanticHash(normalizedIds(row.canonicalIds)) !== semanticHash(row.canonicalIds ?? [])) {
      throw new Error(`Review response canonical IDs are not normalized for ${issueId}.`);
    }
    if (!token(row.issueEvidenceHash)) {
      throw new TypeError(`Review response issue evidence hash is required for ${issueId}.`);
    }
  }
  if (semanticHash([...issueIds].sort()) !== semanticHash(issueIds)) {
    throw new Error('Review response rows are not sorted by exact issue identity.');
  }
  if (semanticHash(responseSummary(value.responses)) !== semanticHash(value.summary)) {
    throw new Error('Review response summary does not match response rows.');
  }
  const payload = { ...value };
  delete payload.responseHash;
  if (value.responseHash !== semanticHash(payload)) {
    throw new Error('TopologyEditReviewResponse: response hash mismatch.');
  }
  return value;
}

export function parseTopologyEditReviewResponseJson(
  text,
  { byteLength = null, maxBytes = TOPOLOGY_EDIT_REVIEW_RESPONSE_MAX_BYTES } = {},
) {
  if (typeof text !== 'string') throw new TypeError('Review response JSON text is required.');
  const limit = positiveInteger(maxBytes, 'maxBytes');
  const bytes = byteLength === null ? new TextEncoder().encode(text).length : nonNegativeInteger(byteLength, 'byteLength');
  if (bytes > limit) throw new RangeError(`Review response exceeds the ${limit}-byte intake limit.`);
  let value;
  try { value = JSON.parse(text); } catch (error) {
    throw new SyntaxError(`Review response JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertTopologyEditReviewResponse(value);
  return deepFreeze(structuredClone(value));
}

export function topologyEditReviewResponseJson(value) {
  assertTopologyEditReviewResponse(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function topologyEditReviewResponseFilename(value) {
  assertTopologyEditReviewResponse(value);
  return `topology-edit-review-response-${value.responseHash.slice(0, 16)}.json`;
}

export function topologyEditDossierIssueEntries(dossier) {
  assertTopologyEditReviewDossier(dossier);
  return [...issueMap(dossier).values()].map((row) => deepFreeze(structuredClone(row)));
}

export function topologyEditIssueEvidenceHash(issue) {
  return issueEvidenceHash(issue);
}

function issueMap(dossier) {
  const map = new Map();
  for (const issue of dossier.issueOverlay?.entries ?? []) {
    const issueId = token(issue?.issueId);
    if (!issueId) continue;
    if (map.has(issueId)) throw new Error(`Duplicate dossier issue identity: ${issueId}.`);
    map.set(issueId, issue);
  }
  return new Map([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function issueEvidenceHash(issue) {
  return semanticHash({
    issueId: token(issue?.issueId),
    kind: token(issue?.kind),
    severity: token(issue?.severity),
    message: String(issue?.message ?? ''),
    canonicalIds: normalizedIds(issue?.canonicalIds),
    suggestionHash: token(issue?.suggestionHash),
    commandType: token(issue?.commandType),
  });
}

function responseSummary(rows) {
  return {
    responseCount: rows.length,
    acknowledgedCount: rows.filter((row) => row.disposition === 'ACKNOWLEDGED').length,
    contestedCount: rows.filter((row) => row.disposition === 'CONTESTED').length,
    deferredCount: rows.filter((row) => row.disposition === 'DEFERRED').length,
    currentDraftChangedCount: rows.filter((row) => row.disposition === 'CURRENT_DRAFT_CHANGED').length,
  };
}

function disposition(value) {
  const result = String(value ?? '').trim().toUpperCase();
  if (!TOPOLOGY_EDIT_REVIEW_RESPONSE_DISPOSITIONS.includes(result)) {
    throw new RangeError(`Unsupported review response disposition: ${result || '<missing>'}.`);
  }
  return result;
}
function boundedNote(value) {
  const note = String(value ?? '').trim();
  if (note.length > TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS) {
    throw new RangeError(`Review response note exceeds ${TOPOLOGY_EDIT_REVIEW_RESPONSE_NOTE_MAX_CHARS} characters.`);
  }
  return note;
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
function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${name} must be a positive integer.`);
  return number;
}
function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${name} must be a non-negative integer.`);
  return number;
}
