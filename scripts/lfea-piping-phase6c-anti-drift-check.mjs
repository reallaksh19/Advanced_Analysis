#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const intakePath = 'scripts/lfea-piping-external-release-evidence-check.mjs';
const checkPath = 'scripts/lfea-piping-external-release-evidence-check-check.mjs';
const releasePath = 'release-evidence/lfea-piping-release-evidence.json';
const intake = fs.readFileSync(intakePath, 'utf8');
const check = fs.readFileSync(checkPath, 'utf8');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));

assert.match(intake, /requireLinearPipingExternalQualificationPackage/u);
assert.match(intake, /canonicalStringify/u);
assert.match(intake, /semanticHash/u);
assert.match(intake, /externalQualificationPackage/u);
assert.match(intake, /G8_REAL_MODEL_RECONCILIATION/u);
assert.match(intake, /G9_COMMERCIAL_CORROBORATION/u);
assert.match(intake, /G10_RELEASE_ROLLBACK/u);
assert.match(intake, /LFEA_EXTERNAL_PACKAGE_HEAD_MISMATCH/u);
assert.match(intake, /LFEA_EXTERNAL_ARTIFACT_RECORD_MISMATCH/u);
assert.match(intake, /LFEA_EXTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH/u);
assert.match(intake, /LFEA_EXTERNAL_ARTIFACT_IDENTITY_MISMATCH/u);
assert.match(intake, /LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE/u);
assert.match(intake, /process\.argv\.includes\('--release'\)/u);
assert.doesNotMatch(
  intake,
  /writeFile|appendFile|createWriteStream|child_process|spawn\(|execFile\(|shelljs/u,
  'Phase 6C must validate supplied evidence without writing or executing external tools.',
);
assert.doesNotMatch(
  intake,
  /gates\[[^\]]+\]\s*=|artifacts\[[^\]]+\]\s*=/u,
  'Phase 6C must not mutate release gate or artifact state.',
);

assert.match(check, /\[SIMULATED\]\[INELIGIBLE_FOR_PROJECT_EVIDENCE\]/u);
assert.match(check, /LFEA_EXTERNAL_PACKAGE_ARTIFACT_MISSING/u);
assert.match(check, /LFEA_EXTERNAL_ARTIFACT_PATH_INVALID/u);
assert.match(check, /LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE/u);
assert.match(check, /canonicalJsonArtifactHash/u);

assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.gates.G8_REAL_MODEL_RECONCILIATION, 'UNRESOLVED_GATE');
assert.equal(release.gates.G9_COMMERCIAL_CORROBORATION, 'UNRESOLVED_GATE');
assert.equal(release.gates.G10_RELEASE_ROLLBACK, 'UNRESOLVED_GATE');
assert.equal(release.artifacts.realModelReconciliation, null);
assert.equal(release.artifacts.commercialCorroboration, null);
assert.equal(release.artifacts.performanceEvidence, null);
assert.equal(release.artifacts.rollbackEvidence, null);
assert.equal(release.artifacts.signedDisposition, null);
assert.equal(release.artifacts.externalQualificationPackage, null);

await import('./lfea-piping-external-release-evidence-check-check.mjs');

console.log('Linear piping Phase 6C persisted release-evidence anti-drift check PASS');
