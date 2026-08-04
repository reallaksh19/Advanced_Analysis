#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
  createLafeaBucket01ControlledReplayResult,
  validateLafeaBucket01ControlledReplayResult,
} from '../src/workspace/lafea-bucket-01-controlled-replay-result.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createRegisteredReplayArtifactReceipt,
  revalidateRegisteredControlledReplayResult,
} from './lafea-bucket-01-replay-artifact-registry.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lafea-b01-replay-registry-'));
const exactHeadSha = 'a'.repeat(40);
const designHash = hash('design');
let candidatePackageHash;
let candidateIntakeEvidenceHash;
let independentCheckerEvidenceHash;
const frozenInputHashes = Object.fromEntries([
  'coordinates', 'stressTolerances', 'loads', 'supports', 'material',
  'solverPolicy', 'codeBasisBoundary', 'physicalProblemDefinition',
  'geometry', 'thickness', 'formulationProfile', 'probeSpecification',
  'expectedValueRegistry', 'loadMappingPolicy', 'boundaryMappingPolicy',
  'recoveryProfile', 'convergenceProfile', 'qualificationProfile',
].map((key) => [key, hash(`frozen:${key}`)]));
write('package-lock.json', { name: 'fixture', lockfileVersion: 3, packages: {} });

const candidate = buildReplay('CANDIDATE');
assert.equal(candidate.status, 'PASS');
assert.equal(candidate.authority.registeredArtifactValidatorsExecuted, true);
assert.equal(candidate.authority.statusesDerivedFromValidatedPayloads, true);
assert.equal(validateLafeaBucket01ControlledReplayResult(candidate).ok, true);
assert.equal(candidate.artifactRegistry.registryRevision, '3');
assert.equal(
  revalidateRegisteredControlledReplayResult(root, clone(candidate)).semanticHash,
  candidate.semanticHash,
);

const reference = buildReplay('REFERENCE');
assert.equal(reference.status, 'PASS');
assert.equal(reference.authority.independentCheckerExecution, false);
assert.equal(validateLafeaBucket01ControlledReplayResult(reference).ok, true);

assert.throws(
  () => createRegisteredReplayArtifactReceipt(root, {
    ...source('MISSING', 'KIRSCH_EVIDENCE', 'REPOSITORY_REGRESSION', null, [], 'missing.json'),
  }),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_MISSING'),
);

const badSchemaPath = 'negative/bad-schema.json';
writeHashed(badSchemaPath, {
  schema: 'synthetic-kirsch/v1',
  producerRevision: 'SYNTHETIC.1',
  status: 'PASS',
});
assert.throws(
  () => receipt(source(
    'BAD-SCHEMA', 'KIRSCH_EVIDENCE', 'REPOSITORY_REGRESSION', null, [], badSchemaPath,
  )),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_SCHEMA_UNREGISTERED'),
);

const badHashPath = 'negative/bad-hash.json';
write(badHashPath, {
  schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v2',
  producerRevision: 'B01-KIRSCH-PROBES.2',
  exactHeadSha,
  status: 'PASS',
  reasons: [],
  evidenceHash: hash('wrong'),
});
assert.throws(
  () => receipt(source(
    'BAD-HASH', 'KIRSCH_EVIDENCE', 'REPOSITORY_REGRESSION', null, [], badHashPath,
  )),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_SELF_HASH_MISMATCH'),
);

assert.throws(
  () => createRegisteredReplayArtifactReceipt(root, {
    ...source(
      'CALLER-PASS', 'KIRSCH_EVIDENCE', 'REPOSITORY_REGRESSION', null, [],
      candidate.artifacts.find((row) => row.artifactKind === 'KIRSCH_EVIDENCE').relativePath,
    ),
    validationStatus: 'PASS',
  }),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_SOURCE_EXACT_KEYS_INVALID'),
);

