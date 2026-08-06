import { createHash } from 'node:crypto';
import { canonicalStringify, semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA = 'fea-inputxml-linear-prefea-request/v1';
export const INPUTXML_LINEAR_PREFEA_DIAGNOSTICS_SCHEMA = 'fea-inputxml-linear-prefea-diagnostics/v1';
export const INPUTXML_LINEAR_PREFEA_PREPARATION_SCHEMA = 'fea-inputxml-linear-prefea-preparation/v1';
export const INPUTXML_LINEAR_SOLVE_AUTHORIZATION_SCHEMA = 'fea-inputxml-linear-solve-authorization/v1';

export const PREFEA_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'FATAL']);
export const PREFEA_DISPOSITIONS = Object.freeze(['PASS', 'ADVISORY', 'CONDITIONAL', 'BLOCK']);
export const PREFEA_CATEGORIES = Object.freeze([
  'SOURCE', 'SCHEMA', 'UNIT', 'GEOMETRY', 'TOPOLOGY', 'COMPONENT', 'MATERIAL',
  'SECTION', 'RIGID', 'RESTRAINT', 'LOAD', 'PRESSURE', 'THERMAL', 'PHYSICAL_CASE',
  'CONSTRAINT', 'MECHANISM', 'STIFFNESS', 'CONDITIONING', 'AUTHORIZATION',
  'STALE_EVIDENCE', 'TAMPER', 'UNSUPPORTED_FEATURE',
]);

const REQUEST_KEYS = Object.freeze([
  'schema', 'analysisRequest', 'requestedProfileId', 'requestedCaseIds',
]);
const FORBIDDEN_RUNTIME_KEYS = /(?:matrix|matrices|triplet|workspace|cache|runtime|factorizationHandle|factorHandle|solverHandle)$/iu;

export class InputXmlLinearPreFeaError extends Error {
  constructor(message, code, data = {}) {
    super(message);
    this.name = 'InputXmlLinearPreFeaError';
    this.code = code;
    this.data = deepFreeze(structuredClone(data));
  }
}

export function validateInputXmlLinearPreFeaRequest(request, validateSourceRequest) {
  requirePlainObject(request, 'request');
  requireExactKeys(request, REQUEST_KEYS, 'request');
  if (request.schema !== INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA) {
    fail('PREFEA_REQUEST_SCHEMA_UNSUPPORTED', 'Unsupported pre-FEA request schema.', {
      suppliedSchema: request.schema,
      expectedSchema: INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
    });
  }
  if (typeof validateSourceRequest !== 'function') {
    fail('PREFEA_SOURCE_REQUEST_VALIDATOR_MISSING', 'A production source-request validator is required.');
  }
  const sourceRequest = validateSourceRequest(request.analysisRequest);
  const profileId = nonempty(request.requestedProfileId, 'request.requestedProfileId');
  const requestedCaseIds = uniqueAscii(requireStringArray(
    request.requestedCaseIds,
    'request.requestedCaseIds',
    { allowEmpty: false },
  ));
  return deepFreeze({
    schema: INPUTXML_LINEAR_PREFEA_REQUEST_SCHEMA,
    analysisRequest: sourceRequest,
    inputXmlSource: sourceRequest.inputXmlSource,
    sourceAnalysisRequest: sourceRequest.sourceAnalysisRequest,
    ingestionOptions: sourceRequest.ingestionOptions,
    conditioning: sourceRequest.conditioning,
    requestedProfileId: profileId,
    requestedCaseIds,
  });
}

export function makeFinding(value) {
  requirePlainObject(value, 'finding');
  const category = member(value.category, PREFEA_CATEGORIES, 'finding.category');
  const severity = member(value.severity, PREFEA_SEVERITIES, 'finding.severity');
  const disposition = member(value.disposition, PREFEA_DISPOSITIONS, 'finding.disposition');
  const identity = {
    code: nonempty(value.code, 'finding.code'),
    category,
    disposition,
    capabilityEffects: uniqueAscii(value.capabilityEffects ?? []),
    sourceFeatureIds: uniqueAscii(value.sourceFeatureIds ?? []),
    sourcePaths: uniqueAscii(value.sourcePaths ?? []),
    canonicalEntityIds: uniqueAscii(value.canonicalEntityIds ?? []),
    physicalCaseIds: uniqueAscii(value.physicalCaseIds ?? []),
    evidence: canonicalEvidence(value.evidence ?? {}),
  };
  const findingId = value.findingId === undefined
    ? `PF-${sha256(canonicalStringify(identity)).slice(0, 24).toUpperCase()}`
    : nonempty(value.findingId, 'finding.findingId');
  return deepFreeze({
    findingId,
    code: identity.code,
    category,
    severity,
    disposition,
    capabilityEffects: identity.capabilityEffects,
    sourceFeatureIds: identity.sourceFeatureIds,
    sourcePaths: identity.sourcePaths,
    canonicalEntityIds: identity.canonicalEntityIds,
    physicalCaseIds: identity.physicalCaseIds,
    message: nonempty(value.message, 'finding.message'),
    technicalBasis: nonempty(value.technicalBasis, 'finding.technicalBasis'),
    evidence: identity.evidence,
    remediation: nonempty(value.remediation, 'finding.remediation'),
    approximationEligible: value.approximationEligible === true,
    authorizationRequired: value.authorizationRequired === true,
  });
}

