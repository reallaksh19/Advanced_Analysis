import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_PREPARATION_REQUEST_SCHEMA = 'lafea-preparation-request/v1';
export const LAFEA_PREPARATION_FINDING_SCHEMA = 'lafea-preparation-finding/v1';
export const LAFEA_PREPARATION_EVIDENCE_SCHEMA = 'lafea-preparation-evidence/v1';
export const LAFEA_PREPARATION_APPROVAL_SCHEMA = 'lafea-preparation-approval/v1';
export const LAFEA_PREPARATION_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'FATAL']);
export const LAFEA_PREPARATION_DISPOSITIONS = Object.freeze(['PASS', 'ADVISORY', 'CONDITIONAL', 'BLOCK']);
export const LAFEA_PREPARATION_CATEGORIES = Object.freeze([
  'SOURCE', 'SCHEMA', 'UNIT', 'GEOMETRY', 'TOPOLOGY', 'MATERIAL', 'SECTION',
  'RESTRAINT', 'LOAD', 'PHYSICAL_CASE', 'CONSTRAINT', 'MECHANISM', 'STIFFNESS',
  'CONDITIONING', 'UNSUPPORTED_FEATURE', 'STALE_EVIDENCE', 'TAMPER', 'AUTHORIZATION',
]);

export function createLafeaPreparationRequest(value) {
  const draft = exact(value, [
    'stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
    'preparationProfileId', 'preparationProfileHash', 'requestedCaseIds', 'stageAdapterId',
  ], 'request');
  const record = {
    schema: LAFEA_PREPARATION_REQUEST_SCHEMA,
    stageId: text(draft.stageId, 'stageId'),
    sourceHash: hash(draft.sourceHash, 'sourceHash'),
    canonicalModelHash: hash(draft.canonicalModelHash, 'canonicalModelHash'),
    analysisGeometryHash: draft.analysisGeometryHash === null
      ? null : hash(draft.analysisGeometryHash, 'analysisGeometryHash'),
    preparationProfileId: text(draft.preparationProfileId, 'preparationProfileId'),
    preparationProfileHash: hash(draft.preparationProfileHash, 'preparationProfileHash'),
    requestedCaseIds: strings(draft.requestedCaseIds),
    stageAdapterId: text(draft.stageAdapterId, 'stageAdapterId'),
  };
  return seal(record);
}

export function createLafeaPreparationFinding(value) {
  const draft = exact(value, [
    'code', 'category', 'severity', 'disposition', 'canonicalEntityIds', 'sourcePaths',
    'physicalCaseIds', 'capabilityEffects', 'evidence', 'message', 'technicalBasis',
    'remediation', 'approximationEligible', 'authorizationRequired',
  ], 'finding');
  const core = {
    schema: LAFEA_PREPARATION_FINDING_SCHEMA,
    code: text(draft.code, 'code'),
    category: member(draft.category, LAFEA_PREPARATION_CATEGORIES, 'category'),
    severity: member(draft.severity, LAFEA_PREPARATION_SEVERITIES, 'severity'),
    disposition: member(draft.disposition, LAFEA_PREPARATION_DISPOSITIONS, 'disposition'),
    canonicalEntityIds: strings(draft.canonicalEntityIds),
    sourcePaths: strings(draft.sourcePaths),
    physicalCaseIds: strings(draft.physicalCaseIds),
    capabilityEffects: strings(draft.capabilityEffects),
    evidence: canonical(draft.evidence ?? {}),
    message: text(draft.message, 'message'),
    technicalBasis: text(draft.technicalBasis, 'technicalBasis'),
    remediation: text(draft.remediation, 'remediation'),
    approximationEligible: draft.approximationEligible === true,
    authorizationRequired: draft.authorizationRequired === true,
  };
  const findingHash = canonicalLafeaSha256(core);
  return freeze({
    ...core,
    findingId: `LPF-${findingHash.slice('sha256:'.length, 'sha256:'.length + 24).toUpperCase()}`,
    semanticHash: findingHash,
  });
}

export function createLafeaPreparationEvidence(value) {
  const draft = exact(value, ['request', 'producerRef', 'producerRevision', 'capabilityIds', 'findings'], 'evidence');
  const request = validateLafeaPreparationRequest(draft.request);
  const findings = (draft.findings ?? []).map((row) => validateLafeaPreparationFinding(row))
    .sort((a, b) => compare(a.findingId, b.findingId));
  const status = findings.some((row) => row.disposition === 'BLOCK')
    ? 'BLOCK' : findings.some((row) => ['ADVISORY', 'CONDITIONAL'].includes(row.disposition)) ? 'WARN' : 'PASS';
  const record = {
    schema: LAFEA_PREPARATION_EVIDENCE_SCHEMA,
    request,
    producerRef: text(draft.producerRef, 'producerRef'),
    producerRevision: text(draft.producerRevision, 'producerRevision'),
    capabilityIds: strings(draft.capabilityIds),
    findings,
    status,
  };
  return seal(record);
}

