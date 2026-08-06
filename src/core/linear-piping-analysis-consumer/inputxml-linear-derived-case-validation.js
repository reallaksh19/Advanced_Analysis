import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';
import { requirePortableDerivedTree } from './inputxml-linear-derived-portability.js';
import { requireDerivedResults } from './inputxml-linear-derived-result-validation.js';

const ALGEBRA_KINDS = new Set(['LINEAR', 'RANGE', 'ENVELOPE']);

export function requireDerivedCaseShape(value, expectedKeys) {
  requireExactKeys(value, expectedKeys, 'derivedCase');
  for (const key of [
    'derivedCaseId', 'name', 'purpose', 'analysisProfileId', 'status',
  ]) requireString(value[key], `derivedCase.${key}`);
  requireRecord(value.algebra, 'derivedCase.algebra');
  requireRecord(value.compatibilityIdentity, 'derivedCase.compatibilityIdentity');
  requireArray(value.sourceCases, 'derivedCase.sourceCases');
  requireArray(value.pressureCustody, 'derivedCase.pressureCustody');
  requireArray(value.limitations, 'derivedCase.limitations');
  requireRecord(value.diagnostics, 'derivedCase.diagnostics');
  requireCompatibilityIdentity(value.compatibilityIdentity);
  requireSourceCases(value.sourceCases);
  requireAlgebra(value.algebra, new Set(value.sourceCases.map((row) => row.recoveredCaseId)));
  requireDerivedResults(value);
  requirePressureCustody(value.pressureCustody);
  requirePortableDerivedTree(value);
}

function requireCompatibilityIdentity(value) {
  for (const key of [
    'sourceBundleSemanticHash', 'structuralPreparationSemanticHash',
    'solvePreparationSemanticHash', 'mechanicalModelSemanticHash',
    'stiffnessStateHash', 'preflightSemanticHash', 'stiffnessRuntimeHash',
    'runtimeId', 'runtimeHash', 'authorizedCaseSetHash',
    'recoveryProfileSemanticHash', 'mappingPolicySemanticHash',
  ]) requireString(value[key], `compatibilityIdentity.${key}`);
}

function requireSourceCases(rows) {
  if (rows.length === 0) fail(
    'Derived case requires at least one recovered source case.',
    'INPUTXML_DERIVED_SOURCE_CASES_INVALID',
  );
  requireUnique(rows, 'recoveredCaseId', 'sourceCases');
  rows.forEach((row, index) => {
    requireRecord(row, `sourceCases[${index}]`);
    for (const key of [
      'recoveredCaseId', 'recoveredCaseSemanticHash', 'recoveredCaseEvidenceHash',
      'caseId', 'caseRole', 'physicalLoadCaseHash',
      'physicalLoadCaseSemanticHash', 'physicalLoadCaseEvidenceHash',
      'caseExecutionId', 'caseExecutionSemanticHash', 'caseExecutionEvidenceHash',
      'stiffnessRuntimeHash',
    ]) requireString(row[key], `sourceCases[${index}].${key}`);
  });
}

function requireAlgebra(algebra, sourceIds) {
  requireString(algebra.kind, 'algebra.kind');
  if (!ALGEBRA_KINDS.has(algebra.kind)) fail(
    `Derived-case algebra ${algebra.kind} is unsupported.`,
    'INPUTXML_DERIVED_ALGEBRA_INVALID',
  );
  if (algebra.kind === 'ENVELOPE') {
    requireArray(algebra.candidates, 'algebra.candidates');
    if (algebra.candidates.length < 2) fail(
      'Envelope algebra requires at least two candidates.',
      'INPUTXML_DERIVED_ALGEBRA_INVALID',
    );
    requireUnique(algebra.candidates, 'candidateId', 'algebra.candidates');
    algebra.candidates.forEach((candidate, index) => {
      requireRecord(candidate, `algebra.candidates[${index}]`);
      requireString(candidate.candidateId, `algebra.candidates[${index}].candidateId`);
      requireTerms(candidate.terms, sourceIds, `algebra.candidates[${index}].terms`);
    });
    return;
  }
  requireTerms(algebra.terms, sourceIds, 'algebra.terms');
  if (algebra.kind === 'RANGE' && (algebra.terms.length !== 2
    || !algebra.terms.some((row) => row.factor > 0)
    || !algebra.terms.some((row) => row.factor < 0))) fail(
    'Range algebra requires exactly one positive and one negative source term.',
    'INPUTXML_DERIVED_RANGE_INVALID',
  );
}

function requireTerms(terms, sourceIds, field) {
  requireArray(terms, field);
  if (terms.length === 0) fail(
    `${field} requires at least one term.`, 'INPUTXML_DERIVED_ALGEBRA_INVALID',
  );
  requireUnique(terms, 'recoveredCaseId', field);
  terms.forEach((term, index) => {
    requireRecord(term, `${field}[${index}]`);
    requireString(term.recoveredCaseId, `${field}[${index}].recoveredCaseId`);
    requireFinite(term.factor, `${field}[${index}].factor`);
    if (term.factor === 0) fail(
      `${field}[${index}].factor must be non-zero.`,
      'INPUTXML_DERIVED_FACTOR_INVALID',
    );
    if (!sourceIds.has(term.recoveredCaseId)) fail(
      `${field}[${index}] references an unavailable recovered case.`,
      'INPUTXML_DERIVED_SOURCE_CASE_MISSING',
    );
  });
}

function requirePressureCustody(rows) {
  requireUnique(rows, 'custodyId', 'pressureCustody');
  rows.forEach((row, index) => {
    requireRecord(row, `pressureCustody[${index}]`);
    for (const key of [
      'custodyId', 'recoveredCaseId', 'recoveredCaseEvidenceHash',
      'primitiveId', 'primitiveSemanticHash', 'structuralEffect',
      'futureUse', 'combinationDisposition',
    ]) requireString(row[key], `pressureCustody[${index}].${key}`);
    requireFinite(row.factor, `pressureCustody[${index}].factor`);
    if (row.structuralEffect !== 'NONE') fail(
      'Pressure custody cannot authorize structural effects.',
      'INPUTXML_DERIVED_PRESSURE_LEAKAGE',
    );
  });
}

function requireUnique(rows, key, field) {
  const ids = new Set();
  rows.forEach((row, index) => {
    requireRecord(row, `${field}[${index}]`);
    requireString(row[key], `${field}[${index}].${key}`);
    if (ids.has(row[key])) fail(
      `${field} contains duplicate ${row[key]}.`, 'INPUTXML_DERIVED_DUPLICATE',
    );
    ids.add(row[key]);
  });
}

function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  expected.forEach((key) => {
    if (!Object.hasOwn(value, key)) fail(
      `${field} is missing ${key}.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
    );
  });
  Object.keys(value).forEach((key) => {
    if (!expected.includes(key)) fail(
      `${field} contains unexpected ${key}.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
    );
  });
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(
    `${field} must be a record.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(
    `${field} must be an array.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(
    `${field} must be finite.`, 'INPUTXML_DERIVED_NONFINITE',
  );
}
