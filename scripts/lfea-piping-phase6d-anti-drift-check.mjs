#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const intakePath = 'scripts/lfea-piping-internal-release-evidence-check.mjs';
const checkPath = 'scripts/lfea-piping-internal-release-evidence-check-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const policyPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const intake = fs.readFileSync(intakePath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const policy = fs.readFileSync(policyPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));

assert.ok(intake.split(/\r?\n/u).length < 500, 'Phase 6D intake source limit is <500 lines.');
assert.match(intake, /lfea-piping-exact-head-manifest\/v1/u);
assert.match(intake, /exactHeadManifest/u);
for (const gate of [
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
]) assert.match(intake, new RegExp(gate, 'u'));
for (const commandId of [
  'CLEAN_TREE',
  'CODE_AND_ALLOWABLES',
  'EXACT_HEAD_BASELINE',
  'FULL_REPOSITORY_GATE',
  'INTERFACES',
  'INTERFACE_RECOVERY',
  'PRESENTATION_EXPORT',
  'SOURCE_ORCHESTRATION',
  'T0_APPLICATION_SEQUENCING',
  'UPSTREAM_NUMERICAL_CHAIN',
]) assert.match(intake, new RegExp(commandId, 'u'));
assert.match(intake, /LFEA_INTERNAL_COMMAND_COVERAGE_INVALID/u);
assert.match(intake, /LFEA_INTERNAL_COMMAND_ARTIFACT_HASH_MISMATCH/u);
assert.match(intake, /LFEA_INTERNAL_ARTIFACT_COMMAND_MISSING/u);
assert.match(intake, /LFEA_INTERNAL_ARTIFACT_ROLE_MISMATCH/u);
assert.match(intake, /LFEA_INTERNAL_ARTIFACT_STATUS_INVALID/u);
assert.match(intake, /LFEA_INTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH/u);
assert.match(intake, /LFEA_INTERNAL_MANIFEST_HEAD_MISMATCH/u);
assert.match(intake, /fs\.realpathSync/u);
assert.match(intake, /fs\.lstatSync/u);
assert.match(intake, /path\.resolve\(process\.argv\[1\]/u);
assert.doesNotMatch(
  intake,
  /writeFile|appendFile|createWriteStream|child_process|spawn\(|execFile\(|shelljs/u,
  'Phase 6D must validate retained evidence without writing or executing external tools.',
);
assert.doesNotMatch(
  intake,
  /gates\[[^\]]+\]\s*=|artifacts\[[^\]]+\]\s*=/u,
  'Phase 6D must not mutate release gate or artifact state.',
);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_RELEASE_EVIDENCE\]/u);
assert.match(check, /ELIGIBLE_FOR_RELEASE_REVIEW/u);
assert.match(check, /LFEA_INTERNAL_MANIFEST_ARTIFACT_MISSING/u);
assert.match(check, /LFEA_INTERNAL_COMMAND_COVERAGE_INVALID/u);
assert.match(check, /LFEA_INTERNAL_CLEAN_TREE_NOT_PROVEN/u);
assert.match(check, /LFEA_INTERNAL_ARTIFACT_COMMAND_MISSING/u);
assert.match(check, /LFEA_INTERNAL_ARTIFACT_ROLE_MISMATCH/u);
assert.match(check, /LFEA_INTERNAL_ARTIFACT_STATUS_INVALID/u);
assert.match(check, /LFEA_INTERNAL_RELEASE_GATE_NOT_VERIFIED/u);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.exactHeadManifest, null);
assert.equal(release.artifacts.upstreamGateLog, null);
assert.equal(release.artifacts.t0GateLog, null);
assert.equal(release.artifacts.sourceOrchestrationEvidence, null);
assert.equal(release.artifacts.interfaceEvidence, null);
assert.equal(release.artifacts.interfaceRecoveryEvidence, null);
assert.equal(release.artifacts.codeAndAllowableEvidence, null);
assert.equal(release.artifacts.presentationExportEvidence, null);
for (const gate of [
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
]) assert.notEqual(release.gates[gate], 'VERIFIED');

assert.match(policy, /lfea-piping-phase6c-anti-drift-check\.mjs/u);
assert.match(policy, /lfea-piping-phase6d-anti-drift-check\.mjs/u);
assert.match(policy, /requireExactKeys\(evidence\.artifacts, REQUIRED_ARTIFACTS/u);

await import('./lfea-piping-internal-release-evidence-check-check.mjs');

console.log('Linear piping Phase 6D internal exact-head evidence anti-drift check PASS');
