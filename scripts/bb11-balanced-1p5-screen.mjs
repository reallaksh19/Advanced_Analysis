#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'reports', 'bb11-balanced-1p5');
const TEMP_SOLVER = join(ROOT, 'src/core/bucket-b/.bb11-balanced-screen-solver.mjs');
const TEMP_MESH = join(ROOT, 'src/core/bucket-b/.bb11-balanced-screen-mesh.mjs');
const LEVELS = ['M0', 'M1', 'M2', 'M3'];
const CASES = ['FH-PRES-001', 'FH-AXIAL-001'];
const LIMIT = 0.005;
const MAX_BYTES = 256 * 1024;
const PRODUCTION_CORE_LIMIT_MS = 14 * 60 * 1000;
mkdirSync(OUT, { recursive: true });

try {
  createTemporaryModules();
  const [{ createFlangeHubMesh }, solver, { evaluateConvergence }] = await Promise.all([
    import(pathToFileURL(TEMP_MESH).href),
    import(pathToFileURL(TEMP_SOLVER).href),
    import(pathToFileURL(join(ROOT, 'src/core/bucket-b/convergence.js')).href),
  ]);
  const started = process.hrtime.bigint();
  const rows = [];
  const axial = [];

  for (const levelId of LEVELS) {
    const mesh = createFlangeHubMesh(levelId);
    for (const loadCaseId of CASES) {
      global.gc?.();
      const solveStarted = process.hrtime.bigint();
      const diagnostic = solver.solveFlangeHubLoadCaseScreen({
        mesh,
        loadCaseId,
        diagnosticOnly: true,
      });
      const elapsedMilliseconds = Number(process.hrtime.bigint() - solveStarted) / 1e6;
      assertBounded(diagnostic, levelId, loadCaseId);
      const row = {
        levelId,
        loadCaseId,
        elapsedMilliseconds,
        maxRssKilobytes: process.resourceUsage().maxRSS,
        diagnostic,
      };
      rows.push(row);
      if (loadCaseId === 'FH-AXIAL-001') axial.push({
        level: levelId,
        h: diagnostic.mesh.globalH,
        value: diagnostic.probe.displacementVectorNorm,
        radial: diagnostic.probe.radial,
        axial: diagnostic.probe.axial,
        patchStrainEnergy: diagnostic.patch.strainEnergy,
      });
      writeJson(join(OUT, `bounded-${levelId}-${loadCaseId}.json`), row);
    }
  }

  const sharedClassification = evaluateConvergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels: axial.map(({ level, h, value }) => ({ level, h, value })),
    requireFourLevels: true,
    finestRelativeChangeLimit: LIMIT,
    boundedOscillationRelativeLimit: LIMIT,
    qualifiedTailRelativeLimit: LIMIT,
  });
  const m2 = axial.find((row) => row.level === 'M2').value;
  const m3 = axial.find((row) => row.level === 'M3').value;
  const physicalTail = Math.abs(m3 - m2) / Math.max(Math.abs(m2), Math.abs(m3), 1e-9);
  const hard = new Set(['OSCILLATORY', 'REFERENCE_ERROR_FAILURE', 'EQUILIBRIUM_ONLY']);
  const m3Rows = rows.filter((row) => row.levelId === 'M3');
  const m3BoundedSolveMilliseconds = m3Rows.reduce((sum, row) => sum + row.elapsedMilliseconds, 0);
  const payload = {
    schema: 'bucket-b-bb11-balanced-1p5-screen/v1',
    mode: 'NON_AUTHORIZING_PRODUCTION_CANDIDATE_SCREEN',
    exactHeadSha: process.env.EXPECTED_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
    baseSha: process.env.EXPECTED_BASE_SHA ?? null,
    candidate: {
      candidateId: 'BKT-B-FLANGE-Q8-BALANCED-1P5-CANDIDATE-V1',
      longitudinalCounts: {
        'FH-B00': 24,
        'FH-B01': 6,
        'FH-B02': 6,
        'FH-B03': 12,
        'FH-B04': 3,
        'FH-B05': [6, 9, 3],
        'FH-B06': [6, 9],
      },
      transverseBaseCount: 12,
      productionSourceModified: false,
      geometryAndMappingsModified: false,
      constraintsLoadsSolverAndTolerancesModified: false,
    },
    rows,
    axialTail: {
      values: axial,
      m2ToM3PhysicalTailChange: physicalTail,
      physicalTailLimit: LIMIT,
      physicalTailAccepted: physicalTail <= LIMIT,
      sharedClassification,
      hardSharedFailure: hard.has(sharedClassification.disposition),
      acceptedForCandidateInvestigation: physicalTail <= LIMIT
        && !hard.has(sharedClassification.disposition),
    },
    runtime: {
      totalElapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6,
      m3BoundedSolveMilliseconds,
      productionCoreLimitMilliseconds: PRODUCTION_CORE_LIMIT_MS,
      boundedM3LowerBoundAlreadyExceedsProductionLimit:
        m3BoundedSolveMilliseconds >= PRODUCTION_CORE_LIMIT_MS,
      fullProductionRuntimeQualified: false,
      maxRssKilobytes: process.resourceUsage().maxRSS,
    },
    authority: authorityFalse(),
  };
  const report = { ...payload, artifactSha256: sha256Text(JSON.stringify(payload)) };
  writeJson(join(OUT, 'bb11-balanced-1p5-screen-report.json'), report);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  rmSync(TEMP_SOLVER, { force: true });
  rmSync(TEMP_MESH, { force: true });
}

