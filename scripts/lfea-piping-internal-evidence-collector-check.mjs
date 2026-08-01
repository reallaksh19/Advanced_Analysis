#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildInternalEvidenceCommandPlan,
  collectInternalEvidence,
  parseCollectorInvocation,
} from './lfea-piping-internal-evidence-collector.mjs';
import {
  requireInternalExactHeadManifest,
  validateInternalReleaseEvidence,
} from './lfea-piping-internal-release-evidence-check.mjs';

const EXACT_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const COMMAND_IDS = Object.freeze([
  'EXACT_HEAD_BASELINE',
  'UPSTREAM_NUMERICAL_CHAIN',
  'T0_APPLICATION_SEQUENCING',
  'SOURCE_ORCHESTRATION',
  'INTERFACES',
  'INTERFACE_RECOVERY',
  'CODE_AND_ALLOWABLES',
  'PRESENTATION_EXPORT',
  'FULL_REPOSITORY_GATE',
  'CLEAN_TREE',
]);
const ARTIFACT_PATHS = Object.freeze({
  exactHeadManifest: 'internal/exact-head-manifest.json',
  upstreamGateLog: 'internal/upstream-gate.log',
  t0GateLog: 'internal/t0-gate.log',
  sourceOrchestrationEvidence: 'internal/source-orchestration.json',
  interfaceEvidence: 'internal/interface-evidence.json',
  interfaceRecoveryEvidence: 'internal/interface-recovery.json',
  codeAndAllowableEvidence: 'internal/code-and-allowable.json',
  presentationExportEvidence: 'internal/presentation-export.json',
});
const INTERNAL_GATES = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
]);
const FIXED_RUNTIME = Object.freeze({
  version: 'v22.18.0',
  platform: 'linux',
  arch: 'x64',
});

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

function ledger() {
  return JSON.parse(fs.readFileSync('release-evidence/lfea-piping-release-evidence.json', 'utf8'));
}

function emitSimulatedBaseline(entry) {
  if (entry.commandId !== 'EXACT_HEAD_BASELINE') return;
  const emitArgument = entry.args.find((argument) => argument.startsWith('--emit='));
  assert.ok(emitArgument, 'EXACT_HEAD_BASELINE requires --emit');
  const emitPath = emitArgument.slice('--emit='.length);
  fs.mkdirSync(path.dirname(emitPath), { recursive: true });
  fs.writeFileSync(emitPath, `${JSON.stringify({
    schema: 'lfea-piping-audit-baseline-runtime/v1',
    repository: 'reallaksh19/Advanced_Analysis',
    exactHeadCommit: EXACT_HEAD,
    checkout: { clean: true },
    evidenceStatus: 'EXACT_HEAD_BASELINE_CAPTURED',
  }, null, 2)}\n`, 'utf8');
}

function successfulRunner(calls = []) {
  return (entry) => {
    calls.push(entry.commandId);
    emitSimulatedBaseline(entry);
    return {
      exitCode: 0,
      stdout: `${entry.commandId} completed successfully\n`,
      stderr: '',
    };
  };
}

function collectorOptions(outputRoot, overrides = {}) {
  return {
    repositoryRoot: process.cwd(),
    outputRoot,
    expectedHead: EXACT_HEAD,
    runner: successfulRunner(),
    headResolver: () => EXACT_HEAD,
    now: () => '2026-07-31T13:10:00Z',
    runtime: FIXED_RUNTIME,
    ...overrides,
  };
}

function candidateLedger() {
  const value = ledger();
  value.exactHead = EXACT_HEAD;
  for (const [artifact, relativePath] of Object.entries(ARTIFACT_PATHS)) {
    value.artifacts[artifact] = relativePath;
  }
  for (const gate of INTERNAL_GATES) value.gates[gate] = 'VERIFIED';
  return value;
}

console.log('\n--- [SIMULATED][NO_ENGINEERING_COMMAND_EXECUTION] Phase 6F collector ---');

test('P6F-COLLECT-01', 'Command plan has exact governed coverage and ordering', () => {
  const plan = buildInternalEvidenceCommandPlan({ outputRoot: '/runtime/evidence' });
  assert.deepEqual(plan.map((entry) => entry.commandId), COMMAND_IDS);
  assert.equal(new Set(plan.map((entry) => entry.commandId)).size, 10);
  assert.equal(plan.find((entry) => entry.commandId === 'EXACT_HEAD_BASELINE').commandText,
    'node scripts/lfea-piping-a0-baseline-check.mjs --release --emit=$EVIDENCE_ROOT/internal/audit-baseline.runtime.json');
  assert.equal(plan.find((entry) => entry.commandId === 'FULL_REPOSITORY_GATE').commandText,
    'npm run gate');
});

test('P6F-COLLECT-02', 'Collector CLI requires output and exact head', () => {
  const parsed = parseCollectorInvocation([
    '--output=/runtime/evidence',
    `--exact-head=${EXACT_HEAD}`,
  ]);
  assert.equal(parsed.expectedHead, EXACT_HEAD);
  assert.equal(parsed.outputRoot, path.resolve('/runtime/evidence'));
  expectCode(
    () => parseCollectorInvocation([`--exact-head=${EXACT_HEAD}`]),
    'LFEA_INTERNAL_COLLECTION_OPTIONS_MISSING',
  );
});

