#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  createLafeaLugPinholePhysicalProblemProjection,
  executeLafeaLugPinholePhysicalProblemBatch,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/06-production-response-convergence-spec.json',
);
const PROJECTION_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PRODUCTION_PROJECTION_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-projection.json',
);
const EXECUTION_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PRODUCTION_EXECUTION_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-execution.json',
);
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const fixture = createNbT6cFixture(ROOT, head);
const input = structuredClone(fixture.projectionInput);

input.geometry = structuredClone(spec.geometry);
input.levels = spec.meshLadder.map((row) => level(row));
input.physicalProblem.modelIdentity = 'B01-C2D-LUG-PINHOLE-PRODUCTION-RESPONSE';
input.physicalProblem.sourceAncestry.sourceModelIdentity =
  'B01-C2D-LUG-PINHOLE-PRODUCTION-RESPONSE';
input.physicalProblem.sourceAncestry.adapterIdentity =
  'B01-PRODUCTION-RESPONSE-RUNNER';
input.physicalProblem.material.elasticModulus = spec.material.elasticModulus;
input.physicalProblem.material.poissonRatio = spec.material.poissonRatio;
input.physicalProblem.thickness = spec.material.thickness;
input.physicalProblem.loadCase.loadCaseId = spec.load.loadCaseId;
input.physicalProblem.loadCase.resultant = [
  spec.load.resultant.x,
  spec.load.resultant.y,
];
input.physicalProblem.resultRequests = { loadCaseIds: [spec.load.loadCaseId] };
input.physicalProblem.kinematics = {
  mode: 'BOUNDARY_ZERO',
  ux: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
  uy: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
};
input.physicalProblem.limitations = [
  'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
  'BUCKET_01_PRODUCTION_RESPONSE_EXECUTION',
];
input.featureProjection.loadFeature = {
  featureId: 'LOAD-EDGE',
  role: spec.load.featureRole,
  baseStartEdge: spec.load.baseStartEdge,
  baseEdgeCount: spec.load.baseEdgeCount,
};
input.featureProjection.boundaryFeature = {
  featureId: 'ROOT-REGION',
  role: spec.restraint.featureRole,
  baseStartEdge: spec.restraint.baseStartEdge,
  baseEdgeCount: spec.restraint.baseEdgeCount,
};
input.producerRef = 'B01/C2D-LUG-PINHOLE/LAFEA.3/PRODUCTION-RESPONSE';
input.sourceAuthorityOriginRef = 'B01/C2D-LUG-PINHOLE/PRODUCTION-RESPONSE';

const projection = createLafeaLugPinholePhysicalProblemProjection(input);
assert.deepEqual(
  projection.levels.map((row) => row.meshEvidence.mesh.elements.length),
  spec.meshLadder.map((row) => row.elementCount),
);
assert.deepEqual(
  projection.levels.map((row) => row.loadResultant),
  spec.meshLadder.map(() => [spec.load.resultant.x, spec.load.resultant.y]),
);
fs.mkdirSync(path.dirname(PROJECTION_PATH), { recursive: true });
fs.writeFileSync(PROJECTION_PATH, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');

const benchmarkQualification = fixture.benchmark(
  projection.mappingPackage.semanticHash,
);
const execution = executeLafeaLugPinholePhysicalProblemBatch({
  schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  projection,
  benchmarkQualification,
  requestId: 'B01-C2D-LUG-PINHOLE-PRODUCTION-RESPONSE',
  recoveryProfileHash: fixture.hash('B01-PRODUCTION-INTEGRATION-POINT-RECOVERY'),
  convergenceRequest: {
    quantityId: 'PLANE_STRESS_SIGMA_Z_INVARIANT',
    units: 'MPa',
    tolerance: 1e-12,
    loadCaseId: spec.load.loadCaseId,
    component: 'SIGMA_Z',
    reducer: 'MAXIMUM_SIGNED',
  },
});
fs.mkdirSync(path.dirname(EXECUTION_PATH), { recursive: true });
fs.writeFileSync(EXECUTION_PATH, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: 'lafea-bucket-01-production-response-runner/v1',
  exactHeadSha: head,
  projectionPath: path.relative(ROOT, PROJECTION_PATH),
  executionPath: path.relative(ROOT, EXECUTION_PATH),
  status: execution.status,
  accepted: execution.accepted,
  elementCounts: projection.levels.map(
    (row) => row.meshEvidence.mesh.elements.length,
  ),
}));
if (!execution.accepted) process.exit(1);

function level(definition) {
  return {
    ordinal: definition.ordinal,
    meshIdentity: `B01-PRODUCTION-T6-L${definition.ordinal}`,
    radialDivisions: definition.radialDivisions,
    circumferentialDivisions: definition.circumferentialDivisions,
    meshProfile: canonicalProfile(PROFILE_KINDS.MESH, {
      schema: 'lafea-mesh-profile/v1',
      profileIdentity: `B01-PRODUCTION-T6-LEVEL-${definition.ordinal}`,
      sourceRevision: '1',
      fields: {
        continuumElement: 'T6',
        shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
        globalTargetSize: spec.geometry.outerRadius
          / definition.circumferentialDivisions,
        adjacentSizeRatioMax: 1.5,
        aspectRatioWarn: 5,
        aspectRatioBlock: 20,
        scaledJacobianWarn: 0.2,
        scaledJacobianBlock: 0.01,
        adaptiveLevels: 3,
      },
      semanticHash: undefined,
    }),
  };
}
