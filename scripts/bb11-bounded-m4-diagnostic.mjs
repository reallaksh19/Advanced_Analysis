#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'reports', 'bb11-bounded-m4');
const TEMP_SOLVER = join(ROOT, 'src/core/bucket-b/.bb11-bounded-solver.mjs');
const TEMP_MESH = join(ROOT, 'src/core/bucket-b/.bb11-bounded-mesh.mjs');
const LEVELS = ['M0', 'M1', 'M2', 'M3'];
const CASES = ['FH-PRES-001', 'FH-AXIAL-001'];
const LIMIT = 0.005;
const MAX_BYTES = 256 * 1024;
mkdirSync(OUT, { recursive: true });

try {
  createTemporaryModules();
  const [{ createFlangeHubMesh }, { solveFlangeHubLoadCase }, diagnosticSolver] = await Promise.all([
    import(pathToFileURL(join(ROOT, 'src/core/bucket-b/flange-hub-mesh.js')).href),
    import(pathToFileURL(join(ROOT, 'src/core/bucket-b/flange-hub-solver.js')).href),
    import(pathToFileURL(TEMP_SOLVER).href),
  ]);
  const axial = new Map();
  const invariance = [];
  const started = process.hrtime.bigint();

  for (const levelId of LEVELS) {
    for (const loadCaseId of CASES) {
      const mesh = createFlangeHubMesh(levelId);
      const productionPath = join(OUT, `production-${levelId}-${loadCaseId}.json`);
      const diagnosticPath = join(OUT, `diagnostic-${levelId}-${loadCaseId}.json`);
      let production = solveFlangeHubLoadCase({ mesh, loadCaseId });
      writeFileSync(productionPath, JSON.stringify(production));
      const semanticHash = production.semanticHash;
      production = null;
      global.gc?.();

      let envelope = diagnosticSolver.solveFlangeHubLoadCaseDiagnostic({
        mesh,
        loadCaseId,
        returnDiagnosticEnvelope: true,
      });
      writeFileSync(diagnosticPath, JSON.stringify(envelope.fullResult));
      const comparison = await compare(productionPath, diagnosticPath);
      assert.equal(comparison.byteIdentical, true, `BB11_PRODUCTION_DRIFT:${levelId}:${loadCaseId}`);
      const bounded = {
        diagnostic: { ...envelope.boundedDiagnostic, productionFullResultSemanticHash: semanticHash },
        custody: {
          payloadBytes: Buffer.byteLength(JSON.stringify(envelope.boundedDiagnostic)),
          maxRssKilobytes: process.resourceUsage().maxRSS,
        },
      };
      assertBounded(bounded, levelId, loadCaseId);
      writeJson(join(OUT, `bounded-${levelId}-${loadCaseId}.json`), bounded);
      invariance.push({ levelId, loadCaseId, ...comparison, semanticHash });
      if (loadCaseId === 'FH-AXIAL-001') axial.set(levelId, bounded);
      envelope = null;
      rmSync(productionPath, { force: true });
      rmSync(diagnosticPath, { force: true });
      global.gc?.();
    }
  }

  const { createFlangeHubMesh: createDiagnosticMesh } = await import(pathToFileURL(TEMP_MESH).href);
  const m4Mesh = createDiagnosticMesh('M4');
  const m4Started = process.hrtime.bigint();
  const m4Diagnostic = diagnosticSolver.solveFlangeHubLoadCaseDiagnostic({
    mesh: m4Mesh,
    loadCaseId: 'FH-AXIAL-001',
    diagnosticOnly: true,
  });
  const m4 = {
    diagnostic: m4Diagnostic,
    custody: {
      elapsedMilliseconds: Number(process.hrtime.bigint() - m4Started) / 1e6,
      maxRssKilobytes: process.resourceUsage().maxRSS,
      payloadBytes: Buffer.byteLength(JSON.stringify(m4Diagnostic)),
      nodeVersion: process.version,
    },
  };
  assertBounded(m4, 'M4', 'FH-AXIAL-001');
  writeJson(join(OUT, 'bounded-M4-FH-AXIAL-001.json'), m4);
  axial.set('M4', m4);

  const { evaluateConvergence } = await import(pathToFileURL(join(ROOT, 'src/core/bucket-b/convergence.js')).href);
  const sharedClassification = evaluateConvergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels: ['M1', 'M2', 'M3', 'M4'].map((level) => ({
      level,
      h: axial.get(level).diagnostic.mesh.globalH,
      value: axial.get(level).diagnostic.probe.displacementVectorNorm,
    })),
    requireFourLevels: true,
    finestRelativeChangeLimit: LIMIT,
    boundedOscillationRelativeLimit: LIMIT,
    qualifiedTailRelativeLimit: LIMIT,
  });
  const m3Norm = axial.get('M3').diagnostic.probe.displacementVectorNorm;
  const m4Norm = axial.get('M4').diagnostic.probe.displacementVectorNorm;
  const physicalTail = Math.abs(m4Norm - m3Norm) / Math.max(Math.abs(m3Norm), Math.abs(m4Norm), 1e-9);
  const hard = new Set(['OSCILLATORY', 'REFERENCE_ERROR_FAILURE', 'EQUILIBRIUM_ONLY']);
  const payload = {
    schema: 'bucket-b-bb11-bounded-m4-axial-tail-diagnostic/v1',
    mode: 'NON_AUTHORIZING_DIAGNOSTIC',
    exactHeadSha: process.env.EXPECTED_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
    baseSha: process.env.EXPECTED_BASE_SHA ?? null,
    sourceCustody: {
      productionSolverPath: 'src/core/bucket-b/flange-hub-solver.js',
      productionMeshPath: 'src/core/bucket-b/flange-hub-mesh.js',
      productionSourceModified: false,
      temporaryModulesDeletedAfterRun: true,
    },
    productionInvariance: {
      requiredLevels: LEVELS,
      requiredLoadCases: CASES,
      allByteIdentical: invariance.every((row) => row.byteIdentical),
      rows: invariance,
    },
    axialTail: {
      values: ['M0', 'M1', 'M2', 'M3', 'M4'].map((levelId) => ({
        levelId,
        radial: axial.get(levelId).diagnostic.probe.radial,
        axial: axial.get(levelId).diagnostic.probe.axial,
        displacementVectorNorm: axial.get(levelId).diagnostic.probe.displacementVectorNorm,
        meshHash: axial.get(levelId).diagnostic.mesh.meshHash,
        patchStrainEnergy: axial.get(levelId).diagnostic.patch.strainEnergy,
      })),
      m3ToM4PhysicalTailChange: physicalTail,
      physicalTailLimit: LIMIT,
      physicalTailAccepted: physicalTail <= LIMIT,
      sharedClassification,
      hardSharedFailure: hard.has(sharedClassification.disposition),
      acceptedForMeshPlanning: physicalTail <= LIMIT
        && sharedClassification.acceptedForAdjudication === true
        && !hard.has(sharedClassification.disposition),
    },
    m4Diagnostic: m4,
    runtime: {
      elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6,
      maxRssKilobytes: process.resourceUsage().maxRSS,
    },
    authority: authorityFalse(),
  };
  const report = { ...payload, artifactSha256: sha256Text(JSON.stringify(payload)) };
  writeJson(join(OUT, 'bb11-bounded-m4-axial-tail-report.json'), report);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  rmSync(TEMP_SOLVER, { force: true });
  rmSync(TEMP_MESH, { force: true });
}

