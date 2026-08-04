#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA,
  deriveLafeaBucket01ControlledReplayFromArtifacts,
  validateLafeaBucket01ReplayArtifactCustody,
} from '../src/workspace/lafea-bucket-01-replay-artifact-custody.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPLAY_ARTIFACT_INPUT_PATH
    ?? 'external/qualification/lafea-bucket-01-replay-artifact-input.json',
);
const OUTPUT_DIRECTORY = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPLAY_ARTIFACT_OUTPUT_DIRECTORY
    ?? 'reports/qualification/lafea-bucket-01-replay-artifact-custody',
);
const exactHeadSha = git(['rev-parse', 'HEAD']);
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || exactHeadSha;
if (exactHeadSha !== expectedHeadSha) {
  throw new Error(`Expected exact head ${expectedHeadSha}; found ${exactHeadSha}.`);
}
const definition = readJson(INPUT_PATH);
if (definition.schema !== 'lafea-bucket-01-replay-artifact-file-input/v1'
  || definition.exactHeadSha !== exactHeadSha
  || !Array.isArray(definition.artifacts)
  || 'checks' in definition
  || 'status' in definition) {
  throw new Error('Replay artifact file input is invalid or stale.');
}
const candidateArtifactHeadSha = definition.candidateArtifactHeadSha;
const mergeBaseSha = git(['merge-base', candidateArtifactHeadSha, exactHeadSha]);
const candidateArtifactHeadIsAncestor = gitStatus([
  'merge-base', '--is-ancestor', candidateArtifactHeadSha, exactHeadSha,
]) === 0;
const artifacts = definition.artifacts.map((row) => {
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
});
const result = deriveLafeaBucket01ControlledReplayFromArtifacts({
  schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA,
  routeId: definition.routeId,
  exactHeadSha,
  designId: definition.designId,
  designHash: definition.designHash,
  candidateArtifactHeadSha,
  mergeBaseSha,
  candidateArtifactHeadIsAncestor,
  artifacts,
});
const validation = validateLafeaBucket01ReplayArtifactCustody(
  result.artifactManifest,
  result.replayResult,
  result.custodyEvidence,
);
if (!validation.ok) {
  throw new Error(`Replay artifact custody validation failed: ${validation.errors.join(',')}`);
}
writeJson(path.join(OUTPUT_DIRECTORY, 'artifact-manifest.json'), result.artifactManifest);
writeJson(path.join(OUTPUT_DIRECTORY, 'controlled-replay-result.json'), result.replayResult);
writeJson(path.join(OUTPUT_DIRECTORY, 'custody-evidence.json'), result.custodyEvidence);
console.log(JSON.stringify({
  schema: 'lafea-bucket-01-replay-artifact-custody-check-summary/v1',
  status: result.replayResult.status,
  exactHeadSha,
  candidateArtifactHeadSha,
  derivedChecks: result.replayResult.checks,
  reasons: result.replayResult.reasons,
  outputDirectory: path.relative(ROOT, OUTPUT_DIRECTORY),
  authority: result.custodyEvidence.authority,
}));
if (result.replayResult.status !== 'PASS') process.exit(1);

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
