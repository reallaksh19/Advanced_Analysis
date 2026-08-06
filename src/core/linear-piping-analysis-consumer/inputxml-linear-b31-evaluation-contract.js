import { requireCodeResult } from '../linear-fea-b31-code-engine/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearDerivedCase } from './inputxml-linear-derived-case-contract.js';
import {
  InputXmlLinearB31EvaluationError,
  inputXmlB31Failure as fail,
} from './inputxml-linear-b31-error.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStiffnessPreflight } from './inputxml-linear-stiffness-preflight-contract.js';

export const INPUTXML_LINEAR_B31_EVALUATION_SCHEMA =
  'fea-inputxml-linear-b31-evaluation/v1';

export const INPUTXML_LINEAR_B31_EVALUATION_KEYS = Object.freeze([
  'schema', 'evaluationId', 'analysisProfileId', 'sourceIdentity',
  'codeAuthorityIdentity', 'derivedCaseBindings', 'results',
  'limitations', 'status', 'semanticHash', 'evidenceHash',
]);

export const INPUTXML_LINEAR_B31_RESULT_KEYS = Object.freeze([
  'checkId', 'category', 'derivedCaseId', 'derivedCaseSemanticHash',
  'sourceStationId', 'sourceElementId', 'sourceRecoveredCaseId',
  'sourceRecoverySemanticHash', 'stationCustodyHash', 'authorityIdentity',
  'pressureCustodyIds', 'pressureStressContribution', 'codeResult',
  'limitations', 'status',
]);

const PROHIBITED_KEYS = new Set([
  'factorizationHandle', 'factorizationCache', 'genericRuntime', 'runtime',
  'solvePreparation', 'preflight', 'K', 'sparseK', 'triplets', 'matrix',
  'localStiffness', 'globalStiffness', 'sparseFactor', 'scaleFactors',
]);

export function sealInputXmlLinearB31Evaluation(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(inputXmlB31SemanticProjection(draft));
  const evidence = semanticHash(inputXmlB31EvidenceProjection(draft, semantic));
  return requireInputXmlLinearB31Evaluation(deepFreeze({
    ...draft,
    semanticHash: semantic,
    evidenceHash: evidence,
  }));
}

export function requireInputXmlLinearB31Evaluation(value, context) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_B31_EVALUATION_SCHEMA) {
    fail('InputXML B31 evaluation schema is invalid.', 'INPUTXML_B31_SCHEMA_INVALID');
  }
  requireDraft(value);
  const semantic = semanticHash(inputXmlB31SemanticProjection(value));
  if (value.semanticHash !== semantic) fail(
    'InputXML B31 semantic hash mismatch.', 'INPUTXML_B31_HASH_MISMATCH',
  );
  const evidence = semanticHash(inputXmlB31EvidenceProjection(value, semantic));
  if (value.evidenceHash !== evidence) fail(
    'InputXML B31 evidence hash mismatch.', 'INPUTXML_B31_HASH_MISMATCH',
  );
  if (context) requireCurrentContext(value, context);
  return deepFreeze(value);
}

export function inputXmlB31SemanticProjection(value) {
  return Object.fromEntries(INPUTXML_LINEAR_B31_EVALUATION_KEYS
    .filter((key) => key !== 'semanticHash' && key !== 'evidenceHash')
    .map((key) => [key, value[key]]));
}

export function inputXmlB31EvidenceProjection(value, semanticHashValue) {
  return {
    semanticHash: semanticHashValue,
    solvePreparationEvidenceHash: value.sourceIdentity.solvePreparationEvidenceHash,
    preflightEvidenceHash: value.sourceIdentity.preflightEvidenceHash,
    derivedCaseEvidence: value.derivedCaseBindings.map((row) => ({
      derivedCaseId: row.derivedCaseId,
      semanticHash: row.semanticHash,
      evidenceHash: row.evidenceHash,
    })),
    codeEvidence: value.results.map((row) => ({
      checkId: row.checkId,
      codeResultSemanticHash: row.codeResult.semanticHash,
      codeResultEvidenceHash: row.codeResult.evidenceHash,
      sourceRecoverySemanticHash: row.sourceRecoverySemanticHash,
    })),
    status: value.status,
  };
}

function requireDraft(value) {
  requireExactKeys(value, INPUTXML_LINEAR_B31_EVALUATION_KEYS, 'evaluation');
  for (const key of ['evaluationId', 'analysisProfileId', 'status']) {
    requireText(value[key], `evaluation.${key}`);
  }
  if (!['QUALIFIED', 'CONDITIONAL'].includes(value.status)) fail(
    'InputXML B31 evaluation status is invalid.', 'INPUTXML_B31_SCHEMA_INVALID',
  );
  requireIdentityRecord(value.sourceIdentity, 'sourceIdentity');
  requireIdentityRecord(value.codeAuthorityIdentity, 'codeAuthorityIdentity');
  requireArray(value.derivedCaseBindings, 'derivedCaseBindings');
  requireArray(value.results, 'results');
  requireArray(value.limitations, 'limitations');
  requireUnique(value.derivedCaseBindings, 'derivedCaseId', 'derivedCaseBindings');
  requireUnique(value.results, 'checkId', 'results');
  value.derivedCaseBindings.forEach((row, index) => {
    requireExactKeys(row, [
      'derivedCaseId', 'semanticHash', 'evidenceHash', 'purpose', 'algebraKind',
    ], `derivedCaseBindings[${index}]`);
    Object.values(row).forEach((entry) => requireText(
      entry, `derivedCaseBindings[${index}]`,
    ));
  });
  value.results.forEach((row, index) => requireResult(row, index));
  value.limitations.forEach((entry, index) => requireText(
    entry, `limitations[${index}]`,
  ));
  walkPortable(value, 'evaluation');
}

