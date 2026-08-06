import {
  DISPLACEMENT_STRESS_RANGE,
  EXPANSION_RANGE_ENVELOPE,
  OCCASIONAL,
  SUSTAINED,
} from '../linear-fea-b31-code-engine/index.js';
import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlB31Failure as fail } from './inputxml-linear-b31-error.js';

export const INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA =
  'fea-inputxml-linear-b31-evaluation-request/v1';

export const INPUTXML_LINEAR_B31_CHECK_KEYS = Object.freeze([
  'checkId', 'category', 'derivedCaseId', 'sourceStationId',
  'sourceElementId', 'sourceRecoveredCaseId', 'componentId',
  'stressFactorSet', 'sustainedSectionResolution', 'coldTemperature',
  'sustainedCheckId', 'occasionalCategoryId', 'approximationApproval',
]);

export const INPUTXML_LINEAR_B31_REQUEST_KEYS = Object.freeze([
  'schema', 'evaluationId', 'solvePreparation', 'preflight',
  'derivedCases', 'codeProfile', 'editionDataset', 'checks',
]);

export const INPUTXML_LINEAR_B31_RANGE_CATEGORIES = Object.freeze([
  DISPLACEMENT_STRESS_RANGE, EXPANSION_RANGE_ENVELOPE,
]);

const IMPLEMENTED_CATEGORIES = new Set([
  SUSTAINED, OCCASIONAL, ...INPUTXML_LINEAR_B31_RANGE_CATEGORIES,
]);
const RANGE_CATEGORIES = new Set(INPUTXML_LINEAR_B31_RANGE_CATEGORIES);
const APPROVAL_KEYS = Object.freeze(['source', 'revision', 'approver', 'reason']);

export function requireInputXmlB31Request(request) {
  requireExactKeys(request, INPUTXML_LINEAR_B31_REQUEST_KEYS, 'request');
  if (request.schema !== INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA) fail(
    'InputXML B31 evaluation request schema is invalid.',
    'INPUTXML_B31_REQUEST_INVALID',
  );
  requireText(request.evaluationId, 'request.evaluationId');
  requireArray(request.derivedCases, 'request.derivedCases');
  requireArray(request.checks, 'request.checks');
  if (request.derivedCases.length === 0) fail(
    'InputXML B31 evaluation requires derived cases.',
    'INPUTXML_B31_DERIVED_CASES_EMPTY',
  );
  if (request.checks.length === 0) fail(
    'InputXML B31 evaluation requires at least one check.',
    'INPUTXML_B31_CHECKS_EMPTY',
  );
  return request;
}

export function requireInputXmlB31Check(value, index) {
  const field = `request.checks[${index}]`;
  requireExactKeys(value, INPUTXML_LINEAR_B31_CHECK_KEYS, field);
  for (const key of [
    'checkId', 'category', 'derivedCaseId', 'sourceStationId',
    'sourceElementId', 'sourceRecoveredCaseId', 'componentId',
  ]) requireText(value[key], `${field}.${key}`);
  if (value.sustainedSectionResolution !== null
    && !isPlainRecord(value.sustainedSectionResolution)) fail(
    `${field}.sustainedSectionResolution must be a sealed record or null.`,
    'INPUTXML_B31_REQUEST_INVALID',
  );
  if (value.coldTemperature !== null) requireDeclared(
    value.coldTemperature, `${field}.coldTemperature`,
  );
  if (value.sustainedCheckId !== null) requireText(
    value.sustainedCheckId, `${field}.sustainedCheckId`,
  );
  if (value.occasionalCategoryId !== null) requireText(
    value.occasionalCategoryId, `${field}.occasionalCategoryId`,
  );
  if (value.approximationApproval !== null
    && !isPlainRecord(value.approximationApproval)) fail(
    `${field}.approximationApproval must be a record or null.`,
    'INPUTXML_B31_REQUEST_INVALID',
  );
  return value;
}

export function requireInputXmlB31CategoryAlgebra(category, derived) {
  if (!IMPLEMENTED_CATEGORIES.has(category)) fail(
    `InputXML B31 category ${category} is unsupported.`,
    'INPUTXML_B31_CATEGORY_UNSUPPORTED',
  );
  if (derived.algebra.kind === 'ENVELOPE') fail(
    `Derived case ${derived.derivedCaseId} is a reporting envelope, not one equilibrium action.`,
    'INPUTXML_B31_ENVELOPE_NOT_EQUILIBRIUM',
  );
  const expected = RANGE_CATEGORIES.has(category) ? 'RANGE' : 'LINEAR';
  if (derived.algebra.kind !== expected) fail(
    `${category} requires ${expected} derived-case algebra.`,
    'INPUTXML_B31_CATEGORY_ALGEBRA_MISMATCH',
  );
}

export function inputXmlB31ApproximationLimitations(derived, station) {
  return uniqueAscii([
    ...derived.limitations,
    ...station.limitationCodes,
  ].filter((code) => /APPROX|SUBSTITUTION|NOT_REPRESENTED/u.test(code)));
}

export function requireInputXmlB31ApproximationApproval(value, codes, checkId) {
  if (codes.length === 0) {
    if (value !== null) fail(
      `${checkId} supplies approximation approval without an approximation.`,
      'INPUTXML_B31_APPROVAL_NOT_APPLICABLE',
    );
    return null;
  }
  if (value === null) fail(
    `${checkId} cites approximate InputXML mechanics without explicit approval.`,
    'INPUTXML_B31_APPROXIMATION_APPROVAL_REQUIRED',
    { limitationCodes: codes },
  );
  requireExactKeys(value, APPROVAL_KEYS, `${checkId}.approximationApproval`);
  APPROVAL_KEYS.forEach((key) => requireText(
    value[key], `${checkId}.approximationApproval.${key}`,
  ));
  return value;
}

export function isInputXmlB31RangeCategory(category) {
  return RANGE_CATEGORIES.has(category);
}

export function requireInputXmlB31Text(value, field) {
  return requireText(value, field);
}

export function uniqueAscii(values) {
  return [...new Set(values.map(String))].sort(compareAscii);
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireDeclared(value, field) {
  requireExactKeys(value, ['value', 'source'], field);
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) fail(
    `${field}.value must be finite.`, 'INPUTXML_B31_NONFINITE',
  );
  requireText(value.source, `${field}.source`);
}

function requireExactKeys(value, keys, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, 'INPUTXML_B31_REQUEST_INVALID');
  keys.forEach((key) => {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, 'INPUTXML_B31_REQUEST_INVALID');
  });
  Object.keys(value).forEach((key) => {
    if (!keys.includes(key)) fail(`${field} contains unexpected ${key}.`, 'INPUTXML_B31_REQUEST_INVALID');
  });
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, 'INPUTXML_B31_REQUEST_INVALID');
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_B31_REQUEST_INVALID',
  );
  return value;
}