const tamperedValidator = clone(candidate);
tamperedValidator.artifacts[0].validatorId = 'CALLER-VALIDATOR';
rehashResult(tamperedValidator);
assert.equal(validateLafeaBucket01ControlledReplayResult(tamperedValidator).ok, false);
assert.throws(
  () => rebuild(tamperedValidator),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_NOT_REGISTRY_VERIFIED'),
);
assert.throws(
  () => revalidateRegisteredControlledReplayResult(root, tamperedValidator),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_REVALIDATION_MISMATCH'),
);

const tamperedValidationHash = clone(candidate);
tamperedValidationHash.artifacts[0].validationEvidenceHash = hash('tampered-validation');
rehashResult(tamperedValidationHash);
assert.throws(
  () => rebuild(tamperedValidationHash),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_NOT_REGISTRY_VERIFIED'),
);
assert.throws(
  () => revalidateRegisteredControlledReplayResult(root, tamperedValidationHash),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_REVALIDATION_MISMATCH'),
);

const alteredPath = candidate.artifacts.find(
  (row) => row.artifactKind === 'RESPONSE_EVIDENCE',
).relativePath;
const alteredPayload = JSON.parse(fs.readFileSync(path.join(root, alteredPath), 'utf8'));
alteredPayload.status = 'BLOCKED';
fs.writeFileSync(
  path.join(root, alteredPath),
  `${JSON.stringify(alteredPayload, null, 2)}\n`,
  'utf8',
);
assert.throws(
  () => receipt(source(
    'ALTERED-BYTES', 'RESPONSE_EVIDENCE', 'CANDIDATE_MESH_BOUND', null, [], alteredPath,
  )),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_SELF_HASH_MISMATCH'),
);

console.log('PASS LAFEA Bucket-01 registered replay artifact custody contract');
fs.rmSync(root, { recursive: true, force: true });

