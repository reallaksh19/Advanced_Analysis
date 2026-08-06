import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';

export function requirePackageBasicShape(value, keys) {
  requireExactKeys(value, keys, 'package');
  for (const key of ['packageId', 'analysisProfileId', 'status']) requireText(value[key], `package.${key}`);
  if (!['QUALIFIED', 'CONDITIONAL'].includes(value.status)) fail(
    'InputXML analysis-result package status is invalid.', 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID',
  );
  requireRecord(value.sourceIdentity, 'sourceIdentity');
  requireArray(value.physicalExecutions, 'physicalExecutions', true);
  requireArray(value.recoveredResults, 'recoveredResults', true);
  requireArray(value.derivedCases, 'derivedCases', true);
  requireArray(value.limitations, 'limitations', false);
  requireRecord(value.evidenceManifest, 'evidenceManifest');
  requireRecord(value.summary, 'summary');
  requireCanonical(value.physicalExecutions, 'caseId', 'physicalExecutions');
  requireCanonical(value.recoveredResults, 'recoveredCaseId', 'recoveredResults');
  requireCanonical(value.derivedCases, 'derivedCaseId', 'derivedCases');
  requireCanonicalText(value.limitations, 'limitations');
}

function requireExactKeys(value, keys, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID');
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(
    `${field} is missing ${key}.`, 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID',
  );
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(
    `${field} contains unexpected ${key}.`, 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID',
  );
}

function requireRecord(value, field) {
  if (!isPlainRecord(value) || Object.keys(value).length === 0) fail(
    `${field} must be a non-empty record.`, 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID',
  );
}

function requireArray(value, field, nonEmpty) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) fail(
    `${field} must be ${nonEmpty ? 'a non-empty' : 'an'} array.`, 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID',
  );
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_RESULT_PACKAGE_SCHEMA_INVALID',
  );
}

function requireCanonical(rows, key, field) {
  const ids = rows.map((row) => row[key]);
  if (ids.some((id) => typeof id !== 'string')
    || ids.some((id, index) => index > 0 && compareAscii(ids[index - 1], id) >= 0)) fail(
    `InputXML result package ${field} is not unique canonical order.`,
    'INPUTXML_RESULT_PACKAGE_ORDER_INVALID',
  );
}

function requireCanonicalText(values, field) {
  if (values.some((entry) => typeof entry !== 'string' || entry.length === 0)
    || values.some((entry, index) => index > 0 && compareAscii(values[index - 1], entry) >= 0)) fail(
    `InputXML result package ${field} is not unique canonical order.`,
    'INPUTXML_RESULT_PACKAGE_ORDER_INVALID',
  );
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
