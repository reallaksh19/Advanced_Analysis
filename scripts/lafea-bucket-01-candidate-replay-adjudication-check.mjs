#!/usr/bin/env node

import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
} from '../src/workspace/lafea-bucket-01-controlled-candidate-replay-proposal.js';
import {
  LAFEA_BUCKET_01_CHARACTERISTIC_H_SCHEMA,
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
  createLafeaBucket01ControlledReplayResult,
  validateLafeaBucket01ControlledReplayResult,
} from '../src/workspace/lafea-bucket-01-controlled-replay-result.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  evaluateLafeaBucket01CandidateReplayAdjudication,
  validateLafeaBucket01CandidateReplayAdjudicationEvidence,
} from '../src/workspace/lafea-bucket-01-candidate-replay-adjudication.js';

const exactHeadSha = 'a'.repeat(40);
const designHash = syntheticHash('design-v3');
const codeRevisionHash = syntheticHash('code-revision');
const candidatePackageHash = syntheticHash('candidate-package');
const candidateIntakeEvidenceHash = syntheticHash('candidate-intake');
const independentCheckerEvidenceHash = syntheticHash('independent-checker');
const proposal = proposalEvidence();
const reference = replay('REFERENCE');
const candidate = replay('CANDIDATE');
const input = {
  schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  exactHeadSha,
  designHash,
  proposalEvidence: proposal,
  referenceReplay: reference,
  candidateReplay: candidate,
};

assert.equal(validateLafeaBucket01ControlledReplayResult(reference).ok, true);
assert.equal(validateLafeaBucket01ControlledReplayResult(candidate).ok, true);
assert.deepEqual(candidate.checks, allPassChecks());
assert.equal(candidate.authority.statusesDerivedFromArtifacts, true);
assert.equal(candidate.authority.independentCheckerExecution, true);
const eligible = evaluateLafeaBucket01CandidateReplayAdjudication(input);
assert.equal(eligible.disposition, 'ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW');
assert.equal(eligible.statusesDerivedFromArtifacts, true);
assert.equal(eligible.authority.artifactCustodyCompared, true);
assert.equal(eligible.authority.independentCheckerVerified, true);
assert.equal(eligible.authority.candidateEligibleForProductionSwitchReview, true);
assert.equal(eligible.authority.productionSwitchAuthorized, false);
assert.equal(eligible.authority.productionMeshAuthority, false);
assert.equal(eligible.authority.qualificationAuthority, false);
assert.equal(eligible.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01CandidateReplayAdjudicationEvidence(eligible).ok,
  true,
);

const stressBlocked = replay('CANDIDATE', {
  blockedKind: 'PRODUCTION_STRESS_EVIDENCE',
});
assert.equal(stressBlocked.checks.productionLugStress, 'BLOCKED');
const diagnostic = evaluateLafeaBucket01CandidateReplayAdjudication({
  ...input,
  candidateReplay: stressBlocked,
});
assert.equal(diagnostic.disposition, 'RETAIN_CANDIDATE_FOR_DIAGNOSTIC_USE_ONLY');
assert.equal(diagnostic.authority.candidateEligibleForProductionSwitchReview, false);

const qualityBlocked = replay('CANDIDATE', {
  blockedKind: 'ANALYSIS_MESH_EVIDENCE',
  blockedLevel: 1,
});
assert.equal(qualityBlocked.checks.meshQuality, 'BLOCKED');
const rejected = evaluateLafeaBucket01CandidateReplayAdjudication({
  ...input,
  candidateReplay: qualityBlocked,
});
assert.equal(rejected.disposition, 'REJECT_CANDIDATE_MESH_FAMILY');

const referenceBlocked = replay('REFERENCE', {
  blockedKind: 'REPOSITORY_GATE_REPORT',
});
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    referenceReplay: referenceBlocked,
  }),
  hasCode('LAFEA_B01_REFERENCE_REPLAY_NOT_PASS'),
);

const mismatchedFrozen = replay('CANDIDATE', {
  frozenOverrides: { loads: syntheticHash('changed-loads') },
});
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    candidateReplay: mismatchedFrozen,
  }),
  hasCode('LAFEA_B01_REPLAY_FROZEN_INPUT_HASH_MISMATCH'),
);

const mismatchedCode = replay('CANDIDATE', {
  codeRevisionHashOverride: syntheticHash('different-code'),
});
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    candidateReplay: mismatchedCode,
  }),
  hasCode('LAFEA_B01_REPLAY_CODE_REVISION_MISMATCH'),
);

const sharedNamespace = replay('CANDIDATE', {
  outputNamespace: reference.executionEnvironment.isolatedOutputNamespace,
});
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    candidateReplay: sharedNamespace,
  }),
  hasCode('LAFEA_B01_REPLAY_OUTPUT_NAMESPACE_NOT_ISOLATED'),
);