function buildReplay(routeKind) {
  const routeId = routeKind === 'CANDIDATE'
    ? 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY' : 'UNIFORM_T6_REFERENCE';
  const scope = routeKind === 'CANDIDATE'
    ? 'CANDIDATE_MESH_BOUND' : 'REFERENCE_MESH_BOUND';
  const prefix = routeKind.toLowerCase();
  const artifacts = [];
  let rootReceipt;
  if (routeKind === 'CANDIDATE') {
    const packagePath = `${prefix}/candidate-package.json`;
    const packagePayload = writeHashed(packagePath, {
      schema: 'lafea-bucket-01-probe-stable-candidate-mesh-package/v1',
      producerRevision: 'B01-PROBE-STABLE-T6.3',
      exactHeadSha,
      designHash,
      status: 'PASS',
      reasons: [],
    });
    candidatePackageHash = packagePayload.semanticHash;
    rootReceipt = receipt(source(
      `${routeId}:CANDIDATE_PACKAGE:GLOBAL`,
      'CANDIDATE_PACKAGE', scope, null, [], packagePath, routeId,
    ));
    const intakePath = `${prefix}/candidate-intake.json`;
    const intakePayload = writeHashed(intakePath, {
      schema: 'lafea-bucket-01-probe-stable-candidate-intake-evidence/v2',
      producerRevision: 'B01-PROBE-STABLE-INTAKE.3',
      exactHeadSha,
      designHash,
      status: 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
      reasons: [],
    });
    candidateIntakeEvidenceHash = intakePayload.semanticHash;
    const intakeReceipt = receipt(source(
      `${routeId}:CANDIDATE_INTAKE:GLOBAL`,
      'CANDIDATE_INTAKE', scope, null,
      [rootReceipt.semanticHash], intakePath, routeId,
    ));
    const independentPath = `${prefix}/independent.json`;
    const independentPayload = writeHashed(independentPath, {
      schema: 'lafea-bucket-01-independent-candidate-verification-evidence/v1',
      producerRevision: 'B01-INDEPENDENT-CANDIDATE-VERIFICATION.1',
      exactHeadSha,
      designHash,
      status: 'PASS',
      reasons: [],
      authority: { independentCheckerExecution: true },
    });
    independentCheckerEvidenceHash = independentPayload.semanticHash;
    const independentReceipt = receipt(source(
      `${routeId}:INDEPENDENT_CHECKER_EVIDENCE:GLOBAL`,
      'INDEPENDENT_CHECKER_EVIDENCE', scope, null,
      [rootReceipt.semanticHash, intakeReceipt.semanticHash], independentPath, routeId,
    ));
    artifacts.push(rootReceipt, intakeReceipt, independentReceipt);
  } else {
    const rootPath = `${prefix}/reference-root.json`;
    writeHashed(rootPath, {
      schema: 'lafea-bucket-01-controlled-replay-reference-mesh-ladder/v1',
      producerRevision: 'B01-CONTROLLED-REFERENCE-ROOT.1',
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      elementCounts: [64, 256, 1024, 4096],
      status: 'PASS',
      reasons: [],
    });
    rootReceipt = receipt(source(
      `${routeId}:REFERENCE_MESH_LADDER:GLOBAL`,
      'REFERENCE_MESH_LADDER', scope, null, [], rootPath, routeId,
    ));
    artifacts.push(rootReceipt);
  }
  const executions = [];
  const meshes = [];
  for (let level = 1; level <= 4; level += 1) {
    const mesh = registeredJson({
      routeId, routeKind, scope, prefix, level,
      kind: 'ANALYSIS_MESH_EVIDENCE',
      schema: 'lafea-bucket-01-controlled-replay-analysis-mesh/v1',
      parents: [rootReceipt],
      extra: {
        elementCount: routeKind === 'CANDIDATE'
          ? [480, 1190, 4080, 14256][level - 1]
          : [64, 256, 1024, 4096][level - 1],
        qualityAccepted: true,
        meshHash: hash(`${routeId}:mesh:${level}`),
      },
    });
    const document = registeredJson({
      routeId, routeKind, scope, prefix, level,
      kind: 'STAGE_DOCUMENT',
      schema: 'lafea-bucket-01-controlled-replay-stage-document/v1',
      parents: [mesh],
      extra: {
        documentHash: hash(`${routeId}:document:${level}`),
        meshHash: mesh.semanticHash,
      },
    });
    const load = registeredJson({
      routeId, routeKind, scope, prefix, level,
      kind: 'LOAD_MAPPING',
      schema: 'lafea-bucket-01-controlled-replay-load-mapping/v1',
      parents: [mesh, document],
      extra: {
        physicalWindowExact: true,
        mappingHash: hash(`${routeId}:load:${level}`),
      },
    });
    const boundary = registeredJson({
      routeId, routeKind, scope, prefix, level,
      kind: 'BOUNDARY_MAPPING',
      schema: 'lafea-bucket-01-controlled-replay-boundary-mapping/v1',
      parents: [mesh, document],
      extra: {
        physicalWindowExact: true,
        mappingHash: hash(`${routeId}:boundary:${level}`),
      },
    });
    const mapping = registeredJson({
      routeId, routeKind, scope, prefix, level,
      kind: 'MAPPING_PACKAGE',
      schema: 'lafea-bucket-01-controlled-replay-mapping-package/v1',
      parents: [mesh, document, load, boundary],
      extra: { mappingPackageHash: hash(`${routeId}:mapping:${level}`) },
    });
    const execution = registeredJson({
      routeId, routeKind, scope, prefix, level,
      kind: 'EXECUTION_RECEIPT',
      schema: 'lafea-bucket-01-controlled-replay-execution-receipt/v1',
      parents: [mesh, document, mapping],
      extra: {
        solverAccepted: true,
        equilibriumAccepted: true,
        energyAccepted: true,
        resultHash: hash(`${routeId}:result:${level}`),
      },
    });
    artifacts.push(mesh, document, load, boundary, mapping, execution);
    meshes.push(mesh);
    executions.push(execution);
  }
  const response = registeredJson({
    routeId, routeKind, scope, prefix, level: null,
    kind: 'RESPONSE_EVIDENCE',
    schema: routeKind === 'CANDIDATE'
      ? 'lafea-bucket-01-candidate-response-evidence/v1'
      : 'lafea-bucket-01-production-response-evidence/v2',
    parents: executions,
  });
  const stress = registeredJson({
    routeId, routeKind, scope, prefix, level: null,
    kind: 'PRODUCTION_STRESS_EVIDENCE',
    schema: routeKind === 'CANDIDATE'
      ? 'lafea-bucket-01-candidate-stress-evidence/v1'
      : 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
    parents: executions,
  });
  const topology = registeredJson({
    routeId, routeKind, scope, prefix, level: null,
    kind: 'TOPOLOGY_AUDIT_EVIDENCE',
    schema: 'lafea-bucket-01-controlled-replay-topology-audit/v1',
    parents: meshes,
  });
  const convergence = registeredJson({
    routeId, routeKind, scope, prefix, level: null,
    kind: 'CONVERGENCE_EVIDENCE',
    schema: 'lafea-bucket-01-controlled-replay-convergence/v1',
    parents: executions,
    extra: { allLocationsPass: true },
  });
  const kirsch = registeredJson({
    routeId, routeKind, scope: 'REPOSITORY_REGRESSION', prefix, level: null,
    kind: 'KIRSCH_EVIDENCE',
    schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v2',
    parents: [],
  });
  const exact = registeredJson({
    routeId, routeKind, scope: 'REPOSITORY_REGRESSION', prefix, level: null,
    kind: 'REPOSITORY_GATE_REPORT',
    schema: 'lafea-bucket-01-exact-head-report/v18',
    parents: [],
    extra: {
      status: 'EXACT_HEAD_REPAIR_EVIDENCE_PASS',
      blockingCheckIds: [],
    },
  });
  const stdoutPath = `${prefix}/stdout.log`;
  fs.mkdirSync(path.dirname(path.join(root, stdoutPath)), { recursive: true });
  fs.writeFileSync(path.join(root, stdoutPath), 'controlled replay fixture PASS\n');
  const stdout = receipt(source(
    `${routeId}:STDOUT_LOG:GLOBAL`, 'STDOUT_LOG', 'EXECUTION_ENVIRONMENT',
    null, [], stdoutPath, routeId,
  ));
  const stderrPath = `${prefix}/stderr.log`;
  fs.writeFileSync(path.join(root, stderrPath), '');
  const stderr = receipt(source(
    `${routeId}:STDERR_LOG:GLOBAL`, 'STDERR_LOG', 'EXECUTION_ENVIRONMENT',
    null, [], stderrPath, routeId,
  ));
  const packageLock = receipt(source(
    `${routeId}:PACKAGE_LOCK:GLOBAL`, 'PACKAGE_LOCK', 'EXECUTION_ENVIRONMENT',
    null, [], 'package-lock.json', routeId,
  ));
  const env = registeredJson({
    routeId, routeKind, scope: 'EXECUTION_ENVIRONMENT', prefix, level: null,
    kind: 'EXECUTION_ENVIRONMENT',
    schema: 'lafea-bucket-01-controlled-replay-execution-environment/v1',
    parents: [],
    extra: {
      packageLockHash: hash('package-lock'),
      allowlistedEnvironmentHash: hash('environment'),
      preRunTrackedClean: true,
      postRunTrackedClean: true,
    },
  });
  artifacts.push(
    response, kirsch, stress, topology, convergence, exact,
    stdout, stderr, packageLock, env,
  );
  return createLafeaBucket01ControlledReplayResult({
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    codeRevisionHash: hash('code-revision'),
    candidatePackageHash,
    candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash: routeKind === 'CANDIDATE'
      ? independentCheckerEvidenceHash : null,
    frozenInputHashes,
    characteristicH: characteristicH(),
    executionEnvironment: {
      packageLockHash: hash('package-lock'),
      nodeVersion: 'v24.0.0',
      npmVersion: '11.0.0',
      platform: 'linux',
      architecture: 'x64',
      allowlistedEnvironmentHash: hash('environment'),
      preRunTrackedStatusHash: hash('clean'),
      postRunTrackedStatusHash: hash('clean'),
      isolatedOutputNamespace: prefix,
    },
    artifacts,
  });
}

