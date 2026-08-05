import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createCanonicalFlangeHubGeometry } from '../src/core/bucket-b/flange-hub-geometry.js';
import {
  FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  FLANGE_HUB_TRANSITION_CANDIDATE_LEVELS,
  FLANGE_HUB_TRANSITION_CANDIDATE_POLICY,
  createFlangeHubTransitionCandidateMesh,
} from '../src/core/bucket-b/flange-hub-transition-candidate.js';
import {
  solveFlangeHubDiagnosticProbe,
} from '../src/core/bucket-b/flange-hub-diagnostic-solver.js';
import { evaluateConvergence } from '../src/core/bucket-b/convergence.js';
import {
  evaluatePhysicalTailChange,
  FLANGE_HUB_CONVERGENCE_POLICY,
} from '../src/core/bucket-b/flange-hub-convergence.js';

const HARD_REGISTERED_FAILURES = new Set([
  'OSCILLATORY',
  'REFERENCE_ERROR_FAILURE',
  'EQUILIBRIUM_ONLY',
]);
const exactHeadSha = requiredSha(
  process.env.EXPECTED_HEAD_SHA,
  'EXPECTED_HEAD_SHA',
);
const productionParentSha = requiredSha(
  process.env.BB11_PRODUCTION_PARENT_SHA,
  'BB11_PRODUCTION_PARENT_SHA',
);
const outputPath = process.env.BB11_TRANSITION_REPORT_PATH
  ?? 'reports/bb11-b03-b04-transition-candidate.json';

const geometry = createCanonicalFlangeHubGeometry();
const levelRows = [];
for (const { levelId } of FLANGE_HUB_TRANSITION_CANDIDATE_LEVELS) {
  const mesh = createFlangeHubTransitionCandidateMesh(levelId, geometry);
  const result = solveFlangeHubDiagnosticProbe({
    mesh,
    loadCaseId: 'FH-AXIAL-001',
  });
  levelRows.push({ mesh, result });
  process.stdout.write(`${JSON.stringify({
    event: 'BB11_TRANSITION_CANDIDATE_LEVEL_COMPLETED',
    levelId,
    meshFamilyId: mesh.meshFamilyId,
    nodeCount: mesh.nodeCount,
    elementCount: mesh.elementCount,
    axial: result.probe.axial,
    radial: result.probe.radial,
    vectorNorm: result.probe.vectorNorm,
    iterations: result.solver.iterations,
    explicitResidualNorm: result.solver.explicitResidualNorm,
    interfaceConforming:
      mesh.candidateMetadata.interfaceEvidence.allConforming,
  })}\n`);
}

const convergenceLevels = levelRows.map(({ mesh, result }) => ({
  level: mesh.levelId,
  h: mesh.globalH,
  value: result.probe.axial,
  physicalScale: result.probe.vectorNorm,
}));
const registeredEvaluation = evaluateConvergence({
  quantityKind: 'GLOBAL_DISPLACEMENT',
  levels: convergenceLevels,
  requireFourLevels: true,
  finestRelativeChangeLimit:
    FLANGE_HUB_CONVERGENCE_POLICY.limits.GLOBAL_DISPLACEMENT,
  boundedOscillationRelativeLimit:
    FLANGE_HUB_CONVERGENCE_POLICY.limits.GLOBAL_DISPLACEMENT,
  qualifiedTailRelativeLimit:
    FLANGE_HUB_CONVERGENCE_POLICY.limits.GLOBAL_DISPLACEMENT,
});
const coarse = convergenceLevels.at(-2);
const fine = convergenceLevels.at(-1);
const physicalTailEvaluation = evaluatePhysicalTailChange({
  coarseValue: coarse.value,
  fineValue: fine.value,
  coarseScale: coarse.physicalScale,
  fineScale: fine.physicalScale,
  floor: FLANGE_HUB_CONVERGENCE_POLICY.physicalFloors.displacement,
  limit: FLANGE_HUB_CONVERGENCE_POLICY.limits.GLOBAL_DISPLACEMENT,
  normalizationBasis:
    FLANGE_HUB_CONVERGENCE_POLICY.physicalNormalization
      .GLOBAL_DISPLACEMENT,
});
const certificateFailures = levelRows.flatMap(({ mesh, result }) => {
  const failures = [];
  if (mesh.quality.accepted !== true) failures.push('MESH_QUALITY');
  if (mesh.candidateMetadata.interfaceEvidence.allConforming !== true) {
    failures.push('INTERFACE_CONFORMITY');
  }
  if (mesh.candidateMetadata.probeEvidence.positiveZOwnershipVerified
    !== true) {
    failures.push('PROBE_OWNERSHIP');
  }
  if (result.equilibrium.accepted !== true) failures.push('EQUILIBRIUM');
  if (result.energy.accepted !== true) failures.push('ENERGY');
  if (result.residual.accepted !== true) failures.push('RESIDUAL');
  if (!(result.solver.relativeResidual <= 1e-10)) {
    failures.push('PCG_RELATIVE_RESIDUAL');
  }
  return failures.map((failure) => `${mesh.levelId}:${failure}`);
});
const hardRegisteredFailure = HARD_REGISTERED_FAILURES.has(
  registeredEvaluation.disposition,
);
const accepted = physicalTailEvaluation.accepted
  && !hardRegisteredFailure
  && certificateFailures.length === 0;
