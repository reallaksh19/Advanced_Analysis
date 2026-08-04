#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  evaluateLafeaBucket01CandidateReplayAdjudication,
  validateLafeaBucket01CandidateReplayAdjudicationEvidence,
} from '../src/workspace/lafea-bucket-01-candidate-replay-adjudication.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA,
  evaluateLafeaBucket01ControlledCandidateReplayProposal,
} from '../src/workspace/lafea-bucket-01-controlled-candidate-replay-proposal.js';
import {
  buildLafeaBucket01CandidateV3Bundle,
} from '../src/workspace/lafea-bucket-01-candidate-v3-bundle.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { git, writeJson } from './lafea-bucket-01-controlled-replay-support.mjs';
import {
  revalidateRegisteredControlledReplayResult,
} from './lafea-bucket-01-replay-artifact-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exactHeadSha = git(ROOT, ['rev-parse', 'HEAD']);
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || exactHeadSha;
const referencePath = relative(
  process.env.LAFEA_BUCKET_01_REFERENCE_CONTROLLED_REPLAY_PATH
    ?? 'reports/qualification/controlled-replay/reference/controlled-replay-result.json',
);
const candidatePath = relative(
  process.env.LAFEA_BUCKET_01_CANDIDATE_CONTROLLED_REPLAY_PATH
    ?? 'reports/qualification/controlled-replay/candidate/controlled-replay-result.json',
);
const outputPath = relative(
  process.env.LAFEA_BUCKET_01_CANDIDATE_ADJUDICATION_PATH
    ?? 'reports/qualification/controlled-replay/candidate-replay-adjudication.json',
);
const design = readJson('validation/bucket-01/13-probe-stable-polar-mesh-design.json');
const probeSpec = readJson('validation/bucket-01/08-production-lug-fixed-probe-spec.json');
let report;
try {
  if (exactHeadSha !== expectedHeadSha) {
    throw adjudicationRunnerError('LAFEA_B01_ADJUDICATION_EXACT_HEAD_MISMATCH');
  }
  const bundle = buildLafeaBucket01CandidateV3Bundle({
    exactHeadSha,
    design,
    probeSpec,
  });
  const proposal = evaluateLafeaBucket01ControlledCandidateReplayProposal({
    schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA,
    exactHeadSha,
    designId: design.designId,
    designHash: bundle.designHash,
    candidateIntakeEvidence: bundle.intakeEvidence,
    referenceProductionRoute: {
      routeId: 'UNIFORM_T6_REFERENCE',
      meshFamily: 'LAFEA_LUG_PINHOLE_UNIFORM_T6',
      entrypoint: 'scripts/lafea-bucket-01-production-replay.mjs',
      retained: true,
    },
    candidateReplayRoute: {
      routeId: 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY',
      meshFamily: 'LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V3',
      entrypoint: 'scripts/lafea-bucket-01-probe-stable-v3-controlled-replay.mjs',
      retained: false,
    },
    rollbackRoute: {
      routeId: 'UNIFORM_T6_REFERENCE',
      meshFamily: 'LAFEA_LUG_PINHOLE_UNIFORM_T6',
      entrypoint: 'scripts/lafea-bucket-01-production-replay.mjs',
      retained: true,
    },
  });
  const referenceReplay = revalidateRegisteredControlledReplayResult(
    ROOT,
    readJson(referencePath),
  );
  const candidateReplay = revalidateRegisteredControlledReplayResult(
    ROOT,
    readJson(candidatePath),
  );
  report = evaluateLafeaBucket01CandidateReplayAdjudication({
    schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
    exactHeadSha,
    designHash: bundle.designHash,
    proposalEvidence: proposal,
    referenceReplay,
    candidateReplay,
  });
  const validation = validateLafeaBucket01CandidateReplayAdjudicationEvidence(
    report,
  );
  if (!validation.ok) {
    throw adjudicationRunnerError(
      'LAFEA_B01_ADJUDICATION_REBUILD_FAILED',
      validation.errors.join(','),
    );
  }
} catch (error) {
  const base = {
    schema: 'lafea-bucket-01-candidate-replay-adjudication-runner-blocked/v1',
    exactHeadSha,
    designHash: canonicalLafeaSha256(design),
    referencePath,
    candidatePath,
    status: 'BLOCKED',
    disposition: 'RETAIN_CANDIDATE_FOR_DIAGNOSTIC_USE_ONLY',
    reasons: [error?.code ?? error?.message ?? 'UNKNOWN_ADJUDICATION_FAILURE'],
    authority: {
      candidateEligibleForProductionSwitchReview: false,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  report = { ...base, semanticHash: canonicalLafeaSha256(base) };
  process.exitCode = 1;
}
writeJson(ROOT, outputPath, report);
console.log(JSON.stringify(report));
if (report.disposition !== 'ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW') {
  process.exitCode = 1;
}

function readJson(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    throw adjudicationRunnerError(
      'LAFEA_B01_ADJUDICATION_REQUIRED_ARTIFACT_MISSING',
      relativePath,
    );
  }
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}
function relative(value) {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
  if (!normalized || normalized.split('/').includes('..')) {
    throw adjudicationRunnerError('LAFEA_B01_ADJUDICATION_PATH_INVALID');
  }
  return normalized;
}
function adjudicationRunnerError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
