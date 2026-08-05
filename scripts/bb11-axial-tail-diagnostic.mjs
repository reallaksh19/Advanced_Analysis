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
  solveFlangeHubLoadCase,
} from '../src/core/bucket-b/flange-hub-solver.js';
import {
  createFlangeHubPathDefinitions,
  recoverFlangeHubLevel,
} from '../src/core/bucket-b/flange-hub-recovery.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(
  ROOT,
  process.env.BB11_AXIAL_DIAGNOSTIC_REPORT_PATH
    ?? 'reports/bb11-axial-tail-diagnostic.json',
);
const expectedMeshFamilyId = process.env.BB11_DIAGNOSTIC_MESH_FAMILY_ID
  ?? 'BKT-B-FLANGE-Q8-DIAGNOSTIC-B05-B06-V1';
const geometry = createCanonicalFlangeHubGeometry();
const pathDefinitions = createFlangeHubPathDefinitions(geometry);
const levels = [];

for (const { levelId } of FLANGE_HUB_MESH_LEVELS) {
  const startedAt = Date.now();
  const mesh = createFlangeHubMesh(levelId, geometry);
  if (mesh.meshFamilyId !== expectedMeshFamilyId) {
    throw new Error(
      `BB11_DIAGNOSTIC_MESH_FAMILY_MISMATCH:${mesh.meshFamilyId}`,
    );
  }
  const result = solveFlangeHubLoadCase({
    mesh,
    loadCaseId: 'FH-AXIAL-001',
  });
  const recovery = recoverFlangeHubLevel({
    mesh,
    result,
    geometry,
    pathDefinitions,
  });
  const probe = recovery.probes.find((row) => row.probeId === 'P-HUB-MID');
  if (!probe) throw new Error(`BB11_DIAGNOSTIC_PROBE_MISSING:${levelId}`);
  const blockCounts = Object.fromEntries(mesh.blocks.map((block) => [
    block.blockId,
    {
      longitudinalElementCount: block.longitudinalElementCount,
      transverseElementCount: block.transverseElementCount,
      elementCount: block.elementIds.length,
    },
  ]));
  levels.push({
    levelId,
    refinement: mesh.refinement,
    globalH: mesh.globalH,
    nodeCount: mesh.nodeCount,
    elementCount: mesh.elementCount,
    meshHash: mesh.meshHash,
    meshFamilyId: mesh.meshFamilyId,
    blockCounts,
    probe: {
      probeId: probe.probeId,
      physicalCoordinate: probe.physicalCoordinate,
      selectedContainingElementId: probe.selectedContainingElementId,
      selectedBlockId: probe.selectedBlockId,
      probeH: probe.probeH,
      radial: probe.displacement.radial,
      axial: probe.displacement.axial,
      vectorNorm: Math.hypot(
        probe.displacement.radial,
        probe.displacement.axial,
      ),
      mappingResidual: probe.mappingResidual,
    },
    solver: {
      solverPolicyId: result.solver.solverPolicyId,
      freeDofCount: result.solver.freeDofCount,
      constrainedDofCount: result.solver.constrainedDofCount,
      iterations: result.solver.iterations,
      relativeResidual: result.solver.relativeResidual,
      explicitResidualNorm: result.solver.explicitResidualNorm,
      residualReplacementCount: result.solver.residualReplacementCount,
    },
    equilibrium: result.equilibrium,
    energy: result.energy,
    residual: result.residual,
    elapsedMilliseconds: Date.now() - startedAt,
  });
}

const coarse = levels.at(-2);
const fine = levels.at(-1);
const denominator = Math.max(
  1e-9,
  coarse.probe.vectorNorm,
  fine.probe.vectorNorm,
);
const axialChange = Math.abs(fine.probe.axial - coarse.probe.axial);
const normalizedM2M3AxialChange = axialChange / denominator;
const strictLimit = 0.005;
const report = {
  schema: 'bb11-axial-tail-diagnostic/v1',
  authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
  hypothesis: 'DOUBLE_B05_B06_LONGITUDINAL_RESOLUTION',
  loadCaseId: 'FH-AXIAL-001',
  quantityId: 'P-HUB-MID:U_AXIAL',
  meshFamilyId: expectedMeshFamilyId,
  productionGeometryUnchanged: true,
  productionLoadsUnchanged: true,
  productionRestraintsUnchanged: true,
  productionSolverToleranceUnchanged: true,
  productionProbeUnchanged: true,
  productionConvergenceLimitUnchanged: true,
  levels,
  m2ToM3: {
    coarseLevelId: coarse.levelId,
    fineLevelId: fine.levelId,
    axialChange,
    denominator,
    normalizedChange: normalizedM2M3AxialChange,
    strictLimit,
    accepted: normalizedM2M3AxialChange <= strictLimit,
  },
  qualificationAuthorityGranted: false,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