export function createLafeaPreparationApproval(value) {
  const draft = exact(value, [
    'stageId', 'preparationEvidenceHash', 'warningFindingIds', 'approverRef', 'reason',
    'acceptedLimitationIds', 'invalidationPolicy',
  ], 'approval');
  const record = {
    schema: LAFEA_PREPARATION_APPROVAL_SCHEMA,
    stageId: text(draft.stageId, 'stageId'),
    preparationEvidenceHash: hash(draft.preparationEvidenceHash, 'preparationEvidenceHash'),
    warningFindingIds: strings(draft.warningFindingIds),
    approverRef: text(draft.approverRef, 'approverRef'),
    reason: text(draft.reason, 'reason'),
    acceptedLimitationIds: strings(draft.acceptedLimitationIds),
    invalidationPolicy: text(draft.invalidationPolicy, 'invalidationPolicy'),
  };
  return seal(record);
}

export function validateLafeaPreparationRequest(value) {
  return validateSealed(value, LAFEA_PREPARATION_REQUEST_SCHEMA, (row) => createLafeaPreparationRequest({
    stageId: row.stageId, sourceHash: row.sourceHash, canonicalModelHash: row.canonicalModelHash,
    analysisGeometryHash: row.analysisGeometryHash, preparationProfileId: row.preparationProfileId,
    preparationProfileHash: row.preparationProfileHash, requestedCaseIds: row.requestedCaseIds,
    stageAdapterId: row.stageAdapterId,
  }));
}

export function validateLafeaPreparationFinding(value) {
  return validateSealed(value, LAFEA_PREPARATION_FINDING_SCHEMA, (row) => createLafeaPreparationFinding({
    code: row.code, category: row.category, severity: row.severity, disposition: row.disposition,
    canonicalEntityIds: row.canonicalEntityIds, sourcePaths: row.sourcePaths,
    physicalCaseIds: row.physicalCaseIds, capabilityEffects: row.capabilityEffects,
    evidence: row.evidence, message: row.message, technicalBasis: row.technicalBasis,
    remediation: row.remediation, approximationEligible: row.approximationEligible,
    authorizationRequired: row.authorizationRequired,
  }));
}

export function validateLafeaPreparationEvidence(value) {
  return validateSealed(value, LAFEA_PREPARATION_EVIDENCE_SCHEMA, (row) => createLafeaPreparationEvidence({
    request: row.request, producerRef: row.producerRef, producerRevision: row.producerRevision,
    capabilityIds: row.capabilityIds, findings: row.findings,
  }));
}

export function validateLafeaPreparationApproval(value) {
  return validateSealed(value, LAFEA_PREPARATION_APPROVAL_SCHEMA, (row) => createLafeaPreparationApproval({
    stageId: row.stageId, preparationEvidenceHash: row.preparationEvidenceHash,
    warningFindingIds: row.warningFindingIds, approverRef: row.approverRef, reason: row.reason,
    acceptedLimitationIds: row.acceptedLimitationIds, invalidationPolicy: row.invalidationPolicy,
  }));
}

function validateSealed(value, schema, rebuild) {
  if (!value || typeof value !== 'object' || value.schema !== schema) fail('LAFEA_PREPARATION_SCHEMA_INVALID');
  const rebuilt = rebuild(value);
  if (canonicalLafeaSha256(rebuilt) !== canonicalLafeaSha256(value)) fail('LAFEA_PREPARATION_RECORD_TAMPERED');
  return rebuilt;
}

function seal(record) { return freeze({ ...record, semanticHash: canonicalLafeaSha256(record) }); }
function strings(value) {
  if (!Array.isArray(value) || value.some((row) => typeof row !== 'string' || !row.trim())) fail('LAFEA_PREPARATION_STRING_ARRAY_INVALID');
  return [...new Set(value.map((row) => row.trim()))].sort(compare);
}
function text(value, field) { const out = String(value ?? '').trim(); if (!out) fail(`LAFEA_PREPARATION_${field.toUpperCase()}_REQUIRED`); return out; }
function hash(value, field) { const out = text(value, field); if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_PREPARATION_${field.toUpperCase()}_INVALID`); return out; }
function member(value, allowed, field) { if (!allowed.includes(value)) fail(`LAFEA_PREPARATION_${field.toUpperCase()}_INVALID`); return value; }
function exact(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`LAFEA_PREPARATION_${field.toUpperCase()}_OBJECT_REQUIRED`);
  const actual = Object.keys(value).sort(compare); const expected = [...keys].sort(compare);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`LAFEA_PREPARATION_${field.toUpperCase()}_KEYS_INVALID`);
  return value;
}
function canonical(value) { canonicalLafeaSha256(value); return structuredClone(value); }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
