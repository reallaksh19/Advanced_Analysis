import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';

export const MULTICASE_APPLICATION_REQUEST_SCHEMA =
  'linear-piping-multicase-application-request/v1';
export const MULTICASE_APPLICATION_SCHEMA =
  'linear-piping-multicase-application/v1';

export const MULTICASE_APPLICATION_INPUT_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'cases',
  'interfaceAuthority',
  'nozzleAllowableProfiles',
  'b31Authority',
]);

export const MULTICASE_CASE_INPUT_KEYS = Object.freeze([
  'caseId',
  'inputXmlAnalysisContext',
]);

export const MULTICASE_INTERFACE_AUTHORITY_KEYS = Object.freeze([
  'supportAttachmentModel',
  'restraintCapabilityModel',
  'definitions',
  'profile',
]);

export const MULTICASE_B31_AUTHORITY_KEYS = Object.freeze([
  'applicationId',
  'codeProfile',
  'editionDataset',
  'checks',
]);

export const MULTICASE_APPLICATION_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'cases',
  'interfaceSet',
  'interfaceRecoveries',
  'interfaceEnvelope',
  'nozzleAllowableProfiles',
  'nozzleCaseAssessments',
  'nozzleGoverningAssessments',
  'nozzleEnvelope',
  'b31Application',
  'applicationResult',
  'status',
  'semanticHash',
  'evidenceHash',
]);

export const MULTICASE_CASE_BINDING_KEYS = Object.freeze([
  'caseId',
  'inputXmlContextSemanticHash',
  'inputXmlContextEvidenceHash',
  'sourceSemanticHash',
  'inputXmlContentHash',
  'conditionedTopologyHash',
  'compilationSemanticHash',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'loadCaseId',
  'physicalLoadCaseHash',
  'analysisResultSemanticHash',
  'analysisResultEvidenceHash',
]);

export const MULTICASE_NOZZLE_ENVELOPE_KEYS = Object.freeze([
  'interfaceId',
  'profileSemanticHash',
  'governingLoadCaseId',
  'governingAssessmentSemanticHash',
  'utilization',
  'assessmentStatus',
  'caseAssessmentSemanticHashes',
]);

export class LinearPipingMulticaseApplicationError extends Error {
  constructor(message, code, evidence = null) {
    super(message);
    this.name = 'LinearPipingMulticaseApplicationError';
    this.code = code;
    this.evidence = evidence;
  }
}

export function failMulticaseApplication(message, code, evidence = null) {
  throw new LinearPipingMulticaseApplicationError(message, code, evidence);
}

export function requireRecord(value, field) {
  if (!isPlainRecord(value)) {
    failMulticaseApplication(`${field} must be a record.`, 'PIPING_MULTICASE_RECORD_REQUIRED');
  }
  return value;
}

export function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failMulticaseApplication(
      `${field} keys are invalid.`,
      'PIPING_MULTICASE_KEYS_INVALID',
      { actual, required },
    );
  }
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failMulticaseApplication(`${field} must be an array.`, 'PIPING_MULTICASE_ARRAY_REQUIRED');
  }
  return value;
}

export function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    failMulticaseApplication(`${field} must be a non-empty string.`, 'PIPING_MULTICASE_TEXT_REQUIRED');
  }
  return value;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    failMulticaseApplication(`${field} must be a semantic hash.`, 'PIPING_MULTICASE_HASH_INVALID');
  }
  return value;
}

export function requireUnique(values, code, label) {
  if (new Set(values).size !== values.length) {
    failMulticaseApplication(`${label} values must be unique.`, code, { values });
  }
}

export function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

export function hashSemanticProjection(record) {
  return semanticHash({
    schema: record.schema,
    applicationId: record.applicationId,
    caseBindings: record.cases.map(caseSemanticProjection),
    interfaceSetSemanticHash: record.interfaceSet.semanticHash,
    interfaceRecoverySemanticHashes: record.interfaceRecoveries.map((row) => row.semanticHash),
    interfaceEnvelopeSemanticHash: record.interfaceEnvelope.semanticHash,
    nozzleAllowableProfileSemanticHashes: record.nozzleAllowableProfiles.map((row) => row.semanticHash),
    nozzleCaseAssessmentSemanticHashes: record.nozzleCaseAssessments.map((row) => row.semanticHash),
    nozzleGoverningAssessmentSemanticHashes: record.nozzleGoverningAssessments.map((row) => row.semanticHash),
    nozzleEnvelope: record.nozzleEnvelope,
    b31ApplicationSemanticHash: record.b31Application.semanticHash,
    applicationResultSemanticHash: record.applicationResult.semanticHash,
    status: record.status,
  });
}

export function hashEvidenceProjection(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    caseEvidenceHashes: record.cases.map((row) => row.inputXmlAnalysisContext.evidenceHash),
    interfaceSetEvidenceHash: record.interfaceSet.evidenceHash,
    interfaceRecoveryEvidenceHashes: record.interfaceRecoveries.map((row) => row.evidenceHash),
    interfaceEnvelopeEvidenceHash: record.interfaceEnvelope.evidenceHash,
    nozzleProfileSemanticHashes: record.nozzleAllowableProfiles.map((row) => row.semanticHash),
    nozzleCaseAssessmentEvidenceHashes: record.nozzleCaseAssessments.map((row) => row.evidenceHash),
    nozzleGoverningAssessmentEvidenceHashes: record.nozzleGoverningAssessments.map((row) => row.evidenceHash),
    b31ApplicationEvidenceHash: record.b31Application.evidenceHash,
    applicationResultEvidenceHash: record.applicationResult.evidenceHash,
  });
}

export function caseSemanticProjection(row) {
  const context = row.inputXmlAnalysisContext;
  const sourceContext = context.sourceAnalysisContext;
  return freezeClone({
    caseId: row.caseId,
    inputXmlContextSemanticHash: context.semanticHash,
    sourceSemanticHash: context.inputXmlSource.semanticHash,
    conditionedTopologyHash: context.conditionedTopologyHash,
    compilationSemanticHash: sourceContext.compilation.semanticHash,
    mechanicalModelSemanticHash: sourceContext.compilation.mechanicalModelSemanticHash,
    stiffnessStateHash: sourceContext.compilation.stiffnessStateHash,
    physicalLoadCaseHash: sourceContext.loadCase.physicalLoadCaseHash,
    analysisResultSemanticHash: sourceContext.analysisResult.semanticHash,
  });
}

export function caseEvidenceRecord(row) {
  const context = row.inputXmlAnalysisContext;
  const sourceContext = context.sourceAnalysisContext;
  return freezeClone({
    caseId: row.caseId,
    inputXmlContextSemanticHash: context.semanticHash,
    inputXmlContextEvidenceHash: context.evidenceHash,
    sourceSemanticHash: context.inputXmlSource.semanticHash,
    inputXmlContentHash: context.inputXmlSource.contentHash,
    conditionedTopologyHash: context.conditionedTopologyHash,
    compilationSemanticHash: sourceContext.compilation.semanticHash,
    mechanicalModelSemanticHash: sourceContext.compilation.mechanicalModelSemanticHash,
    stiffnessStateHash: sourceContext.compilation.stiffnessStateHash,
    loadCaseId: sourceContext.loadCase.loadCaseId,
    physicalLoadCaseHash: sourceContext.loadCase.physicalLoadCaseHash,
    analysisResultSemanticHash: sourceContext.analysisResult.semanticHash,
    analysisResultEvidenceHash: sourceContext.analysisResult.evidenceHash,
  });
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
