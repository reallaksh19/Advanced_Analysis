#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLafeaBucket01CandidateV3Bundle,
} from '../src/workspace/lafea-bucket-01-candidate-v3-bundle.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
  createLafeaBucket01ControlledReplayResult,
  validateLafeaBucket01ControlledReplayResult,
} from '../src/workspace/lafea-bucket-01-controlled-replay-result.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  buildCandidateCharacteristicH,
  buildLafeaBucket01CodeRevisionHash,
  buildLafeaBucket01FrozenInputHashes,
  buildReferenceCharacteristicH,
  controlledReplayExecutionEnvironment,
  executionEnvironmentPayload,
  git,
  materializeControlledReplayLevelArtifacts,
  rawHashFile,
  receipt,
  writeHashedJson,
  writeJson,
} from './lafea-bucket-01-controlled-replay-support.mjs';
import {
  ensureRouteOutputs,
  executeIndependentVerification,
  materializeCandidateSources,
  materializeGlobalArtifacts,
  materializeReferenceRoot,
  normalizedNamespace,
  readJson,
  routePaths,
  runRouteStages,
  runnerError,
} from './lafea-bucket-01-controlled-replay-runner-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_PATH = 'validation/bucket-01/13-probe-stable-polar-mesh-design.json';
const PROBE_SPEC_PATH = 'validation/bucket-01/08-production-lug-fixed-probe-spec.json';
const RESPONSE_SPEC_PATH = 'validation/bucket-01/06-production-response-convergence-spec.json';

