#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateReleaseReadiness,
  loadReleaseEvidence,
  parseReleaseInvocation,
} from './lfea-piping-release-readiness-check.mjs';

const EXACT_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REQUIRED_GATES = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
  'G8_REAL_MODEL_RECONCILIATION',
  'G9_COMMERCIAL_CORROBORATION',
  'G10_RELEASE_ROLLBACK',
]);
const REQUIRED_ARTIFACTS = Object.freeze([
  'exactHeadManifest',
  'upstreamGateLog',
  't0GateLog',
  'sourceOrchestrationEvidence',
  'interfaceEvidence',
  'interfaceRecoveryEvidence',
  'codeAndAllowableEvidence',
  'presentationExportEvidence',
  'realModelReconciliation',
  'commercialCorroboration',
  'performanceEvidence',
  'rollbackEvidence',
  'signedDisposition',
  'externalQualificationPackage',
]);

function test(id, name, body) {
  const result = body();
  if (result?.then) {
    return result.then(() => console.log(`${id} PASS ${name}`));
  }
  console.log(`${id} PASS ${name}`);
  return result;
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

async function expectCodeAsync(body, code) {
  await assert.rejects(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

function policyEvidence() {
  return JSON.parse(fs.readFileSync('release-evidence/lfea-piping-release-evidence.json', 'utf8'));
}

function releaseEvidence(overrides = {}) {
  return {
    schema: 'lfea-piping-release-evidence/v1',
    program: 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN',
    programDisposition: 'QUALIFIED',
    exactHead: EXACT_HEAD,
    gates: Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, 'VERIFIED'])),
    artifacts: Object.fromEntries(
      REQUIRED_ARTIFACTS.map((artifact) => [artifact, `evidence/${artifact}.json`]),
    ),
    ...overrides,
  };
}

function eligibleIntake(kind, overrides = {}) {
  return {
    schema: `lfea-piping-${kind.toLowerCase()}-release-intake/v1`,
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    exactHead: EXACT_HEAD,
    releaseEligible: true,
    ...(kind === 'INTERNAL'
      ? { manifestSemanticHash: 'fnv1a64:1111111111111111' }
      : { packageSemanticHash: 'fnv1a64:2222222222222222' }),
    ...overrides,
  };
}

function releaseDependencies(overrides = {}) {
  let internalCalls = 0;
  let externalCalls = 0;
  let policyCalls = 0;
  const dependencies = {
    validators: {
      internal: () => {
        internalCalls += 1;
        return overrides.internal ?? eligibleIntake('INTERNAL');
      },
      external: () => {
        externalCalls += 1;
        return overrides.external ?? eligibleIntake('EXTERNAL');
      },
    },
    policyRunner: async () => {
      policyCalls += 1;
    },
    counts: () => ({ internalCalls, externalCalls, policyCalls }),
  };
  return dependencies;
}

console.log('\n--- [SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE] Phase 6E orchestration ---');

await test('P6E-ORCH-01', 'Blocked committed manifest follows policy checks only', async () => {
  const dependencies = releaseDependencies();
  const result = await evaluateReleaseReadiness({
    root: process.cwd(),
    evidence: policyEvidence(),
    releaseMode: false,
    expectedHead: null,
    validators: dependencies.validators,
    policyRunner: dependencies.policyRunner,
  });
  assert.equal(result.mode, 'POLICY');
  assert.equal(result.releaseEligible, false);
  assert.equal(result.qualificationHarness, 'SIMULATED_FIXTURES_ONLY');
  assert.deepEqual(dependencies.counts(), {
    internalCalls: 0,
    externalCalls: 0,
    policyCalls: 1,
  });
});

await test('P6E-ORCH-02', 'Release mode validates persisted intakes and skips simulated policy checks', async () => {
  const dependencies = releaseDependencies();
  const result = await evaluateReleaseReadiness({
    root: '/runtime/evidence',
    evidence: releaseEvidence(),
    releaseMode: true,
    expectedHead: EXACT_HEAD,
    validators: dependencies.validators,
    policyRunner: dependencies.policyRunner,
  });
  assert.equal(result.mode, 'RELEASE');
  assert.equal(result.releaseEligible, true);
  assert.equal(result.qualificationHarness, 'PERSISTED_RELEASE_EVIDENCE');
  assert.equal(result.internalManifestSemanticHash, 'fnv1a64:1111111111111111');
  assert.equal(result.externalPackageSemanticHash, 'fnv1a64:2222222222222222');
  assert.deepEqual(dependencies.counts(), {
    internalCalls: 1,
    externalCalls: 1,
    policyCalls: 0,
  });
});

test('P6E-ORCH-03', 'Runtime options are forbidden outside explicit release mode', () => {
  expectCode(
    () => parseReleaseInvocation(['--manifest=release.json'], process.cwd()),
    'LFEA_RELEASE_OPTIONS_REQUIRE_RELEASE_MODE',
  );
});

test('P6E-ORCH-04', 'Release mode requires manifest, evidence root and expected head', () => {
  expectCode(
    () => parseReleaseInvocation(['--release'], process.cwd()),
    'LFEA_RELEASE_RUNTIME_OPTIONS_MISSING',
  );
});

