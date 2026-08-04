#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA,
  deriveLafeaBucket01ControlledReplayFromArtifacts,
  validateLafeaBucket01ReplayArtifactCustody,
} from '../src/workspace/lafea-bucket-01-replay-artifact-custody.js';
import {
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
} from '../src/workspace/lafea-bucket-01-independent-candidate-verification.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const head = 'a'.repeat(40);
const candidateHead = 'b'.repeat(40);
const designHash = canonicalLafeaSha256({ design: 'V2' });
const input = replayInput();
assert.equal('checks' in input, false);
const derived = deriveLafeaBucket01ControlledReplayFromArtifacts(input);
assert.equal(derived.replayResult.status, 'PASS');
assert.deepEqual(derived.replayResult.checks, {
  meshQuality: 'PASS',
  solverAndEquilibrium: 'PASS',
  globalResponseConvergence: 'PASS',
  kirschFixedProbes: 'PASS',
  productionLugStress: 'PASS',
  probeTopologyAudit: 'PASS',
  repositoryGate: 'PASS',
});
assert.equal(derived.custodyEvidence.authority.executedRecomputation, true);
assert.equal(derived.custodyEvidence.authority.independentCheckerExecution, true);
assert.equal(derived.custodyEvidence.authority.replayStatusDerivedFromValidatedArtifacts, true);
assert.equal(derived.custodyEvidence.authority.suppliedCheckMapTrusted, false);
assert.equal(derived.custodyEvidence.authority.productionSwitchAuthorized, false);
assert.equal(derived.custodyEvidence.authority.qualificationAuthority, false);
assert.equal(derived.custodyEvidence.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01ReplayArtifactCustody(
    derived.artifactManifest,
    derived.replayResult,
    derived.custodyEvidence,
  ).ok,
  true,
);

const meshBlocked = structuredClone(input);
const meshArtifact = meshBlocked.artifacts.find((row) => row.role === 'MESH_QUALITY_EVIDENCE');
meshArtifact.payload.status = 'BLOCKED';
rehashArtifact(meshArtifact);
const blocked = deriveLafeaBucket01ControlledReplayFromArtifacts(meshBlocked);
assert.equal(blocked.replayResult.status, 'BLOCKED');
assert.equal(blocked.replayResult.checks.meshQuality, 'BLOCKED');
assert.ok(blocked.replayResult.reasons.includes('ARTIFACT_BLOCKED:meshQuality'));

const repositoryMissingClean = structuredClone(input);
const repositoryArtifact = repositoryMissingClean.artifacts.find(
  (row) => row.role === 'BUILD_IMPORT_PATCH_AND_WORKTREE_CHECKS',
);
repositoryArtifact.payload.checks = [];
rehashArtifact(repositoryArtifact);
const repositoryBlocked = deriveLafeaBucket01ControlledReplayFromArtifacts(
  repositoryMissingClean,
);
assert.equal(repositoryBlocked.replayResult.checks.repositoryGate, 'BLOCKED');

const rawTamper = structuredClone(input);
rawTamper.artifacts[1].computedRawFileHash = `sha256:${'0'.repeat(64)}`;
assert.throws(
  () => deriveLafeaBucket01ControlledReplayFromArtifacts(rawTamper),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_RAW_HASH_MISMATCH'),
);

const ancestryTamper = structuredClone(input);
ancestryTamper.mergeBaseSha = head;
assert.throws(
  () => deriveLafeaBucket01ControlledReplayFromArtifacts(ancestryTamper),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_ANCESTRY_INVALID'),
);

const duplicateRole = structuredClone(input);
duplicateRole.artifacts[1].role = duplicateRole.artifacts[0].role;
rehashArtifact(duplicateRole.artifacts[1]);
assert.throws(
  () => deriveLafeaBucket01ControlledReplayFromArtifacts(duplicateRole),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_ROLE_SET_INVALID'),
);

const frozenTamper = structuredClone(input);
const frozenArtifact = frozenTamper.artifacts.find((row) => row.role === 'FROZEN_INPUT_DEFINITION');
frozenArtifact.payload.inputs.loads.id = 'altered-loads';
rehashArtifact(frozenArtifact);
assert.throws(
  () => deriveLafeaBucket01ControlledReplayFromArtifacts(frozenTamper),
  hasCode('LAFEA_B01_REPLAY_FROZEN_INPUT_HASH_TAMPERED'),
);

const detached = structuredClone(input);
const detachedSolver = detached.artifacts.find((row) => row.role === 'SOLVER_AND_EQUILIBRIUM_EVIDENCE');
detachedSolver.parentArtifactHashes = [];
rehashArtifact(detachedSolver);
assert.throws(
  () => deriveLafeaBucket01ControlledReplayFromArtifacts(detached),
  hasCode('LAFEA_B01_REPLAY_STAGE_MAPPING_ANCESTRY_DETACHED'),
);

const suppliedChecks = structuredClone(input);
suppliedChecks.checks = { meshQuality: 'PASS' };
assert.throws(
  () => deriveLafeaBucket01ControlledReplayFromArtifacts(suppliedChecks),
  hasCode('LAFEA_B01_REPLAY_ARTIFACT_EXACT_KEYS_INVALID'),
);

console.log(JSON.stringify({
  schema: 'lafea-bucket-01-replay-artifact-custody-contract-check/v1',
  status: 'PASS',
  allPassDisposition: derived.replayResult.status,
  artifactBlockedDisposition: blocked.replayResult.status,
  derivedChecks: derived.replayResult.checks,
  negativeCases: {
    rawHashTamperBlocked: true,
    ancestryTamperBlocked: true,
    duplicateRoleBlocked: true,
    frozenInputTamperBlocked: true,
    detachedStageMappingAncestryBlocked: true,
    suppliedPassMapRejected: true,
    missingTrackedWorktreeProofBlocked: true,
  },
  authority: derived.custodyEvidence.authority,
}, null, 2));