export function runLafeaBucket01ControlledReplay(routeKindValue) {
  const routeKind = routeKindValue === 'CANDIDATE' ? 'CANDIDATE' : 'REFERENCE';
  const routeId = routeKind === 'CANDIDATE'
    ? 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY'
    : 'UNIFORM_T6_REFERENCE';
  const exactHeadSha = git(ROOT, ['rev-parse', 'HEAD']);
  const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || exactHeadSha;
  const namespace = normalizedNamespace(
    process.env.LAFEA_BUCKET_01_CONTROLLED_REPLAY_NAMESPACE
      ?? `reports/qualification/controlled-replay/${routeKind.toLowerCase()}`,
  );
  const outputPath = normalizedNamespace(
    process.env.LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_PATH
      ?? `${namespace}/controlled-replay-result.json`,
  );
  const retainedFailurePath = `${namespace}/controlled-replay-runner-blocked.json`;
  try {
    if (exactHeadSha !== expectedHeadSha) {
      throw runnerError(
        'LAFEA_B01_CONTROLLED_REPLAY_EXACT_HEAD_MISMATCH',
        `${expectedHeadSha}:${exactHeadSha}`,
      );
    }
    const design = readJson(DESIGN_PATH);
    const probeSpec = readJson(PROBE_SPEC_PATH);
    const responseSpec = readJson(RESPONSE_SPEC_PATH);
    const designHash = canonicalLafeaSha256(design);
    const bundle = buildLafeaBucket01CandidateV3Bundle({
      exactHeadSha,
      design,
      probeSpec,
    });
    if (bundle.designHash !== designHash) {
      throw runnerError('LAFEA_B01_CONTROLLED_REPLAY_DESIGN_HASH_MISMATCH');
    }
    const preRunTrackedStatus = git(ROOT, [
      'status', '--porcelain=v1', '--untracked-files=no',
    ]);
    const paths = routePaths(namespace, routeKind);
    const stageRecords = runRouteStages({
      routeKind,
      exactHeadSha,
      paths,
      namespace,
    });
    ensureRouteOutputs({
      routeKind,
      routeId,
      exactHeadSha,
      designHash,
      paths,
      responseSpec,
    });
    const projection = readJson(paths.projection);
    const execution = readJson(paths.execution);
    const response = readJson(paths.response);
    const stress = readJson(paths.stress);
    const kirsch = readJson(paths.kirsch);
    const exactHead = readJson(paths.exactHead);

    const candidateSources = materializeCandidateSources({
      routeId,
      exactHeadSha,
      designHash,
      namespace,
      bundle,
      design,
      probeSpec,
      responseSpec,
    });
    const rootReceipt = routeKind === 'CANDIDATE'
      ? candidateSources.candidatePackageReceipt
      : materializeReferenceRoot({
        routeId,
        exactHeadSha,
        designHash,
        namespace,
        projection,
      });
    const independent = routeKind === 'CANDIDATE'
      ? executeIndependentVerification({
        routeId,
        exactHeadSha,
        designHash,
        namespace,
        candidateSources,
      })
      : null;
    const rootReceipts = routeKind === 'CANDIDATE'
      ? [
        rootReceipt,
        candidateSources.candidateIntakeReceipt,
        independent.receipt,
      ]
      : [rootReceipt];
    const levelArtifacts = materializeControlledReplayLevelArtifacts({
      rootDirectory: ROOT,
      namespace: `${namespace}/materialized`,
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      projection,
      execution,
      rootReceipt,
      expectedWindow: {
        start: responseSpec.load.selectedSegmentRadiusStart,
        end: responseSpec.load.selectedSegmentRadiusEnd,
      },
    });
    const globalReceipts = materializeGlobalArtifacts({
      routeKind,
      routeId,
      exactHeadSha,
      designHash,
      namespace,
      paths,
      projection,
      response,
      stress,
      kirsch,
      exactHead,
      levelArtifacts,
      independent,
      stageRecords,
    });
    const postRunTrackedStatus = git(ROOT, [
      'status', '--porcelain=v1', '--untracked-files=no',
    ]);
    const environmentBase = executionEnvironmentPayload({
      rootDirectory: ROOT,
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      namespace,
      preRunTrackedStatus,
      postRunTrackedStatus,
    });
    const environmentFile = writeHashedJson(
      ROOT,
      namespace,
      'execution-environment.json',
      environmentBase,
    );
    const environmentReceipt = receipt(ROOT, {
      artifactId: `${routeId}:EXECUTION_ENVIRONMENT:GLOBAL`,
      artifactKind: 'EXECUTION_ENVIRONMENT',
      artifactScope: 'EXECUTION_ENVIRONMENT',
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [],
      relativePath: environmentFile.relativePath,
    });
    const packageLockReceipt = receipt(ROOT, {
      artifactId: `${routeId}:PACKAGE_LOCK:GLOBAL`,
      artifactKind: 'PACKAGE_LOCK',
      artifactScope: 'EXECUTION_ENVIRONMENT',
      routeId,
      levelOrdinal: null,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [],
      relativePath: 'package-lock.json',
    });
    const packageLockHash = rawHashFile(ROOT, 'package-lock.json');
    const frozenInputHashes = buildLafeaBucket01FrozenInputHashes({
      design,
      probeSpec,
      responseSpec,
      packageLockHash,
    });
    const characteristicH = routeKind === 'CANDIDATE'
      ? buildCandidateCharacteristicH(bundle, probeSpec)
      : buildReferenceCharacteristicH(responseSpec, probeSpec);
    const artifacts = [
      ...rootReceipts,
      ...levelArtifacts.receipts,
      ...globalReceipts,
      packageLockReceipt,
      environmentReceipt,
    ];
    const result = createLafeaBucket01ControlledReplayResult({
      schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      codeRevisionHash: buildLafeaBucket01CodeRevisionHash({
        exactHeadSha,
        packageLockHash,
      }),
      candidatePackageHash: bundle.candidatePackage.semanticHash,
      candidateIntakeEvidenceHash: bundle.intakeEvidence.semanticHash,
      independentCheckerEvidenceHash: independent?.evidence.semanticHash ?? null,
      frozenInputHashes,
      characteristicH,
      executionEnvironment: controlledReplayExecutionEnvironment(
        environmentFile.payload,
      ),
      artifacts,
    });
    const validation = validateLafeaBucket01ControlledReplayResult(result);
    if (!validation.ok) {
      throw runnerError(
        'LAFEA_B01_CONTROLLED_REPLAY_RESULT_REBUILD_FAILED',
        validation.errors.join(','),
      );
    }
    writeJson(ROOT, outputPath, result);
    console.log(JSON.stringify({
      schema: 'lafea-bucket-01-controlled-replay-runner-summary/v1',
      routeId,
      routeKind,
      exactHeadSha,
      resultPath: outputPath,
      resultHash: result.semanticHash,
      checks: result.checks,
      status: result.status,
      reasons: result.reasons,
      authority: result.authority,
    }));
    if (result.status !== 'PASS') process.exitCode = 1;
    return result;
  } catch (error) {
    const blocked = {
      schema: 'lafea-bucket-01-controlled-replay-runner-blocked/v1',
      routeId,
      routeKind,
      exactHeadSha,
      expectedHeadSha,
      status: 'BLOCKED',
      reasons: [error?.code ?? error?.message ?? 'UNKNOWN_CONTROLLED_REPLAY_FAILURE'],
      detail: error?.message ?? null,
      authority: {
        controlledReplayProduced: false,
        productionSwitchAuthorized: false,
        productionSwitchApplied: false,
        productionMeshAuthority: false,
        stressAcceptanceAuthority: false,
        qualificationAuthority: false,
        bucketQualified: false,
      },
    };
    writeJson(ROOT, retainedFailurePath, blocked);
    console.error(JSON.stringify(blocked));
    process.exitCode = 1;
    return blocked;
  }
}