const mismatchedEnvironment = replay('CANDIDATE', {
  environmentOverrides: { nodeVersion: 'v99.0.0' },
});
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    candidateReplay: mismatchedEnvironment,
  }),
  hasCode('LAFEA_B01_REPLAY_EXECUTION_ENVIRONMENT_MISMATCH'),
);

const manuallyClaimed = clone(stressBlocked);
manuallyClaimed.checks.productionLugStress = 'PASS';
manuallyClaimed.status = 'PASS';
manuallyClaimed.reasons = [];
rehash(manuallyClaimed);
assert.equal(validateLafeaBucket01ControlledReplayResult(manuallyClaimed).ok, false);
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    candidateReplay: manuallyClaimed,
  }),
  hasCode('LAFEA_B01_REPLAY_RESULT_INVALID'),
);

assert.throws(
  () => replay('CANDIDATE', { detachMappingLevel: 2 }),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_ANCESTRY_INVALID'),
);
assert.throws(
  () => replay('CANDIDATE', { omitIndependentChecker: true }),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_COUNT_INVALID'),
);
assert.throws(
  () => replay('CANDIDATE', { invalidLocalRatio: true }),
  hasCode('LAFEA_B01_REPLAY_LOCAL_H_RATIO_INVALID'),
);

console.log('PASS LAFEA Bucket-01 artifact-derived candidate replay adjudication checks');

