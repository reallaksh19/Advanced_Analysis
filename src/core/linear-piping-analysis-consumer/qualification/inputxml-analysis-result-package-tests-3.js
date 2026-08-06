import assert from 'node:assert/strict';
import {
  exportInputXmlLinearAnalysisResultEvidenceCsv,
  exportInputXmlLinearAnalysisResultPackageJson,
  packageInputXmlLinearAnalysisResults,
  requireInputXmlLinearAnalysisResultPackage,
} from '../index.js';
import { executions, packageResult, recovered, request, runtime } from './inputxml-analysis-result-package-fixture.js';

const test = (id, name, body) => { body(); console.log(`${id} PASS ${name}`); };
const clone = (value) => structuredClone(value);
const prohibitedKeys = new Set(['factorizationHandle', 'factorizationCache', 'genericRuntime',
  'runtime', 'K', 'sparseK', 'triplets', 'matrix', 'localStiffness', 'globalStiffness',
  'sparseFactor', 'factorizationObject']);
function prohibited(value) {
  const found = [];
  const walk = (entry, path) => {
    if (Array.isArray(entry)) entry.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (entry && typeof entry === 'object') for (const [key, item] of Object.entries(entry)) {
      if (prohibitedKeys.has(key) && item !== null && typeof item !== 'string') found.push(`${path}.${key}`);
      walk(item, `${path}.${key}`);
    }
  };
  walk(value, 'package');
  return found;
}

test('MH-PR10-09', 'stale recovery-to-execution ancestry fails closed', () => {
  const stale = clone(recovered[0]);
  stale.executionIdentity.caseExecutionSemanticHash = executions[1].semanticHash;
  assert.throws(() => packageInputXmlLinearAnalysisResults(request({
    recoveredResults: [stale, ...recovered.slice(1)],
  })));
});

test('MH-PR10-10', 'JSON round-trips without runtime or matrix state', () => {
  assert.deepEqual(prohibited(packageResult), []);
  const parsed = JSON.parse(exportInputXmlLinearAnalysisResultPackageJson(packageResult));
  assert.equal(requireInputXmlLinearAnalysisResultPackage(parsed).semanticHash,
    packageResult.semanticHash);
});

test('MH-PR10-11', 'CSV evidence manifest is deterministic and source-traceable', () => {
  const csv = exportInputXmlLinearAnalysisResultEvidenceCsv(packageResult);
  assert.ok(csv.includes('analysis_result_package,IXRP-MHPR10'));
  assert.ok(csv.includes(packageResult.sourceIdentity.sourceBundleSemanticHash));
  assert.equal(csv, exportInputXmlLinearAnalysisResultEvidenceCsv(packageResult));
});

test('MH-PR10-12', 'runtime injection and manifest tamper are rejected', () => {
  assert.throws(() => packageInputXmlLinearAnalysisResults({ ...request({}), runtime }),
    (error) => error.code === 'INPUTXML_RESULT_PACKAGE_REQUEST_INVALID');
  const tampered = clone(packageResult);
  tampered.evidenceManifest.codeEvaluation.semanticHash = 'stale';
  assert.throws(() => requireInputXmlLinearAnalysisResultPackage(tampered));
});