function replayInput() {
  const frozenPayload = frozenInputDefinition();
  const ancestryPayload = stageMappingAncestry();
  const ancestryHash = canonicalLafeaSha256(ancestryPayload);
  const artifacts = [
    artifact('frozen', 'FROZEN_INPUT_DEFINITION', frozenPayload),
    artifact(
      'stage-mapping',
      'STAGE_DOCUMENT_AND_MAPPING_ANCESTRY',
      ancestryPayload,
    ),
    artifact(
      'mesh',
      'MESH_QUALITY_EVIDENCE',
      independentEvidence(),
      [ancestryHash],
    ),
    artifact(
      'solver',
      'SOLVER_AND_EQUILIBRIUM_EVIDENCE',
      solverEvidence(ancestryPayload.projectionHash),
      [ancestryHash],
      'EXECUTION_ENVIRONMENT',
    ),
    artifact('global', 'GLOBAL_RESPONSE_CONVERGENCE', {
      schema: 'lafea-bucket-01-production-response-evidence/v3', status: 'PASS',
    }, [ancestryHash]),
    artifact('kirsch', 'KIRSCH_FIXED_PROBE_EVIDENCE', {
      schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v2', status: 'PASS',
    }, [ancestryHash]),
    artifact('stress', 'PRODUCTION_LUG_FIXED_LOCATION_AND_PATH_EVIDENCE', {
      schema: 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2', status: 'PASS',
    }, [ancestryHash]),
    artifact('topology', 'PROBE_TOPOLOGY_AUDIT_EVIDENCE', independentEvidence(), [ancestryHash]),
    artifact('repository', 'BUILD_IMPORT_PATCH_AND_WORKTREE_CHECKS', {
      schema: 'lafea-bucket-01-exact-head-report/v13',
      status: 'EXACT_HEAD_REPAIR_EVIDENCE_PASS',
      blockingCheckIds: [],
      checks: [{ id: 'TRACKED_WORKTREE_CLEAN', status: 'PASS' }],
    }, [], 'REPOSITORY_REGRESSION'),
  ];
  return {
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA,
    routeId: 'PROBE_STABLE_T6_CANDIDATE_REPLAY',
    exactHeadSha: head,
    designId: 'B01-PROBE-STABLE-POLAR-V3',
    designHash,
    candidateArtifactHeadSha: candidateHead,
    mergeBaseSha: candidateHead,
    candidateArtifactHeadIsAncestor: true,
    artifacts,
  };
}

function frozenInputDefinition() {
  const inputs = {
    coordinates: { id: 'coordinates' },
    stressTolerances: { id: 'stressTolerances' },
    loads: { id: 'loads' },
    supports: { id: 'supports' },
    material: { id: 'material' },
    solverPolicy: { id: 'solverPolicy' },
    codeBasisBoundary: { id: 'codeBasisBoundary' },
  };
  const componentHashes = Object.fromEntries(Object.entries(inputs).map(([role, value]) => [
    role,
    canonicalLafeaSha256({
      schema: 'lafea-bucket-01-frozen-replay-input-component/v1',
      role,
      value,
    }),
  ]));
  return {
    schema: 'lafea-bucket-01-frozen-replay-input-definition/v1',
    exactHeadSha: head,
    designHash,
    inputs,
    componentHashes,
  };
}
function stageMappingAncestry() {
  return {
    schema: 'lafea-bucket-01-stage-document-mapping-ancestry/v1',
    exactHeadSha: head,
    designHash,
    stageDocumentHash: canonicalLafeaSha256({ stageDocument: 1 }),
    mappingPackageHash: canonicalLafeaSha256({ mappingPackage: 1 }),
    projectionHash: canonicalLafeaSha256({ projection: 1 }),
    authority: {
      productionSwitchAuthorized: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}
function independentEvidence() {
  return {
    schema: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
    status: 'PASS',
    authority: {
      executedRecomputation: true,
      independentCheckerExecution: true,
      productionSwitchAuthorized: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}
function solverEvidence(projectionHash) {
  return {
    schema: 'lafea-lug-pinhole-physical-problem-execution/v1',
    projectionHash,
    status: 'ACCEPTED',
    accepted: true,
    controllerResult: {
      status: 'ACCEPTED',
      accepted: true,
      levelResults: [{
        levelEvidence: { status: 'ACCEPTED' },
        execution: {
          result: {
            qualification: { state: 'ACCEPTED' },
            loadCaseResults: [{
              equilibrium: { accepted: true },
              energyQualification: { accepted: true },
            }],
          },
        },
      }],
    },
  };
}
function artifact(
  artifactId,
  role,
  payload,
  parentArtifactHashes = [],
  artifactScope = 'CANDIDATE_MESH_BOUND',
) {
  const hash = rawHash(payload);
  return {
    artifactId, artifactScope, role,
    relativePath: `reports/${artifactId}.json`,
    routeId: 'PROBE_STABLE_T6_CANDIDATE_REPLAY',
    levelOrdinal: null,
    exactHeadSha: head,
    designHash,
    parentArtifactHashes,
    declaredRawFileHash: hash,
    computedRawFileHash: hash,
    payload,
  };
}

function rehashArtifact(value) {
  const hash = rawHash(value.payload);
  value.declaredRawFileHash = hash;
  value.computedRawFileHash = hash;
  return value;
}
function rawHash(payload) {
  return `sha256:${createHash('sha256').update(`${JSON.stringify(payload, null, 2)}\n`).digest('hex')}`;
}
function hasCode(code) { return (error) => error?.code === code; }