function createTemporaryModules() {
  let solver = readFileSync(join(ROOT, 'src/core/bucket-b/flange-hub-solver.js'), 'utf8');
  solver = once(solver,
    'export function solveFlangeHubLoadCase({ mesh, loadCaseId } = {}) {',
    `export function solveFlangeHubLoadCaseDiagnostic({\n  mesh,\n  loadCaseId,\n  diagnosticOnly = false,\n  returnDiagnosticEnvelope = false,\n} = {}) {`);
  solver = once(solver, '  const elementKernels = new Map();\n', '');
  solver = once(solver, '    elementKernels.set(element.elementId, kernel);\n', '');
  solver = once(solver,
    '  const nodalDisplacements = nodes.map((node, index) => deepFreeze({\n',
    `  const boundedDiagnostic = createBoundedDiagnosticResult({ mesh, loadCaseId, loadDefinition, loadEvidence, nodes, nodesById, nodeIndex, displacement, constrainedDofs, reactions, reducedRows, solution, strainEnergy, externalWork, energyRelativeDifference, appliedAxial, axialReaction, axialForceImbalance, freeResidual, freeResidualRelative });\n  if (diagnosticOnly) return boundedDiagnostic;\n\n  const nodalDisplacements = nodes.map((node, index) => deepFreeze({\n`);
  solver = once(solver,
    '  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });\n}\n\nfunction createReducedSparseRows',
    `  const fullResult = deepFreeze({ ...payload, semanticHash: semanticHash(payload) });\n  return returnDiagnosticEnvelope ? deepFreeze({ fullResult, boundedDiagnostic }) : fullResult;\n}\n\n${helper()}\n\nfunction createReducedSparseRows`);
  writeFileSync(TEMP_SOLVER, solver);

  let mesh = readFileSync(join(ROOT, 'src/core/bucket-b/flange-hub-mesh.js'), 'utf8');
  mesh = once(mesh,
    "export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-MESH-FAMILY-V1';",
    "export const FLANGE_HUB_MESH_FAMILY_ID = 'BKT-B-FLANGE-Q8-AXIAL-TAIL-DIAGNOSTIC-V1';");
  mesh = once(mesh,
    "  { levelId: 'M3', refinement: 8 },\n]);",
    "  { levelId: 'M3', refinement: 8 },\n  { levelId: 'M4', refinement: 16 },\n]);");
  writeFileSync(TEMP_MESH, mesh);
}