function proposalEvidence() {
  const base = {
    schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
    exactHeadSha,
    designId: 'B01-PROBE-STABLE-POLAR-V3',
    designHash,
    candidateIntakeEvidenceHash,
    candidatePackageHash,
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
    requiredFrozenInputHashes: Object.keys(frozenInputHashes()),
    requiredArtifactCounts: {
      common: {
        ANALYSIS_MESH_EVIDENCE: 4,
        STAGE_DOCUMENT: 4,
        LOAD_MAPPING: 4,
        BOUNDARY_MAPPING: 4,
        MAPPING_PACKAGE: 4,
        EXECUTION_RECEIPT: 4,
        RESPONSE_EVIDENCE: 1,
        KIRSCH_EVIDENCE: 1,
        PRODUCTION_STRESS_EVIDENCE: 1,
        TOPOLOGY_AUDIT_EVIDENCE: 1,
        CONVERGENCE_EVIDENCE: 1,
        REPOSITORY_GATE_REPORT: 1,
        STDOUT_LOG: 1,
        STDERR_LOG: 1,
        PACKAGE_LOCK: 1,
        EXECUTION_ENVIRONMENT: 1,
      },
      reference: { REFERENCE_MESH_LADDER: 1 },
      candidate: {
        CANDIDATE_PACKAGE: 1,
        CANDIDATE_INTAKE: 1,
        INDEPENDENT_CHECKER_EVIDENCE: 1,
      },
    },
    requiredCharacteristicH: {
      fourGlobalLevelsRequired: true,
      sevenFrozenLocationsRequired: true,
      constantGlobalRatioAssumed: false,
      unequalRatioMethod: 'ACTUAL_H_VALUES_OR_BLOCK',
      localDefinition:
        'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS',
      topologyCompatibilityRequired: true,
    },
    executionIsolationPolicy: {
      referenceRunsFirst: true,
      separateOutputNamespacesRequired: true,
      mutableArtifactSharingForbidden: true,
      preAndPostTrackedStatusRequired: true,
      packageLockHashRequired: true,
      stdoutAndStderrHashesRequired: true,
      codeRevisionParityRequired: true,
    },
    status: 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_READY',
    reasons: [],
    authority: {
      candidateIntakeVerified: true,
      candidateRecomputationVerified: true,
      independentCheckerRequiredBeforeAdjudication: true,
      artifactDerivedStatusesRequired: true,
      rollbackRouteVerified: true,
      referenceProductionRouteRetained: true,
      candidateReplayProposalReady: true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function replay(routeKind, options = {}) {
  const routeId = routeKind === 'CANDIDATE'
    ? 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY'
    : 'UNIFORM_T6_REFERENCE';
  const artifacts = buildArtifacts(routeKind, routeId, options);
  const frozen = {
    ...frozenInputHashes(),
    ...(options.frozenOverrides ?? {}),
  };
  const environment = {
    ...executionEnvironment(routeKind),
    ...(options.environmentOverrides ?? {}),
  };
  if (options.outputNamespace) {
    environment.isolatedOutputNamespace = options.outputNamespace;
  }
  return createLafeaBucket01ControlledReplayResult({
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    codeRevisionHash:
      options.codeRevisionHashOverride ?? codeRevisionHash,
    candidatePackageHash,
    candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash: routeKind === 'CANDIDATE'
      ? independentCheckerEvidenceHash : null,
    frozenInputHashes: frozen,
    characteristicH: characteristicH(routeKind, options),
    executionEnvironment: environment,
    artifacts,
  });
}

function buildArtifacts(routeKind, routeId, options) {
  const scope = routeKind === 'CANDIDATE'
    ? 'CANDIDATE_MESH_BOUND' : 'REFERENCE_MESH_BOUND';
  const rows = [];
  const root = routeKind === 'CANDIDATE'
    ? artifact({
      routeId, kind: 'CANDIDATE_PACKAGE', scope,
      semanticHash: candidatePackageHash,
      check: 'meshQuality', parents: [], options,
    })
    : artifact({
      routeId, kind: 'REFERENCE_MESH_LADDER', scope,
      semanticHash: syntheticHash(`${routeId}:root`),
      check: 'meshQuality', parents: [], options,
    });
  rows.push(root);
  if (routeKind === 'CANDIDATE') {
    const intake = artifact({
      routeId, kind: 'CANDIDATE_INTAKE', scope,
      semanticHash: candidateIntakeEvidenceHash,
      check: 'meshQuality', parents: [root], options,
    });
    rows.push(intake);
    if (!options.omitIndependentChecker) {
      rows.push(artifact({
        routeId, kind: 'INDEPENDENT_CHECKER_EVIDENCE', scope,
        semanticHash: independentCheckerEvidenceHash,
        check: 'probeTopologyAudit', parents: [root, intake], options,
      }));
    }
  }
  const meshes = [];
  const executions = [];
  for (let level = 1; level <= 4; level += 1) {
    const mesh = artifact({
      routeId, kind: 'ANALYSIS_MESH_EVIDENCE', scope, level,
      check: 'meshQuality', parents: [root], options,
    });
    const document = artifact({
      routeId, kind: 'STAGE_DOCUMENT', scope, level,
      check: 'repositoryGate', parents: [mesh], options,
    });
    const load = artifact({
      routeId, kind: 'LOAD_MAPPING', scope, level,
      check: 'solverAndEquilibrium', parents: [mesh, document], options,
    });
    const boundary = artifact({
      routeId, kind: 'BOUNDARY_MAPPING', scope, level,
      check: 'solverAndEquilibrium', parents: [mesh, document], options,
    });
    const mappingParents = options.detachMappingLevel === level
      ? [mesh, load, boundary]
      : [mesh, document, load, boundary];
    const mapping = artifact({
      routeId, kind: 'MAPPING_PACKAGE', scope, level,
      check: 'solverAndEquilibrium', parents: mappingParents, options,
    });
    const execution = artifact({
      routeId, kind: 'EXECUTION_RECEIPT', scope, level,
      check: 'solverAndEquilibrium', parents: [mesh, document, mapping], options,
    });
    rows.push(mesh, document, load, boundary, mapping, execution);
    meshes.push(mesh);
    executions.push(execution);
  }
  rows.push(
    artifact({
      routeId, kind: 'RESPONSE_EVIDENCE', scope,
      check: 'globalResponseConvergence', parents: executions, options,
    }),
    artifact({
      routeId, kind: 'KIRSCH_EVIDENCE', scope: 'REPOSITORY_REGRESSION',
      check: 'kirschFixedProbes', parents: [], options,
    }),
    artifact({
      routeId, kind: 'PRODUCTION_STRESS_EVIDENCE', scope,
      check: 'productionLugStress', parents: executions, options,
    }),
    artifact({
      routeId, kind: 'TOPOLOGY_AUDIT_EVIDENCE', scope,
      check: 'probeTopologyAudit', parents: meshes, options,
    }),
    artifact({
      routeId, kind: 'CONVERGENCE_EVIDENCE', scope,
      check: 'productionLugStress', parents: executions, options,
    }),
    artifact({
      routeId, kind: 'REPOSITORY_GATE_REPORT', scope: 'REPOSITORY_REGRESSION',
      check: 'repositoryGate', parents: [], options,
    }),
    artifact({
      routeId, kind: 'STDOUT_LOG', scope: 'EXECUTION_ENVIRONMENT',
      check: 'repositoryGate', parents: [], options,
    }),
    artifact({
      routeId, kind: 'STDERR_LOG', scope: 'EXECUTION_ENVIRONMENT',
      check: 'repositoryGate', parents: [], options,
    }),
    artifact({
      routeId, kind: 'PACKAGE_LOCK', scope: 'EXECUTION_ENVIRONMENT',
      check: 'repositoryGate', parents: [], options,
    }),
    artifact({
      routeId, kind: 'EXECUTION_ENVIRONMENT', scope: 'EXECUTION_ENVIRONMENT',
      check: 'repositoryGate', parents: [], options,
    }),
  );
  return rows;
}

function artifact({
  routeId, kind, scope, level = null, check, parents, options,
  semanticHash = null,
}) {
  const blocked = options.blockedKind === kind
    && (options.blockedLevel === undefined || options.blockedLevel === level);
  const artifactId = `${routeId}:${kind}:${level ?? 'GLOBAL'}`;
  return {
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
    artifactId,
    artifactKind: kind,
    artifactScope: scope,
    artifactSchema: `synthetic-${kind.toLowerCase()}/v1`,
    producerRevision: 'SYNTHETIC.1',
    routeId,
    levelOrdinal: level,
    exactHeadSha,
    designHash,
    parentArtifactHashes: parents.map((row) => row.semanticHash),
    semanticHash: semanticHash ?? syntheticHash(`${artifactId}:semantic`),
    rawFileHash: syntheticHash(`${artifactId}:raw`),
    relativePath: `reports/synthetic/${routeId}/${kind}-${level ?? 'global'}.json`,
    validatorId: `VALIDATOR:${kind}`,
    validatorRevision: '1',
    validationStatus: blocked ? 'BLOCKED' : 'PASS',
    validationReasons: blocked ? [`SYNTHETIC_${kind}_BLOCK`] : [],
    derivedCheck: check,
  };
}

function characteristicH(routeKind, options) {
  const globalValues = routeKind === 'REFERENCE'
    ? [8, 4, 2, 1]
    : [10, 6, 3, 1.5];
  const localValues = routeKind === 'REFERENCE'
    ? [4, 2, 1, 0.5]
    : [3, 1.5, 0.75, 0.375];
  const locations = Array.from({ length: 7 }, (_, index) => ({
    locationId: `LOCATION-${index + 1}`,
    radius: 27 + index,
    levelValues: [...localValues],
    refinementRatiosToPrevious: options.invalidLocalRatio && index === 0
      ? [2, 3, 2]
      : ratios(localValues),
  }));
  return {
    schema: LAFEA_BUCKET_01_CHARACTERISTIC_H_SCHEMA,
    globalDefinition: routeKind === 'REFERENCE'
      ? 'UNIFORM_GOVERNED_MESH_SIZE'
      : 'GLOBAL_AREA_EQUIVALENT_CHARACTERISTIC_SIZE',
    globalLevels: globalValues.map((value, index) => ({
      ordinal: index + 1,
      globalCharacteristicH: value,
      refinementRatioToPrevious: index === 0
        ? null : globalValues[index - 1] / value,
    })),
    localDefinition: 'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS',
    locations,
    constantGlobalRatioAssumed: false,
    unequalRatioMethod: 'ACTUAL_H_VALUES_OR_BLOCK',
    topologyCompatibilityVerified: true,
  };
}

function executionEnvironment(routeKind) {
  return {
    packageLockHash: syntheticHash('package-lock'),
    nodeVersion: 'v24.0.0',
    npmVersion: '11.0.0',
    platform: 'linux',
    architecture: 'x64',
    allowlistedEnvironmentHash: syntheticHash('environment'),
    preRunTrackedStatusHash: syntheticHash('clean-before'),
    postRunTrackedStatusHash: syntheticHash('clean-after'),
    isolatedOutputNamespace: routeKind === 'REFERENCE'
      ? 'reports/replay/reference/R1'
      : 'reports/replay/candidate/C1',
  };
}

function frozenInputHashes() {
  return Object.fromEntries([
    'coordinates', 'stressTolerances', 'loads', 'supports', 'material',
    'solverPolicy', 'codeBasisBoundary', 'physicalProblemDefinition',
    'geometry', 'thickness', 'formulationProfile', 'probeSpecification',
    'expectedValueRegistry', 'loadMappingPolicy', 'boundaryMappingPolicy',
    'recoveryProfile', 'convergenceProfile', 'qualificationProfile',
  ].map((key) => [key, syntheticHash(`frozen:${key}`)]));
}

function allPassChecks() {
  return {
    meshQuality: 'PASS',
    solverAndEquilibrium: 'PASS',
    globalResponseConvergence: 'PASS',
    kirschFixedProbes: 'PASS',
    productionLugStress: 'PASS',
    probeTopologyAudit: 'PASS',
    repositoryGate: 'PASS',
  };
}

function ratios(values) {
  return values.slice(1).map((value, index) => values[index] / value);
}
function syntheticHash(label) {
  return canonicalLafeaSha256({ schema: 'synthetic/v1', label });
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function rehash(value) {
  delete value.semanticHash;
  value.semanticHash = canonicalLafeaSha256(value);
  return value;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function hasCode(code) {
  return (error) => error?.code === code;
}
