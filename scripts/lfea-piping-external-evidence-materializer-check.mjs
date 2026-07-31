#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  materializeExternalQualificationEvidence,
  parseExternalMaterializationInvocation,
} from './lfea-piping-external-evidence-materializer.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECORD_KEYS = Object.freeze([
  'applicationResult', 'presentation', 'realModelReconciliation',
  'commercialCorroboration', 'performanceEvidence', 'rollbackEvidence',
  'reviewDisposition',
]);
const OUTPUT_PATHS = Object.freeze({
  realModelReconciliation: 'external/real-model-reconciliation.json',
  commercialCorroboration: 'external/commercial-corroboration.json',
  performanceEvidence: 'external/performance-evidence.json',
  rollbackEvidence: 'external/rollback-evidence.json',
  reviewDisposition: 'external/signed-disposition.json',
});

const parsed = parseExternalMaterializationInvocation([
  `--exact-head=${HEAD}`,
  '--input-root=/tmp/input',
  '--request=request/materialize.json',
  '--output=/tmp/output',
]);
assert.equal(parsed.expectedHead, HEAD);
assert.equal(parsed.requestPath, 'request/materialize.json');
assert.throws(
  () => parseExternalMaterializationInvocation(['--output=/tmp/output']),
  hasCode('LFEA_EXTERNAL_MATERIALIZATION_OPTIONS_MISSING'),
);
assert.throws(
  () => parseExternalMaterializationInvocation([
    '--exact-head=bad', '--input-root=/tmp/input',
    '--request=request/materialize.json', '--output=/tmp/output',
  ]),
  hasCode('LFEA_EXTERNAL_MATERIALIZATION_HEAD_INVALID'),
);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6h-'));
try {
  const first = fixture(path.join(temp, 'first'));
  const outputOne = path.join(temp, 'output-one');
  const resultOne = materialize(first, outputOne);
  assert.equal(resultOne.status, 'ELIGIBLE_FOR_PHASE6G_ASSEMBLY');
  assert.equal(resultOne.exactHead, HEAD);
  assert.equal(resultOne.evidenceRecordCount, 5);
  assert.equal(fs.existsSync(path.join(outputOne, 'external/external-qualification-package.json')), true);
  assert.equal(fs.existsSync(path.join(outputOne, 'external/materialization-summary.json')), true);
  for (const outputPath of Object.values(OUTPUT_PATHS)) {
    assert.equal(fs.existsSync(path.join(outputOne, outputPath)), true);
  }
  assert.deepEqual(
    readJson(path.join(outputOne, OUTPUT_PATHS.commercialCorroboration)),
    first.records.commercialCorroboration,
  );
  const packageRecord = readJson(
    path.join(outputOne, 'external/external-qualification-package.json'),
  );
  assert.equal(packageRecord.exactHead, HEAD);
  assert.equal(packageRecord.status, 'ELIGIBLE_FOR_RELEASE_REVIEW');
  assert.equal(
    packageRecord.artifactReferences.signedDisposition.path,
    'external/signed-disposition.json',
  );

  const second = fixture(path.join(temp, 'second'));
  const outputTwo = path.join(temp, 'output-two');
  materialize(second, outputTwo);
  assert.equal(
    text(outputOne, 'external/external-qualification-package.json'),
    text(outputTwo, 'external/external-qualification-package.json'),
  );
  assert.equal(
    text(outputOne, 'external/materialization-summary.json'),
    text(outputTwo, 'external/materialization-summary.json'),
  );

  const headMismatch = fixture(path.join(temp, 'head-mismatch'));
  headMismatch.request.exactHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  writeJson(headMismatch.requestFile, headMismatch.request);
  rejected(
    headMismatch,
    path.join(temp, 'head-mismatch-output'),
    'LFEA_EXTERNAL_MATERIALIZATION_REQUEST_HEAD_MISMATCH',
  );

  const duplicate = fixture(path.join(temp, 'duplicate'));
  duplicate.request.records.presentation = duplicate.request.records.applicationResult;
  writeJson(duplicate.requestFile, duplicate.request);
  rejected(
    duplicate,
    path.join(temp, 'duplicate-output'),
    'LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_DUPLICATE',
  );

  const traversal = fixture(path.join(temp, 'traversal'));
  traversal.request.records.rollbackEvidence = '../escape.json';
  writeJson(traversal.requestFile, traversal.request);
  rejected(
    traversal,
    path.join(temp, 'traversal-output'),
    'LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_INVALID',
  );

  const existing = fixture(path.join(temp, 'existing'));
  const existingOutput = path.join(temp, 'existing-output');
  fs.mkdirSync(existingOutput);
  assert.throws(
    () => materialize(existing, existingOutput),
    hasCode('LFEA_EXTERNAL_MATERIALIZATION_OUTPUT_EXISTS'),
  );

  const compilerFailure = fixture(path.join(temp, 'compiler-failure'));
  const compilerOutput = path.join(temp, 'compiler-output');
  assert.throws(
    () => materialize(compilerFailure, compilerOutput, {
      packageCompiler: () => throwError('SYNTHETIC_COMPILER_REJECTION'),
    }),
    hasCode('SYNTHETIC_COMPILER_REJECTION'),
  );
  assert.equal(fs.existsSync(compilerOutput), false);

  const intakeFailure = fixture(path.join(temp, 'intake-failure'));
  const intakeOutput = path.join(temp, 'intake-output');
  assert.throws(
    () => materialize(intakeFailure, intakeOutput, {
      intakeValidator: () => throwError('SYNTHETIC_INTAKE_REJECTION'),
    }),
    hasCode('SYNTHETIC_INTAKE_REJECTION'),
  );
  assert.equal(fs.existsSync(intakeOutput), false);
  assert.equal(
    fs.readdirSync(temp).some((name) => name.startsWith('intake-output.staging-')),
    false,
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  check: 'lfea-piping-external-evidence-materializer',
  status: 'PASS',
  exactHead: HEAD,
  engineeringCommandsExecuted: false,
}));

