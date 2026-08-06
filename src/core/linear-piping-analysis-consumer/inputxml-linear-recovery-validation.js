import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlRecoveryFailure as fail } from './inputxml-linear-recovery-error.js';

const PROHIBITED_KEYS = new Set([
  'factorizationHandle', 'factorizationCache', 'genericRuntime',
  'solvePreparation', 'preflight', 'solverProfile', 'frameProfile',
  'K', 'sparseK', 'triplets', 'matrix', 'localStiffness',
  'globalStiffness', 'sparseFactor', 'scaleFactors', 'factors',
]);

export function requireRecoveredCaseShape(value, expectedKeys) {
  requireExactKeys(value, expectedKeys, 'recoveredCase');
  for (const key of ['recoveredCaseId', 'analysisProfileId', 'status']) {
    requireString(value[key], `recoveredCase.${key}`);
  }
  for (const key of [
    'sourceIdentity', 'stiffnessIdentity', 'runtimeIdentity',
    'caseIdentity', 'executionIdentity', 'recoveryIdentity', 'diagnostics',
  ]) requireRecord(value[key], `recoveredCase.${key}`);
  for (const key of [
    'displacements', 'reactions', 'elementResults', 'sourceStations',
    'unrepresentedSources', 'pressureCustody', 'limitations',
  ]) requireArray(value[key], `recoveredCase.${key}`);

  requireIdentityFields(value);
  requireDofEntries(value.displacements, 'displacements');
  requireDofEntries(value.reactions, 'reactions');
  requireUnique(value.elementResults, 'elementId', 'elementResults');
  requireUnique(value.sourceStations, 'stationId', 'sourceStations');
  requireUnique(value.unrepresentedSources, 'ledgerId', 'unrepresentedSources');
  requireUnique(value.pressureCustody, 'primitiveId', 'pressureCustody');
  requirePortableTree(value);
}

function requireIdentityFields(value) {
  requireStrings(value.sourceIdentity, [
    'sourceBundleSemanticHash', 'sourceBundleEvidenceHash',
    'modelHealthSemanticHash', 'modelHealthEvidenceHash',
    'topologySemanticHash', 'topologyEvidenceHash',
    'unitNormalizationSemanticHash', 'unitNormalizationEvidenceHash',
    'structuralPreparationSemanticHash', 'structuralPreparationEvidenceHash',
    'solvePreparationSemanticHash', 'solvePreparationEvidenceHash',
    'loadCaseProfileSemanticHash',
  ], 'sourceIdentity');
  requireStrings(value.stiffnessIdentity, [
    'mechanicalModelSemanticHash', 'stiffnessStateHash', 'stiffnessAssessmentHash',
    'preflightSemanticHash', 'preflightEvidenceHash',
    'genericPreflightSemanticHash', 'genericPreflightEvidenceHash',
    'frameElementProfileSemanticHash', 'solverProfileSemanticHash',
    'stiffnessRuntimeHash', 'partitionHash', 'elementLedgerHash',
  ], 'stiffnessIdentity');
  requireStrings(value.runtimeIdentity, [
    'runtimeId', 'runtimeHash', 'authorizationMode', 'authorizedCaseSetHash',
  ], 'runtimeIdentity');
  requireStrings(value.caseIdentity, [
    'caseId', 'caseRole', 'physicalLoadCaseHash',
    'physicalLoadCaseSemanticHash', 'physicalLoadCaseEvidenceHash',
    'primitiveLedgerHash',
  ], 'caseIdentity');
  requireArray(value.caseIdentity.sourceSetIds, 'caseIdentity.sourceSetIds');
  requireArray(value.caseIdentity.sourceFeatureIds, 'caseIdentity.sourceFeatureIds');
  requireStrings(value.executionIdentity, [
    'caseExecutionId', 'caseExecutionSemanticHash', 'caseExecutionEvidenceHash',
    'solverExecutionHash', 'solverExecutionSemanticHash', 'solverExecutionEvidenceHash',
  ], 'executionIdentity');
  requireStrings(value.recoveryIdentity, [
    'recoveryProfileSemanticHash', 'mappingPolicyId', 'mappingPolicySemanticHash',
    'genericRecoverySemanticHash', 'genericRecoveryEvidenceHash',
  ], 'recoveryIdentity');
}

function requireStrings(record, keys, field) {
  keys.forEach((key) => requireString(record[key], `${field}.${key}`));
}

function requireDofEntries(rows, field) {
  const ids = new Set();
  rows.forEach((row, index) => {
    requireRecord(row, `${field}[${index}]`);
    requireString(row.nodeId, `${field}[${index}].nodeId`);
    requireString(row.dof, `${field}[${index}].dof`);
    requireFinite(row.value, `${field}[${index}].value`);
    const id = `${row.nodeId}:${row.dof}`;
    if (ids.has(id)) fail(`${field} contains duplicate ${id}.`, 'INPUTXML_RECOVERY_DUPLICATE');
    ids.add(id);
  });
}

function requireUnique(rows, key, field) {
  const ids = new Set();
  rows.forEach((row, index) => {
    requireRecord(row, `${field}[${index}]`);
    requireString(row[key], `${field}[${index}].${key}`);
    if (ids.has(row[key])) fail(`${field} contains duplicate ${row[key]}.`, 'INPUTXML_RECOVERY_DUPLICATE');
    ids.add(row[key]);
  });
}

function requirePortableTree(value) {
  walkPortableTree(value, 'recoveredCase');
}

function walkPortableTree(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return requireFinite(value, path);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkPortableTree(entry, `${path}[${index}]`));
    return;
  }
  if (!isPlainRecord(value)) fail(
    `${path} contains non-serializable runtime state.`,
    'INPUTXML_RECOVERY_RUNTIME_STATE_PROHIBITED',
  );
  Object.entries(value).forEach(([key, entry]) => {
    if (PROHIBITED_KEYS.has(key)) fail(
      `${path}.${key} is prohibited runtime or matrix state.`,
      'INPUTXML_RECOVERY_RUNTIME_STATE_PROHIBITED',
    );
    walkPortableTree(entry, `${path}.${key}`);
  });
}

function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  expected.forEach((key) => {
    if (!Object.hasOwn(value, key)) fail(
      `${field} is missing ${key}.`, 'INPUTXML_RECOVERY_SCHEMA_INVALID',
    );
  });
  Object.keys(value).forEach((key) => {
    if (!expected.includes(key)) fail(
      `${field} contains unexpected ${key}.`, 'INPUTXML_RECOVERY_SCHEMA_INVALID',
    );
  });
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(
    `${field} must be a record.`, 'INPUTXML_RECOVERY_SCHEMA_INVALID',
  );
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(
    `${field} must be an array.`, 'INPUTXML_RECOVERY_SCHEMA_INVALID',
  );
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_RECOVERY_SCHEMA_INVALID',
  );
  return value;
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(
    `${field} must be finite.`, 'INPUTXML_RECOVERY_NONFINITE',
  );
  return Object.is(value, -0) ? 0 : value;
}