test('P6F-COLLECT-03', 'Successful collection seals a Phase 6D-valid manifest', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-success-'));
  try {
    const calls = [];
    const result = collectInternalEvidence(collectorOptions(outputRoot, {
      runner: successfulRunner(calls),
    }));
    assert.equal(result.status, 'PASS');
    assert.equal(result.commandCount, 10);
    assert.equal(result.artifactCount, 7);
    assert.match(result.auditBaselineContentHash, /^fnv1a64:[0-9a-f]{16}$/u);
    assert.deepEqual(calls, COMMAND_IDS);
    const manifest = JSON.parse(fs.readFileSync(
      path.join(outputRoot, 'internal/exact-head-manifest.json'),
      'utf8',
    ));
    assert.equal(requireInternalExactHeadManifest(manifest).semanticHash, manifest.semanticHash);
    const intake = validateInternalReleaseEvidence({
      root: outputRoot,
      ledger: candidateLedger(),
      releaseMode: true,
    });
    assert.equal(intake.status, 'ELIGIBLE_FOR_RELEASE_REVIEW');
    assert.equal(intake.releaseEligible, true);
    assert.equal(intake.exactHead, EXACT_HEAD);
    const upstream = fs.readFileSync(
      path.join(outputRoot, 'internal/upstream-gate.log'),
      'utf8',
    );
    assert.match(upstream, /auditBaselineContentHash=fnv1a64:[0-9a-f]{16}/u);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-04', 'Collection refuses a checkout-head mismatch before commands run', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-head-'));
  const calls = [];
  try {
    expectCode(
      () => collectInternalEvidence(collectorOptions(outputRoot, {
        runner: successfulRunner(calls),
        headResolver: () => 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      })),
      'LFEA_INTERNAL_COLLECTION_CHECKOUT_HEAD_MISMATCH',
    );
    assert.deepEqual(calls, []);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-05', 'A failed command writes failure evidence and never seals a manifest', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-fail-'));
  try {
    expectCode(
      () => collectInternalEvidence(collectorOptions(outputRoot, {
        runner: (entry) => {
          emitSimulatedBaseline(entry);
          return {
            exitCode: entry.commandId === 'CODE_AND_ALLOWABLES' ? 7 : 0,
            stdout: `${entry.commandId} output\n`,
            stderr: entry.commandId === 'CODE_AND_ALLOWABLES' ? 'qualification failed\n' : '',
          };
        },
      })),
      'LFEA_INTERNAL_COLLECTION_COMMAND_FAILED',
    );
    const failurePath = path.join(outputRoot, 'internal/collection-failure.json');
    assert.equal(fs.existsSync(failurePath), true);
    const failure = JSON.parse(fs.readFileSync(failurePath, 'utf8'));
    assert.equal(failure.failedCommandId, 'CODE_AND_ALLOWABLES');
    assert.equal(fs.existsSync(path.join(outputRoot, ARTIFACT_PATHS.exactHeadManifest)), false);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-06', 'A zero exit without an emitted A0 baseline is rejected', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-baseline-'));
  try {
    expectCode(
      () => collectInternalEvidence(collectorOptions(outputRoot, {
        runner: (entry) => ({
          exitCode: 0,
          stdout: `${entry.commandId} completed successfully\n`,
          stderr: '',
        }),
      })),
      'LFEA_INTERNAL_COLLECTION_BASELINE_MISSING',
    );
    assert.equal(fs.existsSync(path.join(outputRoot, ARTIFACT_PATHS.exactHeadManifest)), false);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-07', 'Collector never deletes or overwrites a non-empty output directory', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-nondestructive-'));
  const sentinelPath = path.join(outputRoot, 'sentinel.txt');
  fs.writeFileSync(sentinelPath, 'retain me', 'utf8');
  try {
    expectCode(
      () => collectInternalEvidence(collectorOptions(outputRoot)),
      'LFEA_INTERNAL_COLLECTION_OUTPUT_NOT_EMPTY',
    );
    assert.equal(fs.readFileSync(sentinelPath, 'utf8'), 'retain me');
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-08', 'Evidence output is prohibited inside the repository', () => {
  expectCode(
    () => collectInternalEvidence(collectorOptions(
      path.join(process.cwd(), 'temporary-internal-evidence'),
    )),
    'LFEA_INTERNAL_COLLECTION_OUTPUT_INSIDE_REPOSITORY',
  );
});

test('P6F-COLLECT-09', 'Manifest identity is independent of runner-temporary output paths', () => {
  const leftRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-left-'));
  const rightRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-right-'));
  try {
    const left = collectInternalEvidence(collectorOptions(leftRoot));
    const right = collectInternalEvidence(collectorOptions(rightRoot));
    assert.equal(left.manifestSemanticHash, right.manifestSemanticHash);
    assert.equal(left.manifestEvidenceHash, right.manifestEvidenceHash);
  } finally {
    fs.rmSync(leftRoot, { recursive: true, force: true });
    fs.rmSync(rightRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-10', 'Collected phase evidence retains real command output and hashes', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6f-output-'));
  try {
    collectInternalEvidence(collectorOptions(outputRoot));
    const evidence = JSON.parse(fs.readFileSync(
      path.join(outputRoot, 'internal/interface-recovery.json'),
      'utf8',
    ));
    assert.equal(evidence.role, 'interfaceRecoveryEvidence');
    assert.equal(evidence.status, 'PASS');
    assert.equal(evidence.command.commandId, 'INTERFACE_RECOVERY');
    assert.match(evidence.command.stdout, /INTERFACE_RECOVERY completed successfully/u);
    assert.match(evidence.command.outputHash, /^fnv1a64:[0-9a-f]{16}$/u);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('P6F-COLLECT-11', 'Committed release template remains blocked and unpopulated', () => {
  const value = ledger();
  assert.equal(value.programDisposition, 'BLOCKED');
  assert.equal(value.exactHead, null);
  assert.equal(value.artifacts.exactHeadManifest, null);
  for (const gate of INTERNAL_GATES) assert.notEqual(value.gates[gate], 'VERIFIED');
});

console.log('[SIMULATED][NO_ENGINEERING_COMMAND_EXECUTION] Phase 6F collector checks PASS');
