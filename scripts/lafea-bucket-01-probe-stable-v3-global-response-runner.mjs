#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_PROJECTION_INPUT_SCHEMA,
  createLafeaBucket01CandidateProjection,
  executeLafeaBucket01CandidateProjection,
} from '../src/workspace/lafea-bucket-01-candidate-projection.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_RESPONSE_INPUT_SCHEMA,
  LAFEA_BUCKET_01_CANDIDATE_GLOBAL_H_DEFINITION,
  evaluateLafeaBucket01CandidateResponse,
} from '../src/workspace/lafea-bucket-01-candidate-response.js';
import {
  buildLafeaBucket01CandidateV3Bundle,
} from '../src/workspace/lafea-bucket-01-candidate-v3-bundle.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_PATH = path.join(
  ROOT,
  'validation/bucket-01/13-probe-stable-polar-mesh-design.json',
);
const PROBE_SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json',
);
const RESPONSE_SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/06-production-response-convergence-spec.json',
);
const PROJECTION_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_PROJECTION_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-projection.json',
);
const EXECUTION_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_EXECUTION_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-execution.json',
);
const RESPONSE_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_RESPONSE_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-response.json',
);
const RUNNER_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_RUNNER_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-runner.json',
);
const exactHeadSha = gitHead();
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || exactHeadSha;
const design = readJson(DESIGN_PATH);
const probeSpec = readJson(PROBE_SPEC_PATH);
const responseSpec = readJson(RESPONSE_SPEC_PATH);
const state = {
  projectionHash: null,
  executionHash: null,
  responseHash: null,
  reasons: [],
};
let runner;
try {
  if (expectedHeadSha !== exactHeadSha) {
    throw new Error(`EXACT_HEAD_MISMATCH:${expectedHeadSha}:${exactHeadSha}`);
  }
  runner = execute();
} catch (error) {
  state.reasons.push(error?.code ?? error?.message ?? 'UNEXPECTED_CANDIDATE_RUNNER_FAILURE');
  runner = blockedRunner();
}
writeJson(RUNNER_PATH, runner);
console.log(JSON.stringify(runner));
if (runner.status !== 'PASS') process.exit(1);

