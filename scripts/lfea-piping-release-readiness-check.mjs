#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(ROOT, 'release-evidence', 'lfea-piping-release-evidence.json');
const RELEASE_STATUSES = Object.freeze([
  'VERIFIED',
  'PARTIALLY_VERIFIED',
  'CONTRADICTED',
  'UNRESOLVED_GATE',
  'NOT_IMPLEMENTED',
  'NOT_APPLICABLE',
]);
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

const mode = process.argv.includes('--release') ? 'RELEASE' : 'POLICY';
const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));

requireExactKeys(evidence, [
  'schema',
  'program',
  'programDisposition',
  'exactHead',
  'gates',
  'artifacts',
], 'LFEA_RELEASE_EVIDENCE_KEYS_INVALID');

if (evidence.schema !== 'lfea-piping-release-evidence/v1') {
  fail('LFEA_RELEASE_EVIDENCE_SCHEMA_INVALID');
}
if (evidence.program !== 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN') {
  fail('LFEA_RELEASE_PROGRAM_INVALID');
}
requireExactKeys(evidence.gates, REQUIRED_GATES, 'LFEA_RELEASE_GATE_KEYS_INVALID');
requireExactKeys(evidence.artifacts, REQUIRED_ARTIFACTS, 'LFEA_RELEASE_ARTIFACT_KEYS_INVALID');

for (const [gate, status] of Object.entries(evidence.gates)) {
  if (!RELEASE_STATUSES.includes(status)) {
    fail('LFEA_RELEASE_GATE_STATUS_INVALID', { gate, status });
  }
}

if (mode === 'RELEASE') {
  const unverified = Object.entries(evidence.gates)
    .filter(([, status]) => status !== 'VERIFIED')
    .map(([gate, status]) => ({ gate, status }));
  const missingArtifacts = Object.entries(evidence.artifacts)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([artifact]) => artifact);

  if (!/^[0-9a-f]{40}$/u.test(evidence.exactHead ?? '')) {
    fail('LFEA_RELEASE_EXACT_HEAD_REQUIRED', { exactHead: evidence.exactHead });
  }
  if (unverified.length) {
    fail('LFEA_RELEASE_GATES_NOT_VERIFIED', { unverified });
  }
  if (missingArtifacts.length) {
    fail('LFEA_RELEASE_ARTIFACTS_MISSING', { missingArtifacts });
  }
  if (evidence.programDisposition !== 'QUALIFIED') {
    fail('LFEA_RELEASE_DISPOSITION_NOT_QUALIFIED', {
      programDisposition: evidence.programDisposition,
    });
  }
} else if (evidence.programDisposition !== 'BLOCKED') {
  fail('LFEA_PRE_RELEASE_DISPOSITION_MUST_BE_BLOCKED', {
    programDisposition: evidence.programDisposition,
  });
}

await import('./linear-piping-project-qualification-check.mjs');
await import('./linear-piping-project-qualification-anti-drift-check.mjs');
await import('./lfea-piping-phase6c-anti-drift-check.mjs');
await import('./lfea-piping-phase6d-anti-drift-check.mjs');

console.log(JSON.stringify({
  check: 'lfea-piping-release-readiness',
  mode,
  programDisposition: evidence.programDisposition,
  verifiedGateCount: Object.values(evidence.gates).filter((row) => row === 'VERIFIED').length,
  totalGateCount: REQUIRED_GATES.length,
  releaseEligible: mode === 'RELEASE',
  qualificationHarness: 'SIMULATED_FIXTURES_ONLY',
}));

function requireExactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, { reason: 'NOT_A_RECORD' });
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(code, { actual, expected });
  }
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