const decision = accepted
  ? 'AXIAL_SCREEN_PASS_RUN_COMPLETE_BB11_QUALIFICATION'
  : registeredEvaluation.disposition === 'OSCILLATORY'
    ? 'REVISE_B03_B04_TRANSITION_TOPOLOGY'
    : 'REJECT_TRANSITION_CANDIDATE';

const boundedLevels = levelRows.map(({ mesh, result }) => ({
  levelId: mesh.levelId,
  meshHash: mesh.meshHash,
  canonicalModelHash: mesh.canonicalModelHash,
  nodeCount: mesh.nodeCount,
  elementCount: mesh.elementCount,
  globalH: mesh.globalH,
  quality: withoutElementRows(mesh.quality),
  interfaceEvidence: mesh.candidateMetadata.interfaceEvidence,
  probeEvidence: mesh.candidateMetadata.probeEvidence,
  probe: result.probe,
  patch: result.patch,
  solver: result.solver,
  equilibrium: result.equilibrium,
  energy: result.energy,
  residual: result.residual,
  diagnosticResultHash: result.semanticHash,
}));
const payload = {
  schema: 'bb11-b03-b04-transition-screen/v1',
  exactHeadSha,
  productionParentSha,
  moduleId: 'C2D-FLANGE-HUB',
  loadCaseId: 'FH-AXIAL-001',
  quantityId: 'P-HUB-MID:U_AXIAL',
  meshFamilyId: FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  candidatePolicy: FLANGE_HUB_TRANSITION_CANDIDATE_POLICY,
  geometryHash: geometry.semanticHash,
  levels: boundedLevels,
  registeredEvaluation,
  physicalTailEvaluation,
  hardRegisteredFailure,
  certificateFailures,
  accepted,
  decision,
  authority: {
    qualificationAuthorityGranted: false,
    productionAuthorityGranted: false,
    productionMeshSelected: false,
    mergeAuthorityGranted: false,
    bb12Authorized: false,
  },
};
const report = {
  ...payload,
  semanticHash: semanticHash(payload),
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  event: 'BB11_TRANSITION_CANDIDATE_SCREEN_COMPLETED',
  exactHeadSha,
  productionParentSha,
  meshFamilyId: FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  disposition: registeredEvaluation.disposition,
  registeredAccepted:
    registeredEvaluation.acceptedForAdjudication,
  m2ToM3PhysicalChange:
    physicalTailEvaluation.normalizedChange,
  limit: physicalTailEvaluation.limit,
  accepted,
  decision,
  reportPath: outputPath,
  reportHash: report.semanticHash,
})}\n`);

function withoutElementRows(quality) {
  const { elementQuality, ...aggregate } = quality;
  return {
    ...aggregate,
    elementQualityCount: elementQuality.length,
  };
}

function requiredSha(value, name) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? '')) {
    throw new TypeError(`BB11_TRANSITION_${name}_REQUIRED`);
  }
  return value.toLowerCase();
}