function createTemporaryModules() {
  let solver = readFileSync(join(ROOT, 'src/core/bucket-b/flange-hub-solver.js'), 'utf8');
  solver = once(solver,
    'export function solveFlangeHubLoadCase({ mesh, loadCaseId } = {}) {',
    `export function solveFlangeHubLoadCaseScreen({\n  mesh,\n  loadCaseId,\n  diagnosticOnly = false,\n} = {}) {`);
  solver = once(solver, '  const elementKernels = new Map();\n', '');
  solver = once(solver, '    elementKernels.set(element.elementId, kernel);\n', '');
  solver = once(solver,
    '  const nodalDisplacements = nodes.map((node, index) => deepFreeze({\n',
    `  const boundedDiagnostic = createBoundedScreenResult({ mesh, loadCaseId, loadDefinition, loadEvidence, nodes, nodesById, nodeIndex, displacement, constrainedDofs, reactions, reducedRows, solution, strainEnergy, externalWork, energyRelativeDifference, appliedAxial, axialReaction, axialForceImbalance, freeResidual, freeResidualRelative });\n  if (diagnosticOnly) return boundedDiagnostic;\n\n  const nodalDisplacements = nodes.map((node, index) => deepFreeze({\n`);
  solver = once(solver,
    '  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });\n}\n\nfunction createReducedSparseRows',
    `  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });\n}\n\n${helper()}\n\nfunction createReducedSparseRows`);
  writeFileSync(TEMP_SOLVER, solver);

  let mesh = readFileSync(join(ROOT, 'src/core/bucket-b/flange-hub-mesh.js'), 'utf8');
  const replacements = [
    ["export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-MESH-FAMILY-V1';",
      "export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-BALANCED-1P5-CANDIDATE-V1';"],
    ["const COMPUTATIONAL_V = Object.freeze(Array.from({ length: 9 }, (_, index) => index / 8));",
      "const COMPUTATIONAL_V = Object.freeze(Array.from({ length: 13 }, (_, index) => index / 12));"],
    ["{ id: 'FH-B00', kind: 'STRIP', segment: 'PIPE', baseUCount: 16 }",
      "{ id: 'FH-B00', kind: 'STRIP', segment: 'PIPE', baseUCount: 24 }"],
    ["{ id: 'FH-B01', kind: 'STRIP', segment: 'SMALL_ARC', baseUCount: 4 }",
      "{ id: 'FH-B01', kind: 'STRIP', segment: 'SMALL_ARC', baseUCount: 6 }"],
    ["{ id: 'FH-B02', kind: 'STRIP', segment: 'HUB_SMALL', baseUCount: 4 }",
      "{ id: 'FH-B02', kind: 'STRIP', segment: 'HUB_SMALL', baseUCount: 6 }"],
    ["{ id: 'FH-B03', kind: 'STRIP', segment: 'HUB_MID', baseUCount: 8 }",
      "{ id: 'FH-B03', kind: 'STRIP', segment: 'HUB_MID', baseUCount: 12 }"],
    ["{ id: 'FH-B04', kind: 'GRADING_TRANSITION', baseUCount: 2 }",
      "{ id: 'FH-B04', kind: 'GRADING_TRANSITION', baseUCount: 3 }"],
    ["return piecewiseBreakpoints(segmentLengths, [4, 6, 2]);",
      "return piecewiseBreakpoints(segmentLengths, [6, 9, 3]);"],
    ["return piecewiseBreakpoints([horizontalLength, verticalLength], [4, 6]);",
      "return piecewiseBreakpoints([horizontalLength, verticalLength], [6, 9]);"],
  ];
  for (const [target, replacement] of replacements) mesh = once(mesh, target, replacement);
  writeFileSync(TEMP_MESH, mesh);
}

