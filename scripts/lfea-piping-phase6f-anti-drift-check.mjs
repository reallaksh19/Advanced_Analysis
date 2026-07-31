#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const collectorPath = 'scripts/lfea-piping-internal-evidence-collector.mjs';
const checkPath = 'scripts/lfea-piping-internal-evidence-collector-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const collector = fs.readFileSync(collectorPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const wrapper = fs.readFileSync(wrapperPath, 'utf8');

assert.ok(collector.split(/\r?\n/u).length < 500, 'Phase 6F collector limit is <500 lines.');
assert.ok(check.split(/\r?\n/u).length < 350, 'Phase 6F collector-check limit is <350 lines.');
assert.match(collector, /path\.resolve\(process\.argv\[1\]/u);
assert.match(collector, /spawnSync/u);
assert.match(collector, /sealInternalExactHeadManifest/u);
assert.match(collector, /contentHashForInternalArtifact/u);
assert.match(collector, /LFEA_INTERNAL_COLLECTION_CHECKOUT_HEAD_MISMATCH/u);
assert.match(collector, /LFEA_INTERNAL_COLLECTION_OUTPUT_INSIDE_REPOSITORY/u);
assert.match(collector, /LFEA_INTERNAL_COLLECTION_OUTPUT_NOT_EMPTY/u);
assert.match(collector, /LFEA_INTERNAL_COLLECTION_COMMAND_FAILED/u);
assert.match(collector, /collection-failure\.json/u);
assert.match(collector, /npm.*run.*gate/us);
assert.match(collector, /git diff --check/u);
assert.match(collector, /git status --porcelain/u);
for (const commandId of [
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
]) assert.match(collector, new RegExp(commandId, 'u'));
assert.doesNotMatch(
  collector,
  /check:lfea-piping-release|externalQualificationPackage|commercialCorroboration/u,
  'Phase 6F collects internal evidence only and must not invoke release or external qualification.',
);
assert.doesNotMatch(
  collector,
  /release-evidence\/lfea-piping-release-evidence\.json/u,
  'Phase 6F must not read or write release gate state.',
);
assert.match(collector, /fs\.readdirSync\(requested\)\.length > 0/u);
assert.doesNotMatch(
  collector,
  /rmSync\(requested/u,
  'Phase 6F must never delete a caller-supplied output directory.',
);

assert.match(check, /\[SIMULATED\]\[NO_ENGINEERING_COMMAND_EXECUTION\]/u);
assert.match(check, /successfulRunner/u);
assert.match(check, /LFEA_INTERNAL_COLLECTION_COMMAND_FAILED/u);
assert.match(check, /LFEA_INTERNAL_COLLECTION_OUTPUT_NOT_EMPTY/u);
assert.match(check, /validateInternalReleaseEvidence/u);
assert.doesNotMatch(
  check,
  /spawnSync|execFile|child_process/u,
  'Phase 6F qualification must use the injected fake runner only.',
);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.exactHeadManifest, null);
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

assert.match(wrapper, /lfea-piping-phase6f-anti-drift-check\.mjs/u);

await import('./lfea-piping-internal-evidence-collector-check.mjs');

console.log('Linear piping Phase 6F internal evidence collection anti-drift check PASS');
