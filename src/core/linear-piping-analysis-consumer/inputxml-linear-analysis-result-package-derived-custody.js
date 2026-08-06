import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  buildInputXmlAnalysisResultEvidenceManifest,
  inputXmlAnalysisResultPackageLimitations,
  inputXmlAnalysisResultPackageStatus,
  inputXmlAnalysisResultPackageSummary,
} from './inputxml-linear-analysis-result-package-custody.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';

export function requireComputedPackageCustody(value) {
  const limitations = inputXmlAnalysisResultPackageLimitations(value);
  const status = inputXmlAnalysisResultPackageStatus(value);
  const summary = inputXmlAnalysisResultPackageSummary(value, limitations, status);
  const manifest = buildInputXmlAnalysisResultEvidenceManifest(value);
  if (semanticHash(value.limitations) !== semanticHash(limitations)
    || value.status !== status
    || semanticHash(value.summary) !== semanticHash(summary)
    || semanticHash(value.evidenceManifest) !== semanticHash(manifest)) fail(
    'InputXML result package derived custody is inconsistent.',
    'INPUTXML_RESULT_PACKAGE_CUSTODY_MISMATCH',
  );
}

export function requireExactCoverage(expectedValues, actualValues, field) {
  const expected = [...new Set(expectedValues)].sort(compareAscii);
  const actual = [...new Set(actualValues)].sort(compareAscii);
  if (expected.length !== expectedValues.length || actual.length !== actualValues.length
    || expected.length !== actual.length
    || expected.some((entry, index) => entry !== actual[index])) fail(
    `InputXML result package ${field} coverage is incomplete or duplicated.`,
    'INPUTXML_RESULT_PACKAGE_COVERAGE_INVALID',
  );
}

export function failDuplicate(field) {
  fail(`InputXML result package duplicates ${field}.`, 'INPUTXML_RESULT_PACKAGE_DUPLICATE');
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
