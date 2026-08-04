import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  evaluateLafeaBucket01IndependentCandidateVerification,
  validateLafeaBucket01IndependentCandidateVerification,
} from '../src/workspace/lafea-bucket-01-independent-candidate-verification.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  firstHash,
  git,
  rawHashFile,
  receipt,
  runNodeStageRetained,
  writeHashedJson,
  writeJson,
} from './lafea-bucket-01-controlled-replay-support.mjs';
import { descriptor, envelope } from './lafea-bucket-01-controlled-replay-runner-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function runRouteStages({ routeKind, exactHeadSha, paths, namespace }) {
  const common = {
    EXPECTED_HEAD_SHA: exactHeadSha,
    LAFEA_BUCKET_01_EXACT_HEAD_REPORT_PATH: paths.exactHead,
    LAFEA_BUCKET_01_KIRSCH_PROBE_REPORT_PATH: paths.kirsch,
  };
  const records = [
    runNodeStageRetained(
      ROOT,
      'scripts/lafea-bucket-01-exact-head-check.mjs',
      common,
      `${namespace}/logs/exact-head`,
    ),
    runNodeStageRetained(
      ROOT,
      'scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs',
      common,
      `${namespace}/logs/kirsch`,
    ),
  ];
  if (routeKind === 'CANDIDATE') {
    const environment = {
      ...common,
      LAFEA_BUCKET_01_CANDIDATE_PROJECTION_PATH: paths.projection,
      LAFEA_BUCKET_01_CANDIDATE_EXECUTION_PATH: paths.execution,
      LAFEA_BUCKET_01_CANDIDATE_RESPONSE_PATH: paths.response,
      LAFEA_BUCKET_01_CANDIDATE_RUNNER_PATH: paths.runner,
      LAFEA_BUCKET_01_CANDIDATE_STRESS_PATH: paths.stress,
    };
    records.push(
      runNodeStageRetained(
        ROOT,
        'scripts/lafea-bucket-01-probe-stable-v3-global-response-runner.mjs',
        environment,
        `${namespace}/logs/candidate-response`,
      ),
      runNodeStageRetained(
        ROOT,
        'scripts/lafea-bucket-01-probe-stable-v3-direct-point-receipt.mjs',
        environment,
        `${namespace}/logs/candidate-stress`,
      ),
    );
  } else {
    const environment = {
      ...common,
      LAFEA_BUCKET_01_PRODUCTION_PROJECTION_PATH: paths.projection,
      LAFEA_BUCKET_01_PRODUCTION_EXECUTION_PATH: paths.execution,
      LAFEA_BUCKET_01_PRODUCTION_RESPONSE_REPORT_PATH: paths.response,
      LAFEA_BUCKET_01_PRODUCTION_LUG_PROBE_REPORT_PATH: paths.stress,
    };
    records.push(
      runNodeStageRetained(
        ROOT,
        'scripts/lafea-bucket-01-production-response-runner.mjs',
        environment,
        `${namespace}/logs/reference-execution`,
      ),
      runNodeStageRetained(
        ROOT,
        'scripts/lafea-bucket-01-production-response-receipt.mjs',
        environment,
        `${namespace}/logs/reference-response`,
      ),
      runNodeStageRetained(
        ROOT,
        'scripts/lafea-bucket-01-production-lug-probe-receipt.mjs',
        environment,
        `${namespace}/logs/reference-stress`,
      ),
    );
  }
  return records;
}

export function materializeCandidateSources({
  routeId,
  exactHeadSha,
  designHash,
  namespace,
  bundle,
  design,
  probeSpec,
  responseSpec,
}) {
  const sourceRoot = `${namespace}/candidate-source`;
  const candidatePackagePath = `${sourceRoot}/candidate-package.json`;
  const candidateIntakePath = `${sourceRoot}/candidate-intake.json`;
  writeJson(ROOT, candidatePackagePath, bundle.candidatePackage);
  writeJson(ROOT, candidateIntakePath, bundle.intakeEvidence);
  const candidatePackageReceipt = receipt(ROOT, {
    artifactId: `${routeId}:CANDIDATE_PACKAGE:GLOBAL`,
    artifactKind: 'CANDIDATE_PACKAGE',
    artifactScope: 'CANDIDATE_MESH_BOUND',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [],
    relativePath: candidatePackagePath,
  });
  const candidateIntakeReceipt = receipt(ROOT, {
    artifactId: `${routeId}:CANDIDATE_INTAKE:GLOBAL`,
    artifactKind: 'CANDIDATE_INTAKE',
    artifactScope: 'CANDIDATE_MESH_BOUND',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [candidatePackageReceipt.semanticHash],
    relativePath: candidateIntakePath,
  });
  const designPath = `${sourceRoot}/design.json`;
  const probePath = `${sourceRoot}/probe-spec.json`;
  const responsePath = `${sourceRoot}/response-spec.json`;
  writeJson(ROOT, designPath, design);
  writeJson(ROOT, probePath, probeSpec);
  writeJson(ROOT, responsePath, responseSpec);
  const levelPaths = bundle.packages.map((packageValue, index) => {
    const relativePath = `${sourceRoot}/candidate-level-${index + 1}.json`;
    writeJson(ROOT, relativePath, packageValue);
    return relativePath;
  });
  return {
    bundle,
    candidatePackagePath,
    candidateIntakePath,
    candidatePackageReceipt,
    candidateIntakeReceipt,
    designPath,
    probePath,
    responsePath,
    levelPaths,
  };
}

