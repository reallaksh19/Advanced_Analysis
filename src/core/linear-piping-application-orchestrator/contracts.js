import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { failCodeApplication } from '../linear-piping-code-application/index.js';

export const COMPLETE_APPLICATION_REQUEST_SCHEMA =
  'linear-piping-complete-application-request/v1';
export const COMPLETE_APPLICATION_PACKAGE_SCHEMA =
  'linear-piping-complete-application-package/v1';
export const B31_CONFIGURATION_SCHEMA =
  'linear-piping-b31-configuration/v1';

export const COMPLETE_APPLICATION_REQUEST_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'analysisContexts',
  'interfaceSet',
  'nozzleBindings',
  'b31Configuration',
]);
export const NOZZLE_BINDING_KEYS = Object.freeze([
  'caseId',
  'allowableProfile',
]);
export const B31_CONFIGURATION_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'codeProfile',
  'editionDataset',
  'checks',
]);
export const COMPLETE_APPLICATION_PACKAGE_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'analysisContexts',
  'analysisResults',
  'interfaceSet',
  'interfaceRecoveries',
  'nozzleAssessments',
  'b31Application',
  'applicationResult',
  'semanticHash',
  'evidenceHash',
]);

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export function packageSemanticProjection(value) {
  return {
    schema: value.schema,
    applicationId: value.applicationId,
    analysisContextSemanticHashes: value.analysisContexts.map((row) => row.semanticHash),
    analysisResultSemanticHashes: value.analysisResults.map((row) => row.semanticHash),
    interfaceSetSemanticHash: value.interfaceSet.semanticHash,
    interfaceRecoverySemanticHashes: value.interfaceRecoveries.map((row) => row.semanticHash),
    nozzleAssessmentSemanticHashes: value.nozzleAssessments.map((row) => row.semanticHash),
    b31ApplicationSemanticHash: value.b31Application.semanticHash,
    applicationResultSemanticHash: value.applicationResult.semanticHash,
  };
}

export function computeCompleteApplicationPackageSemanticHash(value) {
  return semanticHash(packageSemanticProjection(value));
}

export function computeCompleteApplicationPackageEvidenceHash(value) {
  return semanticHash({
    semanticHash: value.semanticHash,
    analysisContextEvidenceHashes: value.analysisContexts.map((row) => row.evidenceHash),
    analysisEvidenceHashes: value.analysisResults.map((row) => row.evidenceHash),
    interfaceSetEvidenceHash: value.interfaceSet.evidenceHash,
    interfaceRecoveryEvidenceHashes: value.interfaceRecoveries.map((row) => row.evidenceHash),
    nozzleAssessmentEvidenceHashes: value.nozzleAssessments.map((row) => row.evidenceHash),
    b31ApplicationEvidenceHash: value.b31Application.evidenceHash,
    applicationResultEvidenceHash: value.applicationResult.evidenceHash,
  });
}

export function requireRecord(value, field) {
  if (!isPlainRecord(value)) {
    failOrchestrator(`${field} must be a record.`, 'PIPING_ORCHESTRATOR_RECORD_REQUIRED');
  }
  return value;
}

export function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failOrchestrator(
      `${field} keys are invalid.`,
      'PIPING_ORCHESTRATOR_KEYS_INVALID',
      { actual, required },
    );
  }
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failOrchestrator(`${field} must be an array.`, 'PIPING_ORCHESTRATOR_ARRAY_REQUIRED');
  }
  return value;
}

export function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    failOrchestrator(`${field} must be a non-empty string.`, 'PIPING_ORCHESTRATOR_TEXT_REQUIRED');
  }
  return value;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failOrchestrator(`${field} must be a semantic hash.`, 'PIPING_ORCHESTRATOR_HASH_INVALID');
  }
  return value;
}

export function requireUnique(values, code) {
  if (new Set(values).size !== values.length) {
    failOrchestrator('Duplicate orchestration identity is not permitted.', code, { values });
  }
}

export function freezeArray(value) {
  return deepFreeze([...value]);
}

export function failOrchestrator(message, code, evidence) {
  failCodeApplication(message, code, evidence);
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
