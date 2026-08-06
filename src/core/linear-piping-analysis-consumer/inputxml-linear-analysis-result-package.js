import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearB31Evaluation } from './inputxml-linear-b31-evaluation-contract.js';
import { requireInputXmlLinearCaseExecution } from './inputxml-linear-case-execution-contract.js';
import { requireInputXmlLinearDerivedCase } from './inputxml-linear-derived-case-contract.js';
import {
  INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_SCHEMA,
  sealInputXmlLinearAnalysisResultPackage,
} from './inputxml-linear-analysis-result-package-contract.js';
import {
  buildInputXmlAnalysisResultEvidenceManifest,
  inputXmlAnalysisResultPackageLimitations,
  inputXmlAnalysisResultPackageStatus,
  inputXmlAnalysisResultPackageSummary,
} from './inputxml-linear-analysis-result-package-custody.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';
import { requireInputXmlLinearRecoveredCase } from './inputxml-linear-recovered-case-contract.js';
import { requireInputXmlLinearModelHealth } from './inputxml-model-health-contract.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStiffnessPreflight } from './inputxml-linear-stiffness-preflight-contract.js';

export const INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_SCHEMA =
  'fea-inputxml-linear-analysis-result-package-request/v1';

export const INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_KEYS = Object.freeze([
  'schema', 'packageId', 'modelHealth', 'solvePreparation', 'preflight',
  'physicalExecutions', 'recoveredResults', 'derivedCases', 'codeEvaluation',
]);

export function packageInputXmlLinearAnalysisResults(request) {
  requireRequest(request);
  const modelHealth = requireInputXmlLinearModelHealth(request.modelHealth);
  const solvePreparation = requireInputXmlLinearSolvePreparation(request.solvePreparation);
  const preflight = requireInputXmlLinearStiffnessPreflight(request.preflight, solvePreparation);
  const physicalExecutions = canonical(
    request.physicalExecutions.map((row) => requireInputXmlLinearCaseExecution(row)),
    'caseId',
  );
  const recoveredResults = canonical(
    request.recoveredResults.map((row) => requireInputXmlLinearRecoveredCase(row)),
    'recoveredCaseId',
  );
  const derivedCases = canonical(
    request.derivedCases.map((row) => requireInputXmlLinearDerivedCase(row)),
    'derivedCaseId',
  );
  const codeEvaluation = requireInputXmlLinearB31Evaluation(request.codeEvaluation, {
    solvePreparation,
    preflight,
    derivedCases,
  });
  const sourceIdentity = Object.freeze({
    sourceBundleSemanticHash: modelHealth.sourceBundleSemanticHash,
    sourceBundleEvidenceHash: modelHealth.sourceBundleEvidenceHash,
    topologySemanticHash: modelHealth.topologySemanticHash,
    topologyEvidenceHash: modelHealth.topologyEvidenceHash,
    modelHealthSemanticHash: modelHealth.semanticHash,
    modelHealthEvidenceHash: modelHealth.evidenceHash,
    solvePreparationSemanticHash: solvePreparation.semanticHash,
    solvePreparationEvidenceHash: solvePreparation.evidenceHash,
    preflightSemanticHash: preflight.semanticHash,
    preflightEvidenceHash: preflight.evidenceHash,
  });
  const partial = {
    modelHealth,
    solvePreparation,
    preflight,
    physicalExecutions,
    recoveredResults,
    derivedCases,
    codeEvaluation,
  };
  const limitations = inputXmlAnalysisResultPackageLimitations(partial);
  const status = inputXmlAnalysisResultPackageStatus(partial);
  const evidenceManifest = buildInputXmlAnalysisResultEvidenceManifest(partial);
  const summary = inputXmlAnalysisResultPackageSummary(partial, limitations, status);
  const packageId = requireText(request.packageId, 'request.packageId');
  return sealInputXmlLinearAnalysisResultPackage({
    schema: INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_SCHEMA,
    packageId,
    analysisProfileId: solvePreparation.analysisProfileId,
    sourceIdentity,
    ...partial,
    limitations,
    evidenceManifest,
    summary,
    status,
    semanticHash: '',
    evidenceHash: '',
  });
}

function requireRequest(value) {
  if (!isPlainRecord(value)
    || value.schema !== INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_SCHEMA) fail(
    'InputXML analysis-result package request schema is invalid.',
    'INPUTXML_RESULT_PACKAGE_REQUEST_INVALID',
  );
  INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_KEYS.forEach((key) => {
    if (!Object.hasOwn(value, key)) fail(
      `InputXML result package request is missing ${key}.`,
      'INPUTXML_RESULT_PACKAGE_REQUEST_INVALID',
    );
  });
  Object.keys(value).forEach((key) => {
    if (!INPUTXML_LINEAR_ANALYSIS_RESULT_PACKAGE_REQUEST_KEYS.includes(key)) fail(
      `InputXML result package request contains unexpected ${key}.`,
      'INPUTXML_RESULT_PACKAGE_REQUEST_INVALID',
    );
  });
  requireText(value.packageId, 'request.packageId');
  for (const key of ['physicalExecutions', 'recoveredResults', 'derivedCases']) {
    if (!Array.isArray(value[key]) || value[key].length === 0) fail(
      `InputXML result package request ${key} must be non-empty.`,
      'INPUTXML_RESULT_PACKAGE_REQUEST_INVALID',
    );
  }
}

function canonical(values, key) {
  return Object.freeze([...values].sort((left, right) => compareAscii(left[key], right[key])));
}
function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_RESULT_PACKAGE_REQUEST_INVALID',
  );
  return value;
}
function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