export function executeIndependentVerification({
  routeId,
  exactHeadSha,
  designHash,
  namespace,
  candidateSources,
}) {
  const candidatePackageHash = candidateSources.candidatePackageReceipt.semanticHash;
  const intakeHash = candidateSources.candidateIntakeReceipt.semanticHash;
  const artifacts = [
    descriptor({
      artifactId: `${routeId}:CANDIDATE_INTAKE_SOURCE`,
      artifactScope: 'CANDIDATE_MESH_BOUND',
      role: 'CANDIDATE_INTAKE_EVIDENCE',
      relativePath: candidateSources.candidateIntakePath,
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [candidatePackageHash],
    }),
    descriptor({
      artifactId: `${routeId}:DESIGN_SOURCE`,
      artifactScope: 'CANDIDATE_MESH_BOUND',
      role: 'DESIGN',
      relativePath: candidateSources.designPath,
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [],
    }),
    descriptor({
      artifactId: `${routeId}:PROBE_SPEC_SOURCE`,
      artifactScope: 'CANDIDATE_MESH_BOUND',
      role: 'FROZEN_PROBE_SPEC',
      relativePath: candidateSources.probePath,
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [designHash],
    }),
    descriptor({
      artifactId: `${routeId}:RESPONSE_SPEC_SOURCE`,
      artifactScope: 'CANDIDATE_MESH_BOUND',
      role: 'PRODUCTION_RESPONSE_SPEC',
      relativePath: candidateSources.responsePath,
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [designHash],
    }),
    ...candidateSources.levelPaths.map((relativePath, index) => descriptor({
      artifactId: `${routeId}:CANDIDATE_LEVEL_${index + 1}`,
      artifactScope: 'CANDIDATE_MESH_BOUND',
      role: `CANDIDATE_LEVEL_${index + 1}`,
      relativePath,
      routeId,
      levelOrdinal: index + 1,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [candidatePackageHash, intakeHash],
    })),
  ];
  const suppliedManifestBase = {
    schema: 'lafea-bucket-01-phase-3a-supplied-artifact-manifest/v1',
    producerRevision: 'B01-CONTROLLED-REPLAY-INDEPENDENT-INPUT.1',
    exactHeadSha,
    designHash,
    artifacts,
    authority: {
      productionSwitchAuthorized: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  const suppliedManifest = {
    ...suppliedManifestBase,
    semanticHash: canonicalLafeaSha256(suppliedManifestBase),
  };
  const suppliedManifestPath = `${namespace}/candidate-source/supplied-manifest.json`;
  writeJson(ROOT, suppliedManifestPath, suppliedManifest);
  const manifestEnvelope = envelope({
    ...descriptor({
      artifactId: `${routeId}:SUPPLIED_MANIFEST_SOURCE`,
      artifactScope: 'REPOSITORY_REGRESSION',
      role: 'REPLAY_ARTIFACT_MANIFEST',
      relativePath: suppliedManifestPath,
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [],
    }),
  });
  const envelopes = artifacts.map(envelope);
  const byRole = new Map(envelopes.map((row) => [row.role, row]));
  const result = evaluateLafeaBucket01IndependentCandidateVerification({
    schema: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
    verificationHeadSha: exactHeadSha,
    candidateArtifactHeadSha: exactHeadSha,
    mergeBaseSha: exactHeadSha,
    candidateArtifactHeadIsAncestor: true,
    replayArtifactManifestArtifact: manifestEnvelope,
    candidateIntakeEvidenceArtifact: byRole.get('CANDIDATE_INTAKE_EVIDENCE'),
    designArtifact: byRole.get('DESIGN'),
    probeSpecArtifact: byRole.get('FROZEN_PROBE_SPEC'),
    productionResponseSpecArtifact: byRole.get('PRODUCTION_RESPONSE_SPEC'),
    levelArtifacts: [1, 2, 3, 4].map(
      (ordinal) => byRole.get(`CANDIDATE_LEVEL_${ordinal}`),
    ),
  });
  const validation = validateLafeaBucket01IndependentCandidateVerification(
    result.evidence,
    result.artifactManifest,
  );
  if (!validation.ok) {
    throw runnerError(
      'LAFEA_B01_CONTROLLED_REPLAY_INDEPENDENT_REBUILD_FAILED',
      validation.errors.join(','),
    );
  }
  const evidencePath = `${namespace}/independent-checker-evidence.json`;
  const manifestPath = `${namespace}/independent-checker-artifact-manifest.json`;
  writeJson(ROOT, evidencePath, result.evidence);
  writeJson(ROOT, manifestPath, result.artifactManifest);
  const independentReceipt = receipt(ROOT, {
    artifactId: `${routeId}:INDEPENDENT_CHECKER_EVIDENCE:GLOBAL`,
    artifactKind: 'INDEPENDENT_CHECKER_EVIDENCE',
    artifactScope: 'CANDIDATE_MESH_BOUND',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [candidatePackageHash, intakeHash],
    relativePath: evidencePath,
  });
  return {
    evidence: result.evidence,
    artifactManifest: result.artifactManifest,
    receipt: independentReceipt,
    evidencePath,
    manifestPath,
  };
}