function helper() {
  return String.raw`function createBoundedDiagnosticResult(x) {
  const { mesh, loadCaseId, loadDefinition, loadEvidence, nodes, nodesById, nodeIndex, displacement, constrainedDofs, reactions, reducedRows, solution, strainEnergy, externalWork, energyRelativeDifference, appliedAxial, axialReaction, axialForceImbalance, freeResidual, freeResidualRelative } = x;
  const tol = 1e-9;
  const matches = nodes.filter((n) => Math.abs(n.r - 62.75) <= tol && Math.abs(n.z - 30) <= tol);
  if (matches.length !== 1) throw new RangeError('FH_DIAGNOSTIC_PROBE_NODE_NOT_UNIQUE');
  const probeNode = matches[0];
  const probeIndex = nodeIndex.get(probeNode.nodeId);
  const adjacentElements = mesh.elements.filter((e) => e.nodeIds.includes(probeNode.nodeId))
    .map((e) => ({ elementId: e.elementId, blockId: e.blockId }))
    .sort((a, b) => a.elementId.localeCompare(b.elementId));
  const selectedOwners = adjacentElements.filter((e) => e.blockId === 'FH-B04').map((e) => e.elementId);
  if (!selectedOwners.length) throw new RangeError('FH_DIAGNOSTIC_POSITIVE_Z_B04_OWNER_MISSING');
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
  if (!patchIds.length || !(patchEnergy > 0)) throw new RangeError('FH_DIAGNOSTIC_PATCH_ENERGY_MISSING');
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
    schema: 'flange-hub-bounded-diagnostic-result/v1',
    mode: 'NON_AUTHORIZING_DIAGNOSTIC',
    moduleId: 'C2D-FLANGE-HUB', levelId: mesh.levelId, loadCaseId, geometryHash: mesh.geometryHash,
    mesh: { meshFamilyId: mesh.meshFamilyId, meshHash: mesh.meshHash, canonicalModelHash: mesh.canonicalModelHash, nodeCount: mesh.nodeCount, elementCount: mesh.elementCount, globalH: mesh.globalH, quality, qualitySummaryHash: semanticHash(quality) },
    solver, solverHistoryHash: semanticHash(solver),
    load: { loadDefinitionHash: loadDefinition.semanticHash, edgeCount: loadEvidence.edges.length, totalQuadratureResultant: loadEvidence.totalQuadratureResultant, totalNodalResultant: loadEvidence.totalNodalResultant, normalizedMismatch: loadEvidence.normalizedMismatch, circumferenceAppliedExactlyOnce: loadEvidence.circumferenceAppliedExactlyOnce },
    probe: { probeId: 'P-HUB-MID', coordinate: { r: 62.75, z: 30 }, nodeId: probeNode.nodeId, nodeOwnership: probeNode.ownership, selector: 'POSITIVE_Z_SIDE_OF_Z30_INTERFACE', expectedBlockId: 'FH-B04', adjacentElements, selectedOwnerElementIds: selectedOwners, radial, axial, displacementVectorNorm: Math.hypot(radial, axial) },
    patch: { patchId: 'FH-B03-B04-PATCH-Z26P25-Z35-V1', physicalSelection: { blockIds: ['FH-B03', 'FH-B04'], minimumZ: 26.25, maximumZ: 35, fullRadialMaterial: true }, elementCount: patchIds.length, selectionHash: semanticHash(patchIds), firstElementId: patchIds[0], lastElementId: patchIds.at(-1), strainEnergy: patchEnergy, fractionOfTotalStrainEnergy: patchEnergy / strainEnergy },
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
  assert.notEqual(first, -1, `BB11_PATCH_TARGET_MISSING:${target.slice(0, 60)}`);
  assert.equal(first, source.lastIndexOf(target), `BB11_PATCH_TARGET_AMBIGUOUS:${target.slice(0, 60)}`);
  return source.slice(0, first) + replacement + source.slice(first + target.length);
}
function authorityFalse() {
  return { flangeHubApplicationProcedureQualified: false, flangeHubNumericalOutputQualified: false, productionMeshSelected: false, bb12Authorized: false, codeAssessmentQualified: false, moduleQualified: false, applicationModulePromoted: false, productionSwitchAuthorized: false };
}
function assertBounded(envelope, levelId, loadCaseId) {
  const d = envelope.diagnostic;
  assert.equal(d.schema, 'flange-hub-bounded-diagnostic-result/v1');
  assert.equal(d.mode, 'NON_AUTHORIZING_DIAGNOSTIC');
  assert.equal(d.levelId, levelId);
  assert.equal(d.loadCaseId, loadCaseId);
  assert.equal(d.mesh.quality.accepted && d.equilibrium.accepted && d.energy.accepted && d.residual.accepted, true);
  assert.equal(d.authority.bb12Authorized, false);
  assert.ok(Buffer.byteLength(JSON.stringify(d)) <= MAX_BYTES, 'BB11_DIAGNOSTIC_PAYLOAD_TOO_LARGE');
}
async function compare(left, right) {
  const [leftSha256, rightSha256] = await Promise.all([sha256File(left), sha256File(right)]);
  const leftBytes = statSync(left).size;
  const rightBytes = statSync(right).size;
  return { leftSha256, rightSha256, leftBytes, rightBytes, byteIdentical: leftBytes === rightBytes && leftSha256 === rightSha256 };
}
function sha256File(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', rejectPromise);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(`sha256:${hash.digest('hex')}`));
  });
}
function sha256Text(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value)}\n`); }
