import assert from 'node:assert/strict';
import { packageInputXmlLinearAnalysisResults, requireInputXmlLinearAnalysisResultPackage } from '../index.js';
import { executions, packageResult, recovered, request } from './inputxml-analysis-result-package-fixture.js';

const test = (id, name, body) => { body(); console.log(`${id} PASS ${name}`); };
const clone = (value) => structuredClone(value);

test('MH-PR10-05', 'limitations and conditional status are computed from nested custody', () => {
  assert.equal(packageResult.status, 'CONDITIONAL');
  assert.ok(packageResult.limitations.length > 0);
  assert.equal(packageResult.summary.limitationCount, packageResult.limitations.length);
  assert.equal(packageResult.summary.runtimeStateRetained, false);
});

test('MH-PR10-06', 'input ordering does not change package identity', () => {
  const replay = packageInputXmlLinearAnalysisResults(request({
    physicalExecutions: [...executions].reverse(),
    recoveredResults: [...recovered].reverse(),
    derivedCases: [...packageResult.derivedCases].reverse(),
  }));
  assert.equal(replay.semanticHash, packageResult.semanticHash);
  assert.equal(replay.evidenceHash, packageResult.evidenceHash);
});

test('MH-PR10-07', 'nested tamper is rejected before package acceptance', () => {
  const tampered = clone(packageResult);
  tampered.recoveredResults[0].displacements[0].value += 1;
  assert.throws(() => requireInputXmlLinearAnalysisResultPackage(tampered));
});

test('MH-PR10-08', 'missing and duplicate physical-case coverage fail closed', () => {
  assert.throws(() => packageInputXmlLinearAnalysisResults(request({
    physicalExecutions: executions.slice(1),
  })), (error) => error.code === 'INPUTXML_RESULT_PACKAGE_COVERAGE_INVALID');
  assert.throws(() => packageInputXmlLinearAnalysisResults(request({
    recoveredResults: [...recovered, recovered[0]],
  })), (error) => ['INPUTXML_RESULT_PACKAGE_DUPLICATE',
    'INPUTXML_RESULT_PACKAGE_ORDER_INVALID'].includes(error.code));
});