test('P6E-ORCH-05', 'Runtime manifest is loaded from a separate evidence root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6e-'));
  try {
    fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
    const manifestPath = path.join(root, 'bundle/release.json');
    const value = releaseEvidence();
    fs.writeFileSync(manifestPath, `${JSON.stringify(value, null, 2)}\n`);
    const invocation = parseReleaseInvocation([
      '--release',
      '--evidence-root=.',
      '--manifest=bundle/release.json',
      `--expected-head=${EXACT_HEAD}`,
    ], root);
    const loaded = loadReleaseEvidence(invocation);
    assert.equal(loaded.root, fs.realpathSync(root));
    assert.deepEqual(loaded.evidence, value);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('P6E-ORCH-06', 'Runtime manifest path traversal is rejected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6e-path-'));
  try {
    expectCode(
      () => parseReleaseInvocation([
        '--release',
        '--evidence-root=.',
        '--manifest=../release.json',
        `--expected-head=${EXACT_HEAD}`,
      ], root),
      'LFEA_RELEASE_RUNTIME_MANIFEST_PATH_INVALID',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await test('P6E-ORCH-07', 'Runtime manifest head must equal the supplied checkout head', async () => {
  const dependencies = releaseDependencies();
  await expectCodeAsync(
    () => evaluateReleaseReadiness({
      root: '/runtime/evidence',
      evidence: releaseEvidence(),
      releaseMode: true,
      expectedHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      validators: dependencies.validators,
      policyRunner: dependencies.policyRunner,
    }),
    'LFEA_RELEASE_CHECKOUT_HEAD_MISMATCH',
  );
});

await test('P6E-ORCH-08', 'Every release gate must be verified before intake execution', async () => {
  const value = releaseEvidence();
  value.gates.G7_PRESENTATION_EXPORT = 'PARTIALLY_VERIFIED';
  const dependencies = releaseDependencies();
  await expectCodeAsync(
    () => evaluateReleaseReadiness({
      root: '/runtime/evidence',
      evidence: value,
      releaseMode: true,
      expectedHead: EXACT_HEAD,
      validators: dependencies.validators,
      policyRunner: dependencies.policyRunner,
    }),
    'LFEA_RELEASE_GATES_NOT_VERIFIED',
  );
  assert.deepEqual(dependencies.counts(), {
    internalCalls: 0,
    externalCalls: 0,
    policyCalls: 0,
  });
});

await test('P6E-ORCH-09', 'Every runtime release artifact must be populated', async () => {
  const value = releaseEvidence();
  value.artifacts.interfaceEvidence = null;
  const dependencies = releaseDependencies();
  await expectCodeAsync(
    () => evaluateReleaseReadiness({
      root: '/runtime/evidence',
      evidence: value,
      releaseMode: true,
      expectedHead: EXACT_HEAD,
      validators: dependencies.validators,
      policyRunner: dependencies.policyRunner,
    }),
    'LFEA_RELEASE_ARTIFACTS_MISSING',
  );
});

await test('P6E-ORCH-10', 'Release mode requires qualified disposition', async () => {
  const dependencies = releaseDependencies();
  await expectCodeAsync(
    () => evaluateReleaseReadiness({
      root: '/runtime/evidence',
      evidence: releaseEvidence({ programDisposition: 'BLOCKED' }),
      releaseMode: true,
      expectedHead: EXACT_HEAD,
      validators: dependencies.validators,
      policyRunner: dependencies.policyRunner,
    }),
    'LFEA_RELEASE_DISPOSITION_NOT_QUALIFIED',
  );
});

await test('P6E-ORCH-11', 'Internal intake must be current and release eligible', async () => {
  const dependencies = releaseDependencies({
    internal: eligibleIntake('INTERNAL', { releaseEligible: false }),
  });
  await expectCodeAsync(
    () => evaluateReleaseReadiness({
      root: '/runtime/evidence',
      evidence: releaseEvidence(),
      releaseMode: true,
      expectedHead: EXACT_HEAD,
      validators: dependencies.validators,
      policyRunner: dependencies.policyRunner,
    }),
    'LFEA_RELEASE_INTERNAL_INTAKE_INVALID',
  );
});

await test('P6E-ORCH-12', 'External intake head cannot diverge', async () => {
  const dependencies = releaseDependencies({
    external: eligibleIntake('EXTERNAL', {
      exactHead: 'cccccccccccccccccccccccccccccccccccccccc',
    }),
  });
  await expectCodeAsync(
    () => evaluateReleaseReadiness({
      root: '/runtime/evidence',
      evidence: releaseEvidence(),
      releaseMode: true,
      expectedHead: EXACT_HEAD,
      validators: dependencies.validators,
      policyRunner: dependencies.policyRunner,
    }),
    'LFEA_RELEASE_EXTERNAL_INTAKE_INVALID',
  );
});

test('P6E-ORCH-13', 'Committed manifest remains blocked and self-reference free', () => {
  const value = policyEvidence();
  assert.equal(value.programDisposition, 'BLOCKED');
  assert.equal(value.exactHead, null);
  assert.equal(value.artifacts.exactHeadManifest, null);
  assert.equal(value.artifacts.externalQualificationPackage, null);
});

console.log('[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE] Phase 6E checks PASS');