function materialize(input, outputRoot, overrides = {}) {
  return materializeExternalQualificationEvidence({
    repositoryRoot: input.repositoryRoot,
    inputRoot: input.inputRoot,
    requestPath: 'request/materialize.json',
    outputRoot,
    expectedHead: HEAD,
    packageCompiler: overrides.packageCompiler ?? ((request) => compileSynthetic(request)),
    packageValidator: (record) => Object.freeze(record),
    intakeValidator: overrides.intakeValidator ?? (({ root, ledger, releaseMode }) => {
      assert.equal(releaseMode, true);
      assert.equal(ledger.exactHead, HEAD);
      assert.equal(
        fs.existsSync(path.join(root, ledger.artifacts.externalQualificationPackage)),
        true,
      );
      return Object.freeze({
        status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
        releaseEligible: true,
        exactHead: HEAD,
        artifactCount: 5,
        packageSemanticHash: 'fnv1a64:8888888888888888',
        packageEvidenceHash: 'fnv1a64:9999999999999999',
      });
    }),
  });
}

function compileSynthetic(request) {
  assert.equal(request.schema, 'linear-piping-external-qualification-package-request/v1');
  assert.equal(request.exactHead, HEAD);
  assert.equal(request.artifactReferences.realModelReconciliation.contentHash,
    semanticHash(request.realModelReconciliation));
  assert.equal(request.artifactReferences.signedDisposition.path,
    'external/signed-disposition.json');
  return Object.freeze({
    schema: 'linear-piping-external-qualification-package/v1',
    packageId: request.packageId,
    exactHead: request.exactHead,
    applicationResultSemanticHash: request.applicationResult.semanticHash,
    applicationResultEvidenceHash: request.applicationResult.evidenceHash,
    presentationSemanticHash: request.presentation.semanticHash,
    presentationEvidenceHash: request.presentation.evidenceHash,
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    semanticHash: 'fnv1a64:8888888888888888',
    evidenceHash: 'fnv1a64:9999999999999999',
    artifactReferences: request.artifactReferences,
  });
}

function fixture(root) {
  const repositoryRoot = path.join(root, 'repository');
  const inputRoot = path.join(root, 'input');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(inputRoot, { recursive: true });
  const records = Object.fromEntries(RECORD_KEYS.map((key, index) => [key, {
    schema: `synthetic-${key}/v1`,
    recordId: `SOURCE-${index}`,
    exactHead: HEAD,
    semanticHash: `fnv1a64:${String(index + 1).repeat(16)}`,
    evidenceHash: `fnv1a64:${String(index + 2).repeat(16)}`,
  }]));
  const recordPaths = Object.fromEntries(RECORD_KEYS.map((key) => [
    key,
    `records/${key}.json`,
  ]));
  for (const key of RECORD_KEYS) writeJson(path.join(inputRoot, recordPaths[key]), records[key]);
  const request = {
    schema: 'lfea-piping-external-materialization-request/v1',
    packageId: 'PROJECT-QUALIFICATION-PACKAGE-001',
    exactHead: HEAD,
    records: recordPaths,
  };
  const requestFile = path.join(inputRoot, 'request/materialize.json');
  writeJson(requestFile, request);
  return { repositoryRoot, inputRoot, records, request, requestFile };
}

function rejected(input, output, code) {
  assert.throws(() => materialize(input, output), hasCode(code));
  assert.equal(fs.existsSync(output), false);
}
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function text(root, relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function hasCode(code) { return (error) => error?.code === code; }
function throwError(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