function requireResult(row, index) {
  const field = `results[${index}]`;
  requireExactKeys(row, INPUTXML_LINEAR_B31_RESULT_KEYS, field);
  for (const key of [
    'checkId', 'category', 'derivedCaseId', 'derivedCaseSemanticHash',
    'sourceStationId', 'sourceElementId', 'sourceRecoveredCaseId',
    'sourceRecoverySemanticHash', 'stationCustodyHash', 'status',
  ]) requireText(row[key], `${field}.${key}`);
  requireIdentityRecord(row.authorityIdentity, `${field}.authorityIdentity`);
  requireArray(row.pressureCustodyIds, `${field}.pressureCustodyIds`);
  row.pressureCustodyIds.forEach((entry, entryIndex) => requireText(
    entry, `${field}.pressureCustodyIds[${entryIndex}]`,
  ));
  if (row.pressureStressContribution !== null) {
    requireExactKeys(
      row.pressureStressContribution,
      ['value', 'source'],
      `${field}.pressureStressContribution`,
    );
    if (typeof row.pressureStressContribution.value !== 'number'
      || !Number.isFinite(row.pressureStressContribution.value)) fail(
      `${field}.pressureStressContribution.value must be finite.`,
      'INPUTXML_B31_NONFINITE',
    );
    requireText(
      row.pressureStressContribution.source,
      `${field}.pressureStressContribution.source`,
    );
  }
  requireCodeResult(row.codeResult);
  requireArray(row.limitations, `${field}.limitations`);
  row.limitations.forEach((entry, entryIndex) => requireText(
    entry, `${field}.limitations[${entryIndex}]`,
  ));
}

function requireCurrentContext(value, context) {
  const solve = requireInputXmlLinearSolvePreparation(context.solvePreparation);
  const preflight = requireInputXmlLinearStiffnessPreflight(context.preflight, solve);
  if (value.sourceIdentity.solvePreparationSemanticHash !== solve.semanticHash
    || value.sourceIdentity.preflightSemanticHash !== preflight.semanticHash) fail(
    'InputXML B31 evaluation is stale for preparation or preflight.',
    'INPUTXML_B31_CONTEXT_STALE',
  );
  const cases = new Map((context.derivedCases ?? []).map((row) => {
    const accepted = requireInputXmlLinearDerivedCase(row);
    return [accepted.derivedCaseId, accepted];
  }));
  value.derivedCaseBindings.forEach((binding) => {
    const derived = cases.get(binding.derivedCaseId);
    if (!derived || derived.semanticHash !== binding.semanticHash
      || derived.evidenceHash !== binding.evidenceHash) fail(
      `InputXML B31 evaluation is stale for derived case ${binding.derivedCaseId}.`,
      'INPUTXML_B31_CONTEXT_STALE',
    );
  });
}

function walkPortable(value, path) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} is non-finite.`, 'INPUTXML_B31_NONFINITE');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkPortable(entry, `${path}[${index}]`));
    return;
  }
  if (!isPlainRecord(value)) fail(
    `${path} contains non-portable state.`, 'INPUTXML_B31_RUNTIME_STATE_PROHIBITED',
  );
  Object.entries(value).forEach(([key, entry]) => {
    if (PROHIBITED_KEYS.has(key)) fail(
      `${path}.${key} is prohibited runtime state.`,
      'INPUTXML_B31_RUNTIME_STATE_PROHIBITED',
    );
    walkPortable(entry, `${path}.${key}`);
  });
}

function requireIdentityRecord(value, field) {
  if (!isPlainRecord(value) || Object.keys(value).length === 0) fail(
    `${field} must be a non-empty record.`, 'INPUTXML_B31_SCHEMA_INVALID',
  );
  Object.entries(value).forEach(([key, entry]) => requireText(entry, `${field}.${key}`));
}

function requireUnique(rows, key, field) {
  const ids = new Set();
  rows.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(
      `${field}[${index}] must be a record.`, 'INPUTXML_B31_SCHEMA_INVALID',
    );
    const id = row[key];
    requireText(id, `${field}[${index}].${key}`);
    if (ids.has(id)) fail(`${field} duplicates ${id}.`, 'INPUTXML_B31_DUPLICATE');
    ids.add(id);
  });
}

function requireExactKeys(value, keys, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, 'INPUTXML_B31_SCHEMA_INVALID');
  keys.forEach((key) => {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, 'INPUTXML_B31_SCHEMA_INVALID');
  });
  Object.keys(value).forEach((key) => {
    if (!keys.includes(key)) fail(`${field} contains unexpected ${key}.`, 'INPUTXML_B31_SCHEMA_INVALID');
  });
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, 'INPUTXML_B31_SCHEMA_INVALID');
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_B31_SCHEMA_INVALID',
  );
}

export { InputXmlLinearB31EvaluationError };