function registeredJson({
  routeId, routeKind, scope, prefix, level, kind, schema, parents, extra = {},
}) {
  const relativePath = `${prefix}/${kind.toLowerCase()}-${level ?? 'global'}.json`;
  writeHashed(relativePath, {
    schema,
    producerRevision: 'B01-REGISTERED-FIXTURE.1',
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    levelOrdinal: level,
    status: 'PASS',
    reasons: [],
    ...extra,
  });
  return receipt(source(
    `${routeId}:${kind}:${level === null ? 'GLOBAL' : `L${level}`}`,
    kind,
    scope,
    level,
    parents.map((row) => row.semanticHash),
    relativePath,
    routeId,
  ));
}

function source(
  artifactId, artifactKind, artifactScope, levelOrdinal,
  parentArtifactHashes, relativePath, routeId = 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY',
) {
  return {
    artifactId,
    artifactKind,
    artifactScope,
    routeId,
    levelOrdinal,
    exactHeadSha,
    designHash,
    parentArtifactHashes,
    relativePath,
  };
}
function receipt(value) {
  return createRegisteredReplayArtifactReceipt(root, value);
}
function write(relativePath, value) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}
function writeHashed(relativePath, base, forcedHash = null) {
  const payload = { ...base, semanticHash: forcedHash ?? canonicalLafeaSha256(base) };
  write(relativePath, payload);
  return payload;
}
function hash(label) {
  return canonicalLafeaSha256({ schema: 'fixture-hash/v1', label });
}
function characteristicH() {
  const global = [8, 4, 2, 1];
  return {
    schema: 'lafea-bucket-01-characteristic-h-evidence/v1',
    globalDefinition: 'FIXTURE',
    globalLevels: global.map((value, index) => ({
      ordinal: index + 1,
      globalCharacteristicH: value,
      refinementRatioToPrevious: index === 0 ? null : global[index - 1] / value,
    })),
    localDefinition: 'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS',
    locations: Array.from({ length: 7 }, (_, index) => ({
      locationId: `LOCATION-${index + 1}`,
      radius: 27 + index,
      levelValues: [4, 2, 1, 0.5],
      refinementRatiosToPrevious: [2, 2, 2],
    })),
    constantGlobalRatioAssumed: false,
    unequalRatioMethod: 'ACTUAL_H_VALUES_OR_BLOCK',
    topologyCompatibilityVerified: true,
  };
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function rehashResult(value) {
  delete value.semanticHash;
  value.semanticHash = canonicalLafeaSha256(value);
  return value;
}
function rebuild(value) {
  return createLafeaBucket01ControlledReplayResult({
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
    routeId: value.routeId,
    routeKind: value.routeKind,
    exactHeadSha: value.exactHeadSha,
    designHash: value.designHash,
    codeRevisionHash: value.codeRevisionHash,
    candidatePackageHash: value.candidatePackageHash,
    candidateIntakeEvidenceHash: value.candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash: value.independentCheckerEvidenceHash,
    frozenInputHashes: value.frozenInputHashes,
    characteristicH: value.characteristicH,
    executionEnvironment: value.executionEnvironment,
    artifacts: value.artifacts,
  });
}
function hasCode(code) {
  return (error) => error?.code === code;
}

export {
  candidate as registeredCandidateReplayFixture,
  reference as registeredReferenceReplayFixture,
  designHash as registeredReplayDesignHash,
  exactHeadSha as registeredReplayExactHeadSha,
};