function execute() {
  const bundle = buildLafeaBucket01CandidateV3Bundle({
    exactHeadSha,
    design,
    probeSpec,
  });
  const fixture = createNbT6cFixture(ROOT, exactHeadSha);
  const source = structuredClone(fixture.projectionInput);
  source.geometry = structuredClone(responseSpec.geometry);
  source.physicalProblem.modelIdentity =
    'B01-C2D-LUG-PINHOLE-PROBE-STABLE-V3-CANDIDATE';
  source.physicalProblem.sourceAncestry.sourceModelIdentity =
    'B01-C2D-LUG-PINHOLE-PROBE-STABLE-V3-CANDIDATE';
  source.physicalProblem.sourceAncestry.adapterIdentity =
    'B01-PROBE-STABLE-V3-CANDIDATE-RUNNER';
  source.physicalProblem.material.elasticModulus =
    responseSpec.material.elasticModulus;
  source.physicalProblem.material.poissonRatio =
    responseSpec.material.poissonRatio;
  source.physicalProblem.thickness = responseSpec.material.thickness;
  source.physicalProblem.loadCase.loadCaseId = responseSpec.load.loadCaseId;
  source.physicalProblem.loadCase.resultant = [
    responseSpec.load.resultant.x,
    responseSpec.load.resultant.y,
  ];
  source.physicalProblem.resultRequests = {
    loadCaseIds: [responseSpec.load.loadCaseId],
  };
  source.physicalProblem.kinematics = {
    mode: 'BOUNDARY_ZERO',
    ux: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
    uy: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
  };
  source.physicalProblem.limitations = [
    'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
    'BUCKET_01_PROBE_STABLE_V3_CANDIDATE_EXECUTION',
  ];
  source.featureProjection.loadFeature = {
    featureId: 'LOAD-EDGE',
    role: responseSpec.load.featureRole,
    baseStartEdge: responseSpec.load.baseStartEdge,
    baseEdgeCount: responseSpec.load.baseEdgeCount,
  };
  source.featureProjection.boundaryFeature = {
    featureId: 'ROOT-REGION',
    role: responseSpec.restraint.featureRole,
    baseStartEdge: responseSpec.restraint.baseStartEdge,
    baseEdgeCount: responseSpec.restraint.baseEdgeCount,
  };
  const projection = createLafeaBucket01CandidateProjection({
    schema: LAFEA_BUCKET_01_CANDIDATE_PROJECTION_INPUT_SCHEMA,
    exactHeadSha,
    designHash: bundle.designHash,
    candidateIntakeEvidence: bundle.intakeEvidence,
    candidatePackages: bundle.packages,
    meshProfiles: bundle.packages.map(meshProfile),
    releaseRecord: source.releaseRecord,
    compatibilityReceipt: source.compatibilityReceipt,
    canonicalModelHash: source.canonicalModelHash,
    geometry: source.geometry,
    physicalProblem: source.physicalProblem,
    featureProjection: source.featureProjection,
    applicationEvidence: source.applicationEvidence,
    producerRef: 'B01/C2D-LUG-PINHOLE/PROBE-STABLE-V3-CANDIDATE',
    sourceAuthorityOriginRef:
      'B01/C2D-LUG-PINHOLE/PROBE-STABLE-V3-CANDIDATE',
  });
  state.projectionHash = projection.semanticHash;
  writeJson(PROJECTION_PATH, projection);
  const benchmarkQualification = fixture.benchmark(
    projection.baseMappingPackage.semanticHash,
  );
  const execution = executeLafeaBucket01CandidateProjection({
    projection,
    benchmarkQualification,
    requestId: 'B01-C2D-LUG-PINHOLE-PROBE-STABLE-V3-CANDIDATE',
    recoveryProfileHash: fixture.hash(
      'B01-PROBE-STABLE-V3-CANDIDATE-INTEGRATION-POINT-RECOVERY',
    ),
    convergenceRequest: {
      quantityId: 'PLANE_STRESS_SIGMA_Z_INVARIANT',
      units: 'MPa',
      tolerance: 1e-12,
      loadCaseId: responseSpec.load.loadCaseId,
      component: 'SIGMA_Z',
      reducer: 'MAXIMUM_SIGNED',
    },
  });
  state.executionHash = execution.executionHash;
  writeJson(EXECUTION_PATH, execution);
  if (!execution.accepted) {
    throw new Error('CANDIDATE_SOLVER_EXECUTION_BLOCKED');
  }
  const response = evaluateCandidateResponse(projection, execution, bundle);
  state.responseHash = response.semanticHash;
  writeJson(RESPONSE_PATH, response);
  const status = response.status === 'PASS' ? 'PASS' : 'BLOCKED';
  return {
    schema: 'lafea-bucket-01-probe-stable-v3-global-response-runner/v1',
    status,
    exactHeadSha,
    designId: design.designId,
    designHash: bundle.designHash,
    candidateIntakeEvidenceHash: bundle.intakeEvidence.semanticHash,
    projectionHash: projection.semanticHash,
    executionHash: execution.executionHash,
    responseHash: response.semanticHash,
    projectionPath: relative(PROJECTION_PATH),
    executionPath: relative(EXECUTION_PATH),
    responsePath: relative(RESPONSE_PATH),
    elementCounts: projection.levels.map(
      (row) => row.meshEvidence.mesh.elements.length,
    ),
    responseStatus: response.status,
    responseReasons: response.reasons,
    authority: {
      candidateOnly: true,
      candidateSolverExecuted: true,
      candidateGlobalResponseEvaluated: true,
      candidateStressEvaluated: false,
      independentCheckerExecution: false,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

function evaluateCandidateResponse(projection, execution, bundle) {
  const controller = execution.controllerResult;
  const topologySignature = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-candidate-global-topology-signature/v1',
    designId: design.designId,
    topologyPolicy: design.topologyPolicy,
    productionMappingPolicy: design.productionMappingPolicy,
  });
  const area = Math.PI * (
    responseSpec.geometry.outerRadius ** 2
      - responseSpec.geometry.holeRadius ** 2
  );
  const levels = projection.levels.map((projectionLevel, index) => {
    const result = resultPlaneStressPayload(controller.levelResults[index]);
    const mesh = projectionLevel.meshEvidence.mesh;
    const loads = projectionLevel.document.loadCases
      .flatMap((loadCase) => loadCase.nodalForces);
    const reactions = result.supportReactions.map((row) => ({
      nodeId: row.nodeId,
      fx: row.fx,
      fy: row.fy,
    }));
    return {
      ordinal: index + 1,
      elementCount: mesh.elements.length,
      globalCharacteristicH: Math.sqrt(area / mesh.elements.length),
      globalTopologySignature: topologySignature,
      meshHash: result.meshHash,
      recoveryHash: result.recoveryHash,
      resultHash: result.resultHash,
      solverMethod: result.solver.method,
      freeDofCount: result.solver.freeDofCount,
      appliedForce: sumForces(loads),
      reactionForce: sumForces(reactions),
      appliedMomentZ: sumMoments(loads, mesh),
      reactionMomentZ: sumMoments(reactions, mesh),
      totalStrainEnergy: result.energy.totalStrainEnergy,
      halfExternalWork: result.energy.halfExternalWork,
      energyQualificationAccepted:
        result.energyQualification.status === 'ACCEPTED',
    };
  });
  return evaluateLafeaBucket01CandidateResponse({
    schema: LAFEA_BUCKET_01_CANDIDATE_RESPONSE_INPUT_SCHEMA,
    exactHeadSha,
    designHash: bundle.designHash,
    specHash: canonicalLafeaSha256(responseSpec),
    locationDefinitionHash: canonicalLafeaSha256({
      schema: 'lafea-bucket-01-candidate-global-response-location/v1',
      geometry: responseSpec.geometry,
      load: responseSpec.load,
      restraint: responseSpec.restraint,
    }),
    globalCharacteristicHDefinition:
      LAFEA_BUCKET_01_CANDIDATE_GLOBAL_H_DEFINITION,
    expectedAppliedForce: responseSpec.load.resultant,
    expectedAppliedMomentZ: responseSpec.load.expectedMomentAboutCenter,
    levels,
    tolerances: {
      loadResultantRelative: responseSpec.tolerances.loadResultantRelative,
      forceEquilibriumRelative:
        responseSpec.tolerances.forceEquilibriumRelative,
      loadMomentRelative: responseSpec.tolerances.loadMomentRelative,
      momentEquilibriumRelative:
        responseSpec.tolerances.momentEquilibriumRelative,
      energyReconstructionRelative:
        responseSpec.tolerances.energyReconstructionRelative,
      strainEnergyGci: responseSpec.tolerances.strainEnergyGci,
      minimumObservedOrder:
        responseSpec.convergence.strainEnergy.minimumObservedOrder,
      asymptoticRatioBounds:
        responseSpec.convergence.strainEnergy.asymptoticRatioBounds,
    },
  });
}

function meshProfile(packageValue, index) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `B01-PROBE-STABLE-V3-CANDIDATE-L${index + 1}`,
    sourceRevision: '1',
    fields: {
      continuumElement: 'T6',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: Math.sqrt(
        Math.PI * (
          responseSpec.geometry.outerRadius ** 2
            - responseSpec.geometry.holeRadius ** 2
        ) / packageValue.mesh.elements.length,
      ),
      adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 5,
      aspectRatioBlock: 20,
      scaledJacobianWarn: 0.2,
      scaledJacobianBlock: 0.01,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}

function resultPlaneStressPayload(levelResult) {
  const result = levelResult.result;
  if (!result || result.status !== 'ACCEPTED' || !result.solver?.accepted
    || result.solver.stiffnessStorage !== levelResult.stiffnessStorage
    || result.solver.method !== levelResult.solverMethod
    || result.energyQualification?.status !== 'ACCEPTED'
    || result.energy?.strainEnergyAuthority
      !== 'ASSEMBLED_ELEMENT_STIFFNESS_QUADRATIC_FORM'
    || result.energy?.externalWorkAuthority
      !== 'APPLIED_FORCE_DOT_NODAL_DISPLACEMENT'
    || !Array.isArray(result.supportReactions)) {
    throw new Error(`Candidate result level ${levelResult.ordinal} is not qualified.`);
  }
  return result;
}

function sumForces(rows) {
  return rows.reduce((sum, row) => ({
    x: sum.x + row.fx,
    y: sum.y + row.fy,
  }), { x: 0, y: 0 });
}

function sumMoments(rows, mesh) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  return rows.reduce((sum, row) => {
    const node = nodeById.get(row.nodeId);
    if (!node) throw new Error(`Missing node ${row.nodeId} for moment sum.`);
    const x = node.x - responseSpec.geometry.center.x;
    const y = node.y - responseSpec.geometry.center.y;
    return sum + x * row.fy - y * row.fx;
  }, 0);
}

