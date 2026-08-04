import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createRegisteredReplayArtifactReceipt,
} from './lafea-bucket-01-replay-artifact-registry.mjs';
export function writeHashedJson(rootDirectory, namespace, filename, base) {
  const payload = { ...base, semanticHash: canonicalLafeaSha256(base) };
  const relativePath = path.posix.join(namespace, filename);
  const absolutePath = path.resolve(rootDirectory, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { payload, relativePath };
}

export function writeJson(rootDirectory, relativePath, value) {
  const absolutePath = path.resolve(rootDirectory, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return relativePath;
}

export function copyJson(rootDirectory, sourceRelativePath, targetRelativePath) {
  const value = JSON.parse(fs.readFileSync(
    path.resolve(rootDirectory, sourceRelativePath),
    'utf8',
  ));
  return writeJson(rootDirectory, targetRelativePath, value);
}

export function receipt(rootDirectory, source) {
  return createRegisteredReplayArtifactReceipt(rootDirectory, source);
}

export function rawHashFile(rootDirectory, relativePath) {
  return `sha256:${createHash('sha256')
    .update(fs.readFileSync(path.resolve(rootDirectory, relativePath)))
    .digest('hex')}`;
}

export function git(rootDirectory, args) {
  const result = spawnSync('git', args, {
    cwd: rootDirectory,
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.error) {
    throw supportError(
      'LAFEA_B01_CONTROLLED_REPLAY_GIT_FAILED',
      result.stderr?.trim() || result.error?.message || args.join(' '),
    );
  }
  return result.stdout.trim();
}

export function runNodeStage(rootDirectory, script, environment, logPrefix) {
  const result = spawnSync(process.execPath, [script], {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
  fs.mkdirSync(path.dirname(path.resolve(rootDirectory, logPrefix)), {
    recursive: true,
  });
  fs.writeFileSync(
    path.resolve(rootDirectory, `${logPrefix}.stdout.log`),
    result.stdout ?? '',
    'utf8',
  );
  fs.writeFileSync(
    path.resolve(rootDirectory, `${logPrefix}.stderr.log`),
    result.stderr ?? '',
    'utf8',
  );
  if (result.status !== 0 || result.error) {
    const error = supportError(
      'LAFEA_B01_CONTROLLED_REPLAY_STAGE_BLOCKED',
      `${script}:${result.status}:${result.stderr?.slice(-2000) ?? ''}`,
    );
    error.result = result;
    throw error;
  }
  return result;
}

export function runNodeStageRetained(
  rootDirectory, script, environment, logPrefix,
) {
  const result = spawnSync(process.execPath, [script], {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
  fs.mkdirSync(path.dirname(path.resolve(rootDirectory, logPrefix)), {
    recursive: true,
  });
  fs.writeFileSync(
    path.resolve(rootDirectory, `${logPrefix}.stdout.log`),
    result.stdout ?? '',
    'utf8',
  );
  fs.writeFileSync(
    path.resolve(rootDirectory, `${logPrefix}.stderr.log`),
    [result.error?.message, result.stderr].filter(Boolean).join('\n'),
    'utf8',
  );
  return Object.freeze({
    script,
    status: result.status === 0 && !result.error ? 'PASS' : 'BLOCKED',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdoutPath: `${logPrefix}.stdout.log`,
    stderrPath: `${logPrefix}.stderr.log`,
    error: result.error?.message ?? null,
  });
}

export function buildLafeaBucket01FrozenInputHashes({
  design, probeSpec, responseSpec, packageLockHash,
}) {
  const hash = (label, value) => canonicalLafeaSha256({
    schema: 'lafea-bucket-01-frozen-input-hash/v1',
    label,
    value,
  });
  return Object.freeze({
    coordinates: hash('coordinates', {
      probes: probeSpec.probes,
      paths: probeSpec.paths,
    }),
    stressTolerances: hash('stressTolerances', probeSpec.tolerances),
    loads: hash('loads', responseSpec.load),
    supports: hash('supports', responseSpec.restraint),
    material: hash('material', responseSpec.material),
    solverPolicy: hash('solverPolicy', responseSpec.solverPolicy),
    codeBasisBoundary: hash('codeBasisBoundary', {
      extractionAuthority: 'RETAINED_DIRECT_T6_FIXED_PROBES_AND_PATHS',
      externalApprovalRequired: true,
      approvedCodeBasisSupplied: false,
    }),
    physicalProblemDefinition: hash('physicalProblemDefinition', {
      geometry: responseSpec.geometry,
      load: responseSpec.load,
      restraint: responseSpec.restraint,
      units: responseSpec.units,
    }),
    geometry: hash('geometry', responseSpec.geometry),
    thickness: hash('thickness', responseSpec.material?.thickness),
    formulationProfile: hash('formulationProfile', 'PLANE_STRESS_T6_PROBE_STABLE_V2'),
    probeSpecification: hash('probeSpecification', probeSpec),
    expectedValueRegistry: hash(
      'expectedValueRegistry',
      'validation/bucket-01/11-expected-value-registry.json',
    ),
    loadMappingPolicy: hash('loadMappingPolicy', {
      start: responseSpec.load?.selectedSegmentRadiusStart,
      end: responseSpec.load?.selectedSegmentRadiusEnd,
      role: responseSpec.load?.featureRole,
    }),
    boundaryMappingPolicy: hash('boundaryMappingPolicy', {
      role: responseSpec.restraint?.featureRole,
      start: responseSpec.load?.selectedSegmentRadiusStart,
      end: responseSpec.load?.selectedSegmentRadiusEnd,
    }),
    recoveryProfile: hash(
      'recoveryProfile',
      'DIRECT_T6_B_MATRIX_AT_FIXED_PHYSICAL_COORDINATE',
    ),
    convergenceProfile: hash('convergenceProfile', {
      response: responseSpec.convergence,
      stress: probeSpec.tolerances,
    }),
    qualificationProfile: hash('qualificationProfile', {
      packageLockHash,
      exactHeadRequired: true,
      externalCodeAuthorityRequired: true,
      triplicateReplayRequired: true,
    }),
  });
}

export function buildLafeaBucket01CodeRevisionHash({
  exactHeadSha, packageLockHash,
}) {
  return canonicalLafeaSha256({
    schema: 'lafea-bucket-01-code-revision/v1',
    exactHeadSha,
    packageLockHash,
  });
}

export function buildCandidateCharacteristicH(bundle, probeSpec) {
  const locations = allFrozenLocations(probeSpec);
  const globalValues = bundle.packages.map((packageValue) => {
    const area = Math.PI * (
      probeSpec.geometry.outerRadius ** 2
      - probeSpec.geometry.holeRadius ** 2
    );
    return Math.sqrt(area / packageValue.mesh.elements.length);
  });
  return characteristicH({
    globalDefinition: 'GLOBAL_AREA_EQUIVALENT_CHARACTERISTIC_SIZE',
    globalValues,
    locations: locations.map((location) => ({
      locationId: location.locationId,
      radius: location.radius,
      values: bundle.packages.map((packageValue) => {
        const radialCell = packageValue.spec.radialAxis.anchorCells.find(
          (row) => Math.abs(row.anchorValue - location.radius) <= 1e-12,
        );
        const angularCell = packageValue.spec.circumferentialAxis.anchorCells.find(
          (row) => Math.abs(row.anchorValue - location.angleDegrees) <= 1e-12,
        );
        if (!radialCell || !angularCell) {
          throw supportError(
            'LAFEA_B01_CONTROLLED_REPLAY_LOCAL_H_ANCHOR_MISSING',
            location.locationId,
          );
        }
        return Math.sqrt(
          radialCell.width
          * location.radius
          * angularCell.width * Math.PI / 180,
        );
      }),
    })),
  });
}

export function buildReferenceCharacteristicH(responseSpec, probeSpec) {
  const globalValues = responseSpec.meshLadder.map((row) => row.meshSize);
  const locations = allFrozenLocations(probeSpec).map((location) => ({
    locationId: location.locationId,
    radius: location.radius,
    values: responseSpec.meshLadder.map((row) => {
      const deltaR = (
        responseSpec.geometry.outerRadius - responseSpec.geometry.holeRadius
      ) / row.radialDivisions;
      const deltaTheta = 2 * Math.PI / row.circumferentialDivisions;
      return Math.sqrt(deltaR * location.radius * deltaTheta);
    }),
  }));
  return characteristicH({
    globalDefinition: 'UNIFORM_GOVERNED_MESH_SIZE',
    globalValues,
    locations,
  });
}

function characteristicH({ globalDefinition, globalValues, locations }) {
  return Object.freeze({
    schema: 'lafea-bucket-01-characteristic-h-evidence/v1',
    globalDefinition,
    globalLevels: globalValues.map((value, index) => ({
      ordinal: index + 1,
      globalCharacteristicH: value,
      refinementRatioToPrevious: index === 0
        ? null : globalValues[index - 1] / value,
    })),
    localDefinition: 'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS',
    locations: locations.map((row) => ({
      locationId: row.locationId,
      radius: row.radius,
      levelValues: row.values,
      refinementRatiosToPrevious: row.values.slice(1).map(
        (value, index) => row.values[index] / value,
      ),
    })),
    constantGlobalRatioAssumed: false,
    unequalRatioMethod: 'ACTUAL_H_VALUES_OR_BLOCK',
    topologyCompatibilityVerified: true,
  });
}

function allFrozenLocations(probeSpec) {
  return [
    ...(probeSpec.probes ?? []).map((row) => ({
      locationId: row.probeId,
      radius: row.radius,
      angleDegrees: row.angleDegrees,
    })),
    ...(probeSpec.paths ?? []).flatMap((pathValue) =>
      pathValue.stations.map((station) => ({
        locationId: `${pathValue.pathId}:${station.stationId}`,
        radius: station.radius,
        angleDegrees: pathValue.angleDegrees,
      }))),
  ];
}

export function executionEnvironmentPayload({
  rootDirectory,
  routeId,
  routeKind,
  exactHeadSha,
  designHash,
  namespace,
  preRunTrackedStatus,
  postRunTrackedStatus,
}) {
  const packageLockHash = rawHashFile(rootDirectory, 'package-lock.json');
  const environmentBase = {
    schema: 'lafea-bucket-01-controlled-replay-execution-environment/v1',
    producerRevision: 'B01-CONTROLLED-REPLAY-ENVIRONMENT.1',
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    packageLockHash,
    nodeVersion: process.version,
    npmVersion: npmVersion(rootDirectory),
    platform: process.platform,
    architecture: process.arch,
    hostnameClass: os.hostname() ? 'HOSTNAME_RETAINED_AS_HASH_ONLY' : 'UNKNOWN',
    allowlistedEnvironmentHash: canonicalLafeaSha256({
      nodeVersion: process.version,
      npmVersion: npmVersion(rootDirectory),
      platform: process.platform,
      architecture: process.arch,
    }),
    preRunTrackedClean: preRunTrackedStatus === '',
    postRunTrackedClean: postRunTrackedStatus === '',
    isolatedOutputNamespace: namespace,
    status: preRunTrackedStatus === '' && postRunTrackedStatus === ''
      ? 'PASS' : 'BLOCKED',
    reasons: [
      ...(preRunTrackedStatus ? ['PRE_RUN_TRACKED_TREE_DIRTY'] : []),
      ...(postRunTrackedStatus ? ['POST_RUN_TRACKED_TREE_DIRTY'] : []),
    ],
  };
  return environmentBase;
}

export function controlledReplayExecutionEnvironment(value) {
  return {
    packageLockHash: value.packageLockHash,
    nodeVersion: value.nodeVersion,
    npmVersion: value.npmVersion,
    platform: value.platform,
    architecture: value.architecture,
    allowlistedEnvironmentHash: value.allowlistedEnvironmentHash,
    preRunTrackedStatusHash: canonicalLafeaSha256({
      trackedStatus: value.preRunTrackedClean ? '' : 'DIRTY',
    }),
    postRunTrackedStatusHash: canonicalLafeaSha256({
      trackedStatus: value.postRunTrackedClean ? '' : 'DIRTY',
    }),
    isolatedOutputNamespace: value.isolatedOutputNamespace,
  };
}

export function firstHash(...values) {
  const found = values.find((value) =>
    typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value));
  if (!found) throw supportError('LAFEA_B01_CONTROLLED_REPLAY_HASH_MISSING');
  return found;
}

function npmVersion(rootDirectory) {
  const result = spawnSync('npm', ['--version'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.error) return 'UNAVAILABLE';
  return result.stdout.trim();
}

function supportError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
