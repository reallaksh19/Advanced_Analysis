import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCanonicalFlangeHubGeometry,
} from '../src/core/bucket-b/flange-hub-geometry.js';
import {
  FLANGE_HUB_MESH_LEVELS,
  createFlangeHubMesh,
} from '../src/core/bucket-b/flange-hub-mesh.js';
import {
  solveFlangeHubDiagnosticProbe,
} from '../src/core/bucket-b/flange-hub-diagnostic-solver.js';
import { evaluateConvergence } from '../src/core/bucket-b/convergence.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(
  ROOT,
  process.env.BB11_M4_DIAGNOSTIC_REPORT_PATH
    ?? 'reports/bb11-axial-tail-m4.json',
);
const expectedMeshFamilyId = process.env.BB11_DIAGNOSTIC_MESH_FAMILY_ID
  ?? 'BKT-B-FLANGE-Q8-DIAGNOSTIC-M4-V1';
const expectedLevels = ['M0', 'M1', 'M2', 'M3', 'M4'];
const probeCoordinate = Object.freeze({
  probeId: 'P-HUB-MID',
  r: 62.75,
  z: 30,
});
const geometry = createCanonicalFlangeHubGeometry();
const strictLimit = 0.005;
const hardEvaluatorRejections = new Set([
  'OSCILLATORY',
  'REFERENCE_ERROR_FAILURE',
  'EQUILIBRIUM_ONLY',
]);
const report = {
  schema: 'bb11-axial-tail-m4-diagnostic/v3',
  authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
  hypothesis: 'M4_DISTINGUISHES_COARSE_LADDER_FROM_TRANSITION_TOPOLOGY',
  loadCaseId: 'FH-AXIAL-001',
  quantityId: 'P-HUB-MID:U_AXIAL',
  meshFamilyId: expectedMeshFamilyId,
  strictLimit,
  custody: {
    productionHead: process.env.BB11_PRODUCTION_HEAD ?? null,
    diagnosticHead: process.env.BB11_DIAGNOSTIC_HEAD ?? null,
    productionBlobIdentityVerified: process.env.BB11_PRODUCTION_BLOB_IDENTITY === 'true',
    diagnosticSolverBlob: process.env.BB11_DIAGNOSTIC_SOLVER_BLOB ?? null,
    diagnosticScriptBlob: process.env.BB11_DIAGNOSTIC_SCRIPT_BLOB ?? null,
    diagnosticWorkflowBlob: process.env.BB11_DIAGNOSTIC_WORKFLOW_BLOB ?? null,
  },
  resourceLimits: {
    nodeHeapMiB: Number(process.env.BB11_DIAGNOSTIC_HEAP_LIMIT_MIB ?? 6144),
    executionTimeoutMinutes: Number(
      process.env.BB11_DIAGNOSTIC_TIMEOUT_MINUTES ?? 55,
    ),
  },
  productionGeometryModified: false,
  productionLoadsModified: false,
  productionRestraintsModified: false,
  productionSolverModified: false,
  productionProbeModified: false,
  productionConvergenceLimitModified: false,
  productionMeshFamilyModified: false,
  diagnosticRecoveryMode: 'BOUNDED_EXACT_SHARED_NODE_AND_ADJACENT_B03_B04_ENERGY',
  levels: [],
  status: 'INITIALIZED',
  qualificationAuthorityGranted: false,
  productionAuthorityGranted: false,
  mergeAuthorityGranted: false,
  bb12Authorized: false,
};

function persist() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

function physicalTail(coarse, fine) {
  const denominator = Math.max(
    1e-9,
    coarse.probe.vectorNorm,
    fine.probe.vectorNorm,
  );
  const absoluteChange = Math.abs(fine.probe.axial - coarse.probe.axial);
  const normalizedChange = absoluteChange / denominator;
  return {
    coarseLevelId: coarse.levelId,
    fineLevelId: fine.levelId,
    coarseValue: coarse.probe.axial,
    fineValue: fine.probe.axial,
    absoluteChange,
    denominator,
    normalizationBasis: 'PROBE_DISPLACEMENT_VECTOR_NORM',
    normalizedChange,
    strictLimit,
    accepted: normalizedChange <= strictLimit,
  };
}