function blockedRunner() {
  return {
    schema: 'lafea-bucket-01-probe-stable-v3-global-response-runner/v1',
    status: 'BLOCKED',
    exactHeadSha,
    designId: design.designId,
    designHash: canonicalLafeaSha256(design),
    projectionHash: state.projectionHash,
    executionHash: state.executionHash,
    responseHash: state.responseHash,
    reasons: state.reasons,
    projectionPath: fs.existsSync(PROJECTION_PATH) ? relative(PROJECTION_PATH) : null,
    executionPath: fs.existsSync(EXECUTION_PATH) ? relative(EXECUTION_PATH) : null,
    responsePath: fs.existsSync(RESPONSE_PATH) ? relative(RESPONSE_PATH) : null,
    authority: {
      candidateOnly: true,
      candidateSolverExecuted: state.executionHash !== null,
      candidateGlobalResponseEvaluated: state.responseHash !== null,
      candidateStressEvaluated: false,
      independentCheckerExecution: false,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

function outputPath(environmentKey, fallback) {
  return path.resolve(ROOT, process.env[environmentKey] ?? fallback);
}
function readJson(absolute) {
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}
function writeJson(absolute, value) {
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function relative(absolute) {
  return path.relative(ROOT, absolute);
}
function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr?.trim()
      || result.error?.message
      || 'git rev-parse HEAD failed');
  }
  return result.stdout.trim();
}
