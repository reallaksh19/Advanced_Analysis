import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const PIPING_PRESENTATION_SCHEMA = 'linear-piping-presentation/v1';
export const PRESENTATION_CURRENCY = 'CURRENT';
export const EXPORT_ELIGIBILITY = Object.freeze([
  'ENGINEERING_EXPORT_ALLOWED',
  'AUDIT_ONLY_CONDITIONAL',
]);
export const PRESENTATION_STATUSES = Object.freeze(['QUALIFIED', 'CONDITIONAL']);

export const PRESENTATION_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'applicationResultSemanticHash',
  'applicationResultEvidenceHash',
  'currency',
  'status',
  'exportEligibility',
  'summary',
  'analysisRows',
  'interfaceRows',
  'nozzleRows',
  'codeRows',
  'notConfigured',
  'limitations',
  'semanticHash',
  'evidenceHash',
]);
export const SUMMARY_KEYS = Object.freeze([
  'analysisCount',
  'interfaceResultCount',
  'nozzleAssessmentCount',
  'codeCheckCount',
  'nozzlePassCount',
  'nozzleFailCount',
  'nozzleNotConfiguredCount',
  'codeQualifiedCount',
  'codeConditionalCount',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class LinearPipingPresentationError extends SharedAnalysisContractError {
  constructor(message, code, evidence = null) {
    super(message, code);
    this.name = 'LinearPipingPresentationError';
    this.evidence = evidence;
  }
}

export function failPresentation(message, code, evidence = null) {
  throw new LinearPipingPresentationError(message, code, evidence);
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failPresentation(`${field} must be a semantic hash.`, 'PIPING_PRESENTATION_HASH_INVALID', {
      field,
      value,
    });
  }
  return value;
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failPresentation(`${field} must be an array.`, 'PIPING_PRESENTATION_ARRAY_REQUIRED', { field });
  }
  return value;
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function presentationSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}

export function computePresentationSemanticHash(record) {
  return semanticHash(presentationSemanticProjection(record));
}

export function computePresentationEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    applicationResultEvidenceHash: record.applicationResultEvidenceHash,
    rowEvidence: {
      analyses: record.analysisRows.map((row) => row.evidenceHash),
      interfaces: record.interfaceRows.map((row) => row.recoveryEvidenceHash),
      nozzles: record.nozzleRows.map((row) => row.evidenceHash),
      code: record.codeRows.map((row) => row.evidenceHash),
    },
  });
}

export function requireLinearPipingPresentation(record) {
  exactKeys(record, PRESENTATION_KEYS, 'linearPipingPresentation');
  if (record.schema !== PIPING_PRESENTATION_SCHEMA) {
    failPresentation('Presentation schema is invalid.', 'PIPING_PRESENTATION_INVALID');
  }
  nonEmptyString(record.applicationId, 'linearPipingPresentation.applicationId');
  requireHash(record.applicationResultSemanticHash, 'linearPipingPresentation.applicationResultSemanticHash');
  requireHash(record.applicationResultEvidenceHash, 'linearPipingPresentation.applicationResultEvidenceHash');
  requireHash(record.semanticHash, 'linearPipingPresentation.semanticHash');
  requireHash(record.evidenceHash, 'linearPipingPresentation.evidenceHash');
  if (record.currency !== PRESENTATION_CURRENCY) {
    failPresentation('Only CURRENT presentations are valid.', 'PIPING_PRESENTATION_STALE');
  }
  if (!PRESENTATION_STATUSES.includes(record.status)) {
    failPresentation('Presentation status is invalid.', 'PIPING_PRESENTATION_INVALID');
  }
  if (!EXPORT_ELIGIBILITY.includes(record.exportEligibility)) {
    failPresentation('Presentation export eligibility is invalid.', 'PIPING_PRESENTATION_INVALID');
  }
  const expectedEligibility = record.status === 'QUALIFIED' && record.notConfigured.length === 0
    ? 'ENGINEERING_EXPORT_ALLOWED'
    : 'AUDIT_ONLY_CONDITIONAL';
  if (record.exportEligibility !== expectedEligibility) {
    failPresentation(
      'Presentation export eligibility does not match current qualification state.',
      'PIPING_PRESENTATION_EXPORT_ELIGIBILITY_INVALID',
    );
  }
  exactKeys(record.summary, SUMMARY_KEYS, 'linearPipingPresentation.summary');
  for (const key of SUMMARY_KEYS) {
    if (!Number.isInteger(record.summary[key]) || record.summary[key] < 0) {
      failPresentation('Presentation summary counts must be non-negative integers.', 'PIPING_PRESENTATION_INVALID');
    }
  }
  for (const field of ['analysisRows', 'interfaceRows', 'nozzleRows', 'codeRows', 'notConfigured', 'limitations']) {
    requireArray(record[field], `linearPipingPresentation.${field}`);
  }
  if (record.semanticHash !== computePresentationSemanticHash(record)) {
    failPresentation('Presentation semantic hash is stale.', 'PIPING_PRESENTATION_HASH_MISMATCH');
  }
  if (record.evidenceHash !== computePresentationEvidenceHash(record)) {
    failPresentation('Presentation evidence hash is stale.', 'PIPING_PRESENTATION_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}