function helper() {
  return String.raw`function createBoundedScreenResult(x) {
  const { mesh, loadCaseId, loadDefinition, loadEvidence, nodes, nodesById, nodeIndex, displacement, constrainedDofs, reactions, reducedRows, solution, strainEnergy, externalWork, energyRelativeDifference, appliedAxial, axialReaction, axialForceImbalance, freeResidual, freeResidualRelative } = x;
  const tol = 1e-9;
  const matches = nodes.filter((n) => Math.abs(n.r - 62.75) <= tol && Math.abs(n.z - 30) <= tol);
  if (matches.length !== 1) throw new RangeError('FH_SCREEN_PROBE_NODE_NOT_UNIQUE');
  const probeNode = matches[0];
  const probeIndex = nodeIndex.get(probeNode.nodeId);
  const adjacentElements = mesh.elements.filter((e) => e.nodeIds.includes(probeNode.nodeId))
    .map((e) => ({ elementId: e.elementId, blockId: e.blockId }))
    .sort((a, b) => a.elementId.localeCompare(b.elementId));
  const selectedOwners = adjacentElements.filter((e) => e.blockId === 'FH-B04').map((e) => e.elementId);
  if (!selectedOwners.length) throw new RangeError('FH_SCREEN_POSITIVE_Z_B04_OWNER_MISSING');
  const patchIds = [];
  let patchEnergy = 0;
  for (const element of mesh.elements) {
    if (!['FH-B03', 'FH-B04'].includes(element.blockId)) continue;
    const en = element.nodeIds.map((id) => nodesById.get(id));
    const z = en.map((n) => n.z);
    if (Math.min(...z) < 26.25 - tol || Math.max(...z) > 35 + tol) continue;
    const k = axisymmetricQ8Element({ elementId: element.elementId, nodes: en, material: FLANGE_HUB_MATERIAL_PROFILE }).stiffness;
    const u = element.nodeIds.flatMap((id) => { const i = nodeIndex.get(id); return [displacement[2 * i], displacement[2 * i + 1]]; });
    const ku = k.map((row) => row.reduce((s, v, i) => s + v * u[i], 0));
    patchEnergy += 0.5 * u.reduce((s, v, i) => s + v * ku[i], 0);
    patchIds.push(element.elementId);
  }
  if (!patchIds.length || !(patchEnergy > 0)) throw new RangeError('FH_SCREEN_PATCH_ENERGY_MISSING');
  const quality = {
    qualityProfileId: mesh.quality.qualityProfileId,
    minimumDetJAtGaussPoints: mesh.quality.minimumDetJAtGaussPoints,
    minimumDetJAtControlPoints: mesh.quality.minimumDetJAtControlPoints,
    qJDeterminantRatio: mesh.quality.qJDeterminantRatio,
    minimumScaledJacobian: mesh.quality.minimumScaledJacobian,
    maximumAspectRatio: mesh.quality.maximumAspectRatio,
    maximumHotspotAspectRatio: mesh.quality.maximumHotspotAspectRatio,
    midsidePlacementResidual: mesh.quality.midsidePlacementResidual,
    accepted: mesh.quality.accepted,
  };
  const radial = displacement[2 * probeIndex];
  const axial = displacement[2 * probeIndex + 1];
  const solver = {
    ...FLANGE_HUB_SOLVER_POLICY,
    freeDofCount: solution.vector.length,
    constrainedDofCount: constrainedDofs.length,
    reducedNonzeroCount: reducedRows.reduce((s, r) => s + r.values.length, 0),
    iterations: solution.iterations,
    residualNorm: solution.residualNorm,
    relativeResidual: solution.relativeResidual,
    recursiveResidualNorm: solution.recursiveResidualNorm,
    explicitResidualNorm: solution.explicitResidualNorm,
    residualReplacementCount: solution.residualReplacementCount,
  };
  const payload = {
    schema: 'flange-hub-balanced-1p5-screen-result/v1',
    mode: 'NON_AUTHORIZING_PRODUCTION_CANDIDATE_SCREEN',
    moduleId: 'C2D-FLANGE-HUB', levelId: mesh.levelId, loadCaseId, geometryHash: mesh.geometryHash,
    mesh: { meshFamilyId: mesh.meshFamilyId, meshHash: mesh.meshHash, canonicalModelHash: mesh.canonicalModelHash, nodeCount: mesh.nodeCount, elementCount: mesh.elementCount, globalH: mesh.globalH, blocks: mesh.blocks.map((b) => ({ blockId: b.blockId, longitudinalElementCount: b.longitudinalElementCount, transverseElementCount: b.transverseElementCount })), quality, qualitySummaryHash: semanticHash(quality) },
    solver, solverHistoryHash: semanticHash(solver),
    load: { loadDefinitionHash: loadDefinition.semanticHash, edgeCount: loadEvidence.edges.length, totalQuadratureResultant: loadEvidence.totalQuadratureResultant, totalNodalResultant: loadEvidence.totalNodalResultant, normalizedMismatch: loadEvidence.normalizedMismatch, circumferenceAppliedExactlyOnce: loadEvidence.circumferenceAppliedExactlyOnce },
    probe: { probeId: 'P-HUB-MID', coordinate: { r: 62.75, z: 30 }, nodeId: probeNode.nodeId, nodeOwnership: probeNode.ownership, selector: 'POSITIVE_Z_SIDE_OF_Z30_INTERFACE', expectedBlockId: 'FH-B04', adjacentElements, selectedOwnerElementIds: selectedOwners, radial, axial, displacementVectorNorm: Math.hypot(radial, axial) },
    patch: { patchId: 'FH-B03-B04-PATCH-Z26P25-Z35-V1', elementCount: patchIds.length, selectionHash: semanticHash(patchIds), strainEnergy: patchEnergy, fractionOfTotalStrainEnergy: patchEnergy / strainEnergy },
    equilibrium: { appliedAxial, axialReaction, axialForceImbalance, generalizedRadialLoad: loadEvidence.totalQuadratureResultant.radial, accepted: axialForceImbalance <= 1e-8 },
    energy: { strainEnergy, externalWork, constraintWork: 0, energyRelativeDifference, accepted: energyRelativeDifference <= 1e-8 },
    residual: { freeResidualNorm: freeResidual, freeResidualRelative, accepted: freeResidualRelative <= 1e-10 },
    reactions: { count: reactions.length, axialReaction, summaryHash: semanticHash(reactions.map(({ dof: _dof, ...row }) => row)) },
    authority: { flangeHubApplicationProcedureQualified: false, flangeHubNumericalOutputQualified: false, productionMeshSelected: false, bb12Authorized: false, codeAssessmentQualified: false, moduleQualified: false, applicationModulePromoted: false, productionSwitchAuthorized: false },
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}`;
}

