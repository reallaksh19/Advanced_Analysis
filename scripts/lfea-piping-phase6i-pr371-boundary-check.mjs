#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const CONTRACT_PATH = 'governance/lfea-piping-phase6i-pr371-boundary.json';
const RELEASE_LEDGER_PATH = 'release-evidence/lfea-piping-release-evidence.json';
const ENFORCEMENT_FILES = new Set([
  'scripts/lfea-piping-phase6i-pr371-boundary-check.mjs',
  'scripts/lfea-piping-phase6i-project-authority-index.mjs',
  'scripts/lfea-piping-phase6i-project-authority-index-check.mjs',
]);
const CONTRACT_KEYS = Object.freeze([
  'schema',
  'phase6iProgram',
  'externalProgram',
  'relationship',
  'frozenCandidate',
  'immutableRef',
  'projectAuthorityOwner',
  'permittedExternalOutputs',
  'prohibitedUses',
  'futureAdoptionRequires',
  'currentCandidateConsumptionAllowed',
  'externalProgramAuthorityAllowed',
]);
const EXPECTED_PERMITTED_OUTPUTS = Object.freeze([
  'PROVENANCE_BOUND_PROPOSALS',
  'SHADOW_IMPACT_EVIDENCE',
]);
const EXPECTED_PROHIBITED_USES = Object.freeze([
  'DIRECT_LFEA_INPUT',
  'PROJECT_AUTHORITY_CREATION',
  'CURRENT_CANDIDATE_MUTATION',
  'RELEASE_EVIDENCE_SUBSTITUTION',
  'BASELINE_APPROVAL',
  'RESULT_ACCEPTANCE',
]);
const EXPECTED_FUTURE_REQUIREMENTS = Object.freeze([
  'FIELD_LEVEL_ENGINEERING_APPROVAL',
  'APPROVED_PRECEDENCE_AND_DERIVATION_POLICY',
  'NEW_IMMUTABLE_LFEA_CANDIDATE',
  'AFFECTED_EVIDENCE_CHAIN_REEXECUTION',
]);
const FORBIDDEN_SOURCE_PATTERNS = Object.freeze([
  Object.freeze({
    id: 'ENGINEERING_ENRICHMENT_PATH',
    pattern: /(?:src\/workspace\/engineering-enrichment|engineering-enrichment\/)/u,
  }),
  Object.freeze({
    id: 'ENGINEERING_ENRICHMENT_CONTRACT',
    pattern: /EngineeringEnrichment(?:Proposal|CandidateProjection|NumericalImpact|PortableBundle)/u,
  }),
  Object.freeze({
    id: 'SHADOW_AUTHORITY_TOKEN',
    pattern: /(?:AUTHORIZED_MASTER_CANDIDATE|SHADOW_CANDIDATE_VALUE|PROPOSAL_ONLY)/u,
  }),
  Object.freeze({
    id: 'EMPIRICAL_ROUTE',
    pattern: /check:1885s-empirical/u,
  }),
]);

const contract = readJson(CONTRACT_PATH);
requireExactKeys(contract, CONTRACT_KEYS, 'Phase 6I / PR #371 boundary contract');
assert.equal(contract.schema, 'lfea-piping-phase6i-external-program-boundary/v1');
assert.equal(contract.phase6iProgram, 'LFEA_PIPING_PHASE6I');
assert.equal(contract.externalProgram, 'PR_371_LOAD_CALC_ENRICHMENT');
assert.equal(contract.relationship, 'NON_DEPENDENT_SHADOW_PRODUCER_ONLY');
assert.equal(contract.frozenCandidate, '617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54');
assert.equal(contract.immutableRef, 'release/lfea-piping-phase6i-617f7c2');
assert.equal(contract.projectAuthorityOwner, 'WP_2_PROJECT_AUTHORITY_INDEX');
assert.deepEqual(contract.permittedExternalOutputs, EXPECTED_PERMITTED_OUTPUTS);
assert.deepEqual(contract.prohibitedUses, EXPECTED_PROHIBITED_USES);
assert.deepEqual(contract.futureAdoptionRequires, EXPECTED_FUTURE_REQUIREMENTS);
assert.equal(contract.currentCandidateConsumptionAllowed, false);
assert.equal(contract.externalProgramAuthorityAllowed, false);

const governedFiles = discoverGovernedFiles();
assert.ok(governedFiles.length > 0, 'No governed LFEA Phase 6I files were discovered.');
for (const relativePath of governedFiles) {
  if (ENFORCEMENT_FILES.has(relativePath)) continue;
  const source = fs.readFileSync(path.join(ROOT, ...relativePath.split('/')), 'utf8');
  for (const rule of FORBIDDEN_SOURCE_PATTERNS) {
    assert.equal(
      rule.pattern.test(source),
      false,
      `${rule.id}: ${relativePath} imports or promotes PR #371 shadow enrichment.`,
    );
  }
}

const release = readJson(RELEASE_LEDGER_PATH);
assert.equal(release.programDisposition, 'BLOCKED');
assert.equal(release.exactHead, null);
assert.ok(Object.values(release.gates ?? {}).every((status) => status !== 'VERIFIED'));
assert.ok(Object.values(release.artifacts ?? {}).every((value) => value === null));

console.log(JSON.stringify({
  schema: 'lfea-piping-phase6i-pr371-boundary-check-result/v1',
  status: 'PASS',
  governedFileCount: governedFiles.length,
  enforcementFileCount: ENFORCEMENT_FILES.size,
  relationship: contract.relationship,
  currentCandidateConsumptionAllowed: false,
  externalProgramAuthorityAllowed: false,
  releaseEvidenceEligible: false,
}));

function discoverGovernedFiles() {
  const files = [];
  walk(ROOT, (relativePath) => {
    if (isGovernedPath(relativePath)) files.push(relativePath);
  });
  return files.sort(compareAscii);
}

function walk(directory, visitor) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(ROOT, absolutePath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      walk(absolutePath, visitor);
    } else if (entry.isFile()) {
      visitor(relativePath);
    }
  }
}

function isGovernedPath(relativePath) {
  return /^scripts\/(?:lfea-piping|linear-piping)-.*\.mjs$/u.test(relativePath)
    || /^src\/core\/(?:linear-fea|linear-piping)-/u.test(relativePath)
    || /^src\/workspace\/(?:lfea|linear-piping)/u.test(relativePath)
    || /^\.github\/workflows\/lfea-piping-.*\.ya?ml$/u.test(relativePath)
    || relativePath === RELEASE_LEDGER_PATH;
}

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, ...relativePath.split('/'));
  assert.equal(fs.existsSync(absolutePath), true, `Missing required file: ${relativePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function requireExactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value).sort(compareAscii), [...expected].sort(compareAscii));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