export function sealPreFeaRecord(record, schema, identityProjection, evidenceProjection) {
  requirePlainObject(record, 'record');
  if (record.schema !== schema) {
    fail('PREFEA_RECORD_SCHEMA_INVALID', `Expected ${schema}.`, { actual: record.schema });
  }
  assertSerializable(record);
  const draft = structuredClone(record);
  draft.semanticHash = '';
  draft.evidenceHash = '';
  const semanticProjection = identityProjection(draft);
  const evidence = evidenceProjection(draft);
  draft.semanticHash = semanticHash(semanticProjection);
  draft.evidenceHash = semanticHash({ semanticHash: draft.semanticHash, evidence });
  return deepFreeze(draft);
}

export function requirePreFeaRecord(record, schema, identityProjection, evidenceProjection) {
  requirePlainObject(record, 'record');
  if (record.schema !== schema) {
    fail('PREFEA_RECORD_SCHEMA_INVALID', `Expected ${schema}.`, { actual: record.schema });
  }
  assertSerializable(record);
  const semanticHashValue = semanticHash(identityProjection(record));
  const evidenceHashValue = semanticHash({
    semanticHash: semanticHashValue,
    evidence: evidenceProjection(record),
  });
  if (record.semanticHash !== semanticHashValue || record.evidenceHash !== evidenceHashValue) {
    fail('PREFEA_RECORD_TAMPERED', 'The sealed pre-FEA record failed hash validation.', {
      expectedSemanticHash: semanticHashValue,
      actualSemanticHash: record.semanticHash,
      expectedEvidenceHash: evidenceHashValue,
      actualEvidenceHash: record.evidenceHash,
    });
  }
  return record;
}

export function foldReadiness(findings, requestedCaseIds = []) {
  const rows = [...findings].map(makeFinding).sort((a, b) => compareAscii(a.findingId, b.findingId));
  const blocking = rows.filter((row) => row.disposition === 'BLOCK');
  const conditional = rows.filter((row) => row.disposition === 'CONDITIONAL');
  const status = blocking.length > 0 ? 'BLOCK' : conditional.length > 0 ? 'WARN' : 'PASS';
  const counts = Object.fromEntries(PREFEA_SEVERITIES.map((severity) => [
    severity,
    rows.filter((row) => row.severity === severity).length,
  ]));
  return deepFreeze({
    status,
    findings: rows,
    findingCounts: counts,
    requestedCaseIds: uniqueAscii(requestedCaseIds),
    warningFindingIds: conditional.map((row) => row.findingId),
    blockingFindingIds: blocking.map((row) => row.findingId),
  });
}

export function assertSerializable(value, path = '$', seen = new Set()) {
  if (value === null || value === undefined) return;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    fail('PREFEA_RUNTIME_STATE_PROHIBITED', `Non-serializable value at ${path}.`, { path });
  }
  if (typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      fail('PREFEA_NONFINITE_VALUE', `Non-finite value at ${path}.`, { path });
    }
    return;
  }
  if (seen.has(value)) fail('PREFEA_CYCLIC_RECORD', `Cyclic record at ${path}.`, { path });
  seen.add(value);
  if (value instanceof Map || value instanceof Set || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail('PREFEA_RUNTIME_STATE_PROHIBITED', `Runtime collection at ${path}.`, { path });
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSerializable(entry, `${path}[${index}]`, seen));
  } else {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_RUNTIME_KEYS.test(key) && value[key] !== null && value[key] !== false
        && value[key] !== 'NOT_RETAINED' && value[key] !== 'NOT_CREATED'
        && value[key] !== 'NOT_AUTHORIZED' && value[key] !== 'DEFERRED') {
        fail('PREFEA_RUNTIME_STATE_PROHIBITED', `Prohibited runtime key ${path}.${key}.`, { path, key });
      }
      assertSerializable(value[key], `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function uniqueAscii(values) {
  return [...new Set((values ?? []).filter((value) => value !== null && value !== undefined)
    .map(String))].sort(compareAscii);
}

export function fail(code, message, data = {}) {
  throw new InputXmlLinearPreFeaError(message, code, data);
}

function canonicalEvidence(value) {
  assertSerializable(value, 'finding.evidence');
  if (Array.isArray(value)) return value.map(canonicalEvidence);
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.keys(value).sort(compareAscii)
      .map((key) => [key, canonicalEvidence(value[key])])));
  }
  return value;
}

function requireExactKeys(value, keys, field) {
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('PREFEA_REQUEST_KEYS_INVALID', `${field} keys are invalid.`, { actual, expected });
  }
}

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('PREFEA_OBJECT_REQUIRED', `${field} must be a plain object.`, { field });
  }
  return value;
}

function requireStringArray(value, field, { allowEmpty }) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    fail('PREFEA_STRING_ARRAY_INVALID', `${field} must be an array of non-empty strings.`, { field });
  }
  return value.map((entry) => entry.trim());
}

function nonempty(value, field) {
  const text = String(value ?? '').trim();
  if (!text) fail('PREFEA_VALUE_REQUIRED', `${field} is required.`, { field });
  return text;
}

function member(value, allowed, field) {
  if (!allowed.includes(value)) fail('PREFEA_ENUM_INVALID', `${field} is invalid.`, { field, value, allowed });
  return value;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