function runLevel(levelId) {
  const mesh = createFlangeHubMesh(levelId, geometry);
  if (mesh.meshFamilyId !== expectedMeshFamilyId) {
    throw new Error(`BB11_M4_MESH_FAMILY_MISMATCH:${mesh.meshFamilyId}`);
  }
  const result = solveFlangeHubDiagnosticProbe({
    mesh,
    loadCaseId: report.loadCaseId,
    probe: probeCoordinate,
  });
  const serializedLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (serializedLength > 1_000_000) {
    throw new RangeError(`BB11_M4_DIAGNOSTIC_RESULT_UNBOUNDED:${serializedLength}`);
  }
  return {
    levelId,
    refinement: mesh.refinement,
    globalH: mesh.globalH,
    nodeCount: mesh.nodeCount,
    elementCount: mesh.elementCount,
    meshHash: mesh.meshHash,
    canonicalModelHash: mesh.canonicalModelHash,
    meshFamilyId: mesh.meshFamilyId,
    diagnosticSemanticHash: result.semanticHash,
    serializedResultBytes: serializedLength,
    quality: result.mesh.quality,
    blockCounts: result.mesh.blockCounts,
    probe: result.probe,
    patch: result.patch,
    solver: result.solver,
    load: result.load,
    constraints: result.constraints,
    equilibrium: result.equilibrium,
    energy: result.energy,
    residual: result.residual,
    qualificationAuthorityGranted: false,
    productionAuthorityGranted: false,
  };
}

persist();

try {
  const availableLevels = FLANGE_HUB_MESH_LEVELS.map((row) => row.levelId);
  if (JSON.stringify(availableLevels) !== JSON.stringify(expectedLevels)) {
    throw new Error(`BB11_M4_LEVEL_SET_MISMATCH:${availableLevels.join(',')}`);
  }
  if (report.custody.productionBlobIdentityVerified !== true) {
    throw new Error('BB11_M4_PRODUCTION_BLOB_IDENTITY_NOT_VERIFIED');
  }

  for (const { levelId } of FLANGE_HUB_MESH_LEVELS) {
    report.status = `EXECUTING_${levelId}`;
    persist();
    report.levels.push(runLevel(levelId));
    report.status = `COMPLETED_${levelId}`;
    persist();
    global.gc?.();
  }

  report.m2ToM3 = physicalTail(report.levels[2], report.levels[3]);
  report.m3ToM4 = physicalTail(report.levels[3], report.levels[4]);
  report.sharedEvaluator = evaluateConvergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels: report.levels.map((row) => ({
      level: row.levelId,
      h: row.globalH,
      value: row.probe.axial,
    })),
    requireFourLevels: true,
    finestRelativeChangeLimit: strictLimit,
    boundedOscillationRelativeLimit: strictLimit,
    qualifiedTailRelativeLimit: strictLimit,
  });
  const hardRejection = hardEvaluatorRejections.has(
    report.sharedEvaluator.disposition,
  );
  report.decision = report.m3ToM4.accepted && !hardRejection
    ? 'INVESTIGATE_BALANCED_1P5X_PRODUCTION_FAMILY'
    : 'DEVELOP_CONFORMING_B03_B04_TRANSITION_TOPOLOGY';
  report.status = 'COMPLETED';
  persist();
  console.log(JSON.stringify({
    status: report.status,
    productionHead: report.custody.productionHead,
    diagnosticHead: report.custody.diagnosticHead,
    m2ToM3: report.m2ToM3.normalizedChange,
    m3ToM4: report.m3ToM4.normalizedChange,
    evaluatorDisposition: report.sharedEvaluator.disposition,
    decision: report.decision,
    qualificationAuthorityGranted: false,
  }));
} catch (error) {
  report.status = 'FAILED';
  report.failure = {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
  report.qualificationAuthorityGranted = false;
  report.productionAuthorityGranted = false;
  report.mergeAuthorityGranted = false;
  report.bb12Authorized = false;
  persist();
  throw error;
}
