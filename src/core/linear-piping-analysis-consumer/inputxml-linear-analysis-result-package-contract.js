import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  InputXmlLinearAnalysisResultPackageError,
  inputXmlAnalysisResultPackageFailure as fail,
} from './inputxml-linear-analysis-result-package-error.js';
import { requireInputXmlAnalysisResultPackageDraft } from './inputxml-linear-analysis-result-package-validation-v2.js';

export const INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_SCHEMA =
  'fea-inputxml-linear-analysis-result-package/v1';

export const INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_KEYS = Object.freeze([
  'schema', 'packageId', 'analysisProfileId', 'sourceIdentity',
  'modelHealth', 'solvePreparation', 'preflight', 'physicalExecutions',
  'recoveredResults', 'derivedCases', 'codeEvaluation', 'limitations',
  'evidenceManifest', 'summary', 'status', 'semanticHash', 'evidenceHash',
]);

export function sealInputXmlLinearAnalysisResultPackage(value) {
  requireInputXmlAnalysisResultPackageDraft(value, INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_KEYS);
  const draft = structuredClone(value);
  const semantic = semanticHash(inputXmlAnalysisResultPackageSemanticProjection(draft));
  const evidence = semanticHash(inputXmlAnalysisResultPackageEvidenceProjection(draft, semantic));
  return requireInputXmlLinearAnalysisResultPackage(deepFreeze({
    ...draft,
    semanticHash: semantic,
    evidenceHash: evidence,
  }));
}

export function requireInputXmlLinearAnalysisResultPackage(value) {
  if (!isPlainRecord(value)
    || value.schema !== INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_SCHEMA) {
    fail('InputXML analysis-result package schema is invalid.', 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID');
  }
  requireInputXmlAnalysisResultPackageDraft(value, INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_KEYS);
  const semantic = semanticHash(inputXmlAnalysisResultPackageSemanticProjection(value));
  if (value.semanticHash !== semantic) fail(
    'InputXML analysis-result package semantic hash mismatch.',
    'INPUTXML_RESULT_PACKAGE_HASH_MISMATCH',
  );
  const evidence = semanticHash(inputXmlAnalysisResultPackageEvidenceProjection(value, semantic));
  if (value.evidenceHash !== evidence) fail(
    'InputXML analysis-result package evidence hash mismatch.',
    'INPUTXML_RESULT_PACKAGE_HASH_MISMATCH',
  );
  return deepFreeze(value);
}

export function inputXmlAnalysisResultPackageSemanticProjection(value) {
  return Object.fromEntries(INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_KEYS
    .filter((key) => key !== 'semanticHash' && key !== 'evidenceHash')
    .map((key) => [key, value[key]]));
}

export function inputXmlAnalysisResultPackageEvidenceProjection(value, semanticHashValue) {
  return {
    semanticHash: semanticHashValue,
    manifestId: value.evidenceManifest.manifestId,
    sourceEvidenceHash: value.modelHealth.evidenceHash,
    solvePreparationEvidenceHash: value.solvePreparation.evidenceHash,
    preflightEvidenceHash: value.preflight.evidenceHash,
    executionEvidenceHashes: value.physicalExecutions.map((row) => row.evidenceHash),
    recoveryEvidenceHashes: value.recoveredResults.map((row) => row.evidenceHash),
    derivedEvidenceHashes: value.derivedCases.map((row) => row.evidenceHash),
    codeEvaluationEvidenceHash: value.codeEvaluation.evidenceHash,
    status: value.status,
  };
}

export { InputXmlLinearAnalysisResultPackageError };