function once(source, target, replacement) {
  const first = source.indexOf(target);
  assert.notEqual(first, -1, `BB11_PATCH_TARGET_MISSING:${target.slice(0, 80)}`);
  assert.equal(first, source.lastIndexOf(target), `BB11_PATCH_TARGET_AMBIGUOUS:${target.slice(0, 80)}`);
  return source.slice(0, first) + replacement + source.slice(first + target.length);
}
function assertBounded(d, levelId, loadCaseId) {
  assert.equal(d.schema, 'flange-hub-balanced-1p5-screen-result/v1');
  assert.equal(d.levelId, levelId);
  assert.equal(d.loadCaseId, loadCaseId);
  assert.equal(d.mesh.quality.accepted && d.equilibrium.accepted && d.energy.accepted && d.residual.accepted, true);
  assert.equal(d.authority.bb12Authorized, false);
  assert.ok(Buffer.byteLength(JSON.stringify(d)) <= MAX_BYTES, 'BB11_SCREEN_PAYLOAD_TOO_LARGE');
}
function authorityFalse() {
  return { flangeHubApplicationProcedureQualified: false, flangeHubNumericalOutputQualified: false, productionMeshSelected: false, bb12Authorized: false, codeAssessmentQualified: false, moduleQualified: false, applicationModulePromoted: false, productionSwitchAuthorized: false };
}
function sha256Text(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value)}\n`); }
