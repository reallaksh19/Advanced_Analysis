#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const orchestratorPath = 'scripts/lfea-piping-release-orchestrator.mjs';
const wrapperPath = 'scripts/lfea-piping-release-readiness-check.mjs';
const checkPath = 'scripts/lfea-piping-release-orchestration-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const packagePath = 'package.json';
const orchestrator = fs.readFileSync(orchestratorPath, 'utf8');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const packageValue = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

assert.ok(orchestrator.split(/\r?\n/u).length < 400, 'Phase 6E orchestrator limit is <400 lines.');
assert.ok(wrapper.split(/\r?\n/u).length < 80, 'Release wrapper limit is <80 lines.');
assert.match(orchestrator, /--evidence-root/u);
assert.match(orchestrator, /--expected-head/u);
assert.match(orchestrator, /--manifest/u);
assert.match(orchestrator, /LFEA_RELEASE_RUNTIME_OPTIONS_MISSING/u);
assert.match(orchestrator, /LFEA_RELEASE_CHECKOUT_HEAD_MISMATCH/u);
assert.match(orchestrator, /PERSISTED_RELEASE_EVIDENCE/u);
assert.match(orchestrator, /SIMULATED_FIXTURES_ONLY/u);
assert.match(orchestrator, /validators\.internal/u);
assert.match(orchestrator, /validators\.external/u);
assert.match(orchestrator, /await policyRunner\(\)/u);
assert.doesNotMatch(
  orchestrator,
  /project-qualification-check|phase6c-anti-drift|phase6d-anti-drift/u,
  'The orchestration kernel must not import simulated policy suites.',
);
assert.doesNotMatch(
  orchestrator,
  /child_process|spawn\(|execFile\(|shelljs|writeFile|appendFile|createWriteStream/u,
  'Runtime release orchestration must not execute tools or write evidence.',
);

assert.match(wrapper, /lfea-piping-release-orchestrator\.mjs/u);
assert.match(wrapper, /validateExternalReleaseEvidence/u);
assert.match(wrapper, /validateInternalReleaseEvidence/u);
assert.match(wrapper, /lfea-piping-phase6e-anti-drift-check\.mjs/u);
assert.match(wrapper, /path\.resolve\(process\.argv\[1\]/u);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_RELEASE_EVIDENCE\]/u);
assert.match(check, /PERSISTED_RELEASE_EVIDENCE/u);
assert.match(check, /LFEA_RELEASE_OPTIONS_REQUIRE_RELEASE_MODE/u);
assert.match(check, /LFEA_RELEASE_RUNTIME_OPTIONS_MISSING/u);
assert.match(check, /LFEA_RELEASE_CHECKOUT_HEAD_MISMATCH/u);
assert.match(check, /LFEA_RELEASE_INTERNAL_INTAKE_INVALID/u);
assert.match(check, /LFEA_RELEASE_EXTERNAL_INTAKE_INVALID/u);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.equal(release.artifacts.exactHeadManifest, null);
assert.equal(release.artifacts.externalQualificationPackage, null);
assert.equal(
  packageValue.scripts['check:lfea-piping-release-policy'],
  'node scripts/lfea-piping-release-readiness-check.mjs',
);
assert.equal(
  packageValue.scripts['check:lfea-piping-release'],
  'node scripts/lfea-piping-release-readiness-check.mjs --release',
);
assert.match(packageValue.scripts.gate, /check:lfea-piping-release-policy/u);

await import('./lfea-piping-release-orchestration-check.mjs');

console.log('Linear piping Phase 6E runtime release orchestration anti-drift check PASS');
