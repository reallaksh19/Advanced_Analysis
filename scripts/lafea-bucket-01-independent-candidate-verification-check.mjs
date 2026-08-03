#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  evaluateLafeaBucket01IndependentCandidateVerification,
  validateLafeaBucket01IndependentCandidateVerification,
} from '../src/workspace/lafea-bucket-01-independent-candidate-verification.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PHASE_3A_INDEPENDENT_INPUT_PATH
    ?? 'external/qualification/lafea-bucket-01-phase-3a-independent-input.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PHASE_3A_INDEPENDENT_REPORT_PATH
    ?? 'reports/qualification-diagnostics/lafea-bucket-01-phase-3a-independent-verification.json',
);
const ARTIFACT_MANIFEST_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PHASE_3A_ARTIFACT_MANIFEST_PATH
    ?? 'reports/qualification-diagnostics/lafea-bucket-01-phase-3a-artifact-manifest.json',
);
const verificationHeadSha = git(['rev-parse', 'HEAD']);
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || verificationHeadSha;
if (verificationHeadSha !== expectedHeadSha) {
  throw new Error(`Expected exact head ${expectedHeadSha}; found ${verificationHeadSha}.`);
}
const definition = readJson(INPUT_PATH);
if (definition.schema !== 'lafea-bucket-01-phase-3a-independent-file-input/v1'
  || !Array.isArray(definition.artifacts)
  || typeof definition.candidateArtifactHeadSha !== 'string') {
  throw new Error('Phase 3A independent file input is invalid.');
}
if ('checks' in definition || 'status' in definition) {
  throw new Error('Submitted check maps or dispositions are not accepted.');
}
const candidateArtifactHeadSha = definition.candidateArtifactHeadSha;
const candidateArtifactHeadIsAncestor = gitStatus([
  'merge-base', '--is-ancestor', candidateArtifactHeadSha, verificationHeadSha,
]) === 0;
const mergeBaseSha = git(['merge-base', candidateArtifactHeadSha, verificationHeadSha]);
const artifacts = definition.artifacts.map(envelopeFromDefinition);
const byRole = new Map(artifacts.map((row) => [row.role, row]));
const levelArtifacts = [1, 2, 3, 4].map((ordinal) =>
  requireRole(`CANDIDATE_LEVEL_${ordinal}`));
const result = evaluateLafeaBucket01IndependentCandidateVerification({
  schema: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  verificationHeadSha,
  candidateArtifactHeadSha,
  mergeBaseSha,
  candidateArtifactHeadIsAncestor,
  replayArtifactManifestArtifact: requireRole('REPLAY_ARTIFACT_MANIFEST'),
  candidateIntakeEvidenceArtifact: requireRole('CANDIDATE_INTAKE_EVIDENCE'),
  designArtifact: requireRole('DESIGN'),
  probeSpecArtifact: requireRole('FROZEN_PROBE_SPEC'),
  productionResponseSpecArtifact: requireRole('PRODUCTION_RESPONSE_SPEC'),
  levelArtifacts,
});
const validation = validateLafeaBucket01IndependentCandidateVerification(
  result.evidence,
  result.artifactManifest,
);
if (!validation.ok) {
  throw new Error(`Independent evidence rebuild failed: ${validation.errors.join(',')}`);
}
writeJson(REPORT_PATH, result.evidence);
writeJson(ARTIFACT_MANIFEST_PATH, result.artifactManifest);
console.log(JSON.stringify({
  schema: 'lafea-bucket-01-independent-candidate-verification-check-summary/v1',
  status: result.evidence.status,
  exactHeadSha: verificationHeadSha,
  candidateArtifactHeadSha,
  candidateArtifactHeadIsAncestor,
  reportPath: path.relative(ROOT, REPORT_PATH),
  artifactManifestPath: path.relative(ROOT, ARTIFACT_MANIFEST_PATH),
  levelStatuses: result.evidence.levels.map((row) => ({
    ordinal: row.ordinal,
    status: row.status,
    loadWindowExact: row.loadWindow.exactWindow,
    restraintWindowExact: row.restraintWindow.exactWindow,
  })),
  reasons: result.evidence.reasons,
  authority: result.evidence.authority,
}));
if (result.evidence.status !== 'PASS') process.exit(1);

function envelopeFromDefinition(row) {
  const absolutePath = path.resolve(ROOT, row.relativePath);
  return {
    artifactId: row.artifactId,
    artifactScope: row.artifactScope,
    role: row.role,
    relativePath: row.relativePath,
    routeId: row.routeId,
    levelOrdinal: row.levelOrdinal,
    exactHeadSha: row.exactHeadSha,
    designHash: row.designHash,
    parentArtifactHashes: row.parentArtifactHashes,
    declaredRawFileHash: row.rawFileHash,
    computedRawFileHash: rawHash(absolutePath),
    payload: readJson(absolutePath),
  };
}
function requireRole(role) {
  const artifact = byRole.get(role);
  if (!artifact) throw new Error(`Phase 3A input missing artifact role ${role}.`);
  return artifact;
}
function readJson(absolutePath) {
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing artifact: ${absolutePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}
function writeJson(absolutePath, value) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function rawHash(absolutePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')}`;
}
function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr?.trim() || result.error?.message || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}
function gitStatus(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).status;
}
