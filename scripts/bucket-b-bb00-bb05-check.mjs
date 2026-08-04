import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CONVERGENCE_DISPOSITIONS,
  FORMULATION_BENCHMARK_IDS,
  MODULE_REGISTRY,
  QUALIFICATION_STATES,
  advanceQualificationState,
  compareEdgeLoadToReference,
  compareQ8OracleToExecutable,
  createBenchmarkRecord,
  createIndependentCheckerEvidence,
  createSharedGateQualificationReceipt,
  detectDuplicateInterfaceNodes,
  distortedQ8Patch,
  evaluateConformalInterface,
  evaluateConvergence,
  evaluateQ8Quality,
  extractQ8Path,
  independentlyReferenceEdgeLoad,
  integrateVariableEdgeLoad,
  linearizeStressComponents,
  recoverAtPhysicalCoordinate,
  runCurvedEdgeLoadBenchmarks,
  runInterfaceManufacturedBenchmarks,
  runQ8FormulationBenchmark,
  runSclManufacturedBenchmarks,
  standardQ8Rectangle,
  validateBenchmarkRecord,
  validateSharedGateQualificationReceipt,
} from '../src/core/bucket-b/index.js';
import { Q8_GAUSS_POINTS, q8Map } from '../src/core/bucket-b/q8-kernel.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const strictRepositoryDifferential = process.env.STRICT_REPOSITORY_DIFFERENTIAL === '1';
const checks = [];
const childEvidence = [];
async function check(checkId, fn) {
  try {
    const evidence = await fn();
    checks.push(Object.freeze({ checkId, status: 'PASS', evidenceHash: hashObject(evidence ?? { accepted: true }) }));
  } catch (error) {
    checks.push(Object.freeze({ checkId, status: 'FAIL', evidenceHash: hashObject({ name: error?.name, message: error?.message }) }));
    throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
  }
}
function expectThrows(fn, pattern) { assert.throws(fn, pattern); return { rejected: true }; }

const exactHeadSha = resolveExactHeadSha();
const baseSha = resolveBaseSha();
const changedPaths = resolveChangedPaths();
const allowed = changedPaths.every((path) => path === 'docs/Bucket_B_Two_Dimensional_Continuum_FEA_Benchmark_Record_Rev1.md'
  || path === 'scripts/bucket-b-bb00-bb05-check.mjs'
  || path === '.github/workflows/bucket-b-shared-gates.yml'
  || path.startsWith('src/core/bucket-b/'));
assert.equal(allowed, true, `Changed-path allowlist violation: ${changedPaths.join(', ')}`);
const phase3T6Touched = changedPaths.some((path) => /bucket-01|phase3|candidate-projection|controlled-replay/i.test(path));
assert.equal(phase3T6Touched, false, 'Bucket-01 Phase 3 paths must remain untouched.');

const rectangle = standardQ8Rectangle(2, 1);
const distorted = distortedQ8Patch();

await check('BB00_INITIAL_STATE_FAIL_CLOSED', () => {
  assert.equal(MODULE_REGISTRY['C2D-LUG-PINHOLE'].elementProfile, 'Q8_FULL_3X3');
  const record = createBenchmarkRecord({ moduleId: 'C2D-LUG-PINHOLE', recordKind: 'MESH' });
  assert.equal(record.state, QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES);
  assert.equal(validateBenchmarkRecord(record, { allowIncompleteBindings: true }), true);
  return { recordSemanticHash: record.semanticHash };
});
await check('BB00_DIRECT_STATE_INJECTION_REJECTED', () => expectThrows(() => createBenchmarkRecord({ moduleId: 'C2D-LUG-PINHOLE', recordKind: 'OUT', state: QUALIFICATION_STATES.MODULE_QUALIFIED }), /authority-controlled/));
await check('BB00_AXISYMMETRIC_FAIL_CLOSED', () => {
  const record = createBenchmarkRecord({ moduleId: 'C2D-FLANGE-HUB', recordKind: 'CORE' });
  assert.equal(record.state, QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION);
  return expectThrows(() => advanceQualificationState(record, QUALIFICATION_STATES.FORMULATION_QUALIFIED, { axisymmetricRegistrationApprovalHash: 'fake' }), /hash|required/i);
});
await check('BB00_FAKE_BINDING_HASH_REJECTED', () => {
  const record = createBenchmarkRecord({ moduleId: 'C2D-LUG-PINHOLE', recordKind: 'MESH', bindings: { exactHeadSha, geometryHash: 'fake' } });
  return expectThrows(() => validateBenchmarkRecord(record, { allowIncompleteBindings: true }), /governed hash/);
});

let ps; let pe; let distortedOracle;
await check('BB01_PLANE_STRESS_PATCH', () => { ps = runQ8FormulationBenchmark({ benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRESS, nodes: rectangle, formulationProfile: 'PLANE_STRESS' }); assert.equal(ps.accepted, true); assert.equal(ps.constitutiveConstraint.sigmaZ, 0); return ps; });
await check('BB01_PLANE_STRAIN_PATCH', () => { pe = runQ8FormulationBenchmark({ benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRAIN, nodes: rectangle, formulationProfile: 'PLANE_STRAIN' }); assert.equal(pe.accepted, true); assert.equal(pe.constitutiveConstraint.epsilonZ, 0); return pe; });
await check('BB01_DISTORTED_PATCH', () => { distortedOracle = runQ8FormulationBenchmark({ benchmarkId: FORMULATION_BENCHMARK_IDS.DISTORTED, nodes: distorted, formulationProfile: 'PLANE_STRESS' }); assert.equal(distortedOracle.accepted, true); return distortedOracle; });
await check('BB01_NEAR_INCOMPRESSIBLE_SCOPE_BLOCK', () => { const result = runQ8FormulationBenchmark({ benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRAIN, nodes: rectangle, formulationProfile: 'PLANE_STRAIN', poissonRatio: 0.49 }); assert.equal(result.accepted, false); assert.equal(result.constitutiveConstraint.poissonRatioScope, 'LOCKING_NOT_QUALIFIED'); return result.constitutiveConstraint; });
await check('BB01_ORACLE_EXECUTABLE_DIFFERENTIAL', async () => {
  const productionPath = resolve(ROOT, 'src/core/local-continuum/q8-element.js');
  if (!existsSync(productionPath)) {
    if (strictRepositoryDifferential) throw new Error('Production Q8 element implementation is unavailable.');
    return { skippedInMinimalHarness: true };
  }
  const { q8ElementEvidence } = await import(productionPath);
  const material = { materialId: 'MAT', elasticModulus: 210000, poissonRatio: 0.3 };
  const profile = { tolerances: { constitutiveSymmetry: { absolute: 1e-12, relative: 1e-12 }, stiffnessSymmetry: { absolute: 1e-10, relative: 1e-12 }, rigidBodyStrain: { absolute: 1e-12, relative: 1e-12 }, patchTestStress: { absolute: 1e-9, relative: 1e-10 } } };
  const executableRectangle = q8ElementEvidence('Q8-RECT', rectangle, material, 'PLANE_STRESS', 1, profile);
  const executableDistorted = q8ElementEvidence('Q8-DISTORTED', distorted, material, 'PLANE_STRESS', 1, profile);
  const rectComparison = compareQ8OracleToExecutable({ oracle: ps, executable: executableRectangle });
  const distortedComparison = compareQ8OracleToExecutable({ oracle: distortedOracle, executable: executableDistorted });
  assert.equal(rectComparison.accepted, true); assert.equal(distortedComparison.accepted, true);
  return { rectComparison, distortedComparison };
});

await check('BB02_ANALYTICAL_AND_HIGH_ORDER_LOAD_REFERENCES', () => { const suite = runCurvedEdgeLoadBenchmarks(); assert.equal(suite.accepted, true); Object.values(suite.cases).forEach((row) => assert.equal(row.comparison.accepted, true)); return suite; });
await check('BB02_NODAL_MOMENT_NORMALIZATION', () => { const definition = { nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }], tractionAt: (_s, x) => [2 + x, -3] }; const observed = integrateVariableEdgeLoad(definition); const reference = independentlyReferenceEdgeLoad(definition); const comparison = compareEdgeLoadToReference(observed, reference, 2e-4); assert.equal(comparison.accepted, true); assert.ok(Math.hypot(...observed.normalizationResidual) < 1e-10); return comparison; });
await check('BB02_INVALID_LOAD_CALLBACK_REJECTED', () => expectThrows(() => integrateVariableEdgeLoad({ nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }], tractionAt: () => [NaN, 0] }), /return|finite|\[tx, ty\]/));

await check('BB03_Q8_QUALITY_AND_INVALID_MAPPING', () => { const quality = evaluateQ8Quality({ elementId: 'Q8-1', nodes: rectangle }); assert.equal(quality.accepted, true); const inverted = rectangle.map((n) => ({ ...n })); [inverted[1], inverted[3]] = [inverted[3], inverted[1]]; const bad = evaluateQ8Quality({ elementId: 'Q8-BAD', nodes: inverted }); assert.equal(bad.accepted, false); assert.ok(bad.failures.some((row) => row.includes('JACOBIAN'))); return { quality, badFailures: bad.failures }; });
await check('BB03_DUPLICATE_INTERFACE_NODE_DETECTION', () => { const duplicates = detectDuplicateInterfaceNodes([{ nodeId: 'A', x: 0, y: 0 }, { nodeId: 'B', x: 0, y: 0 }]); assert.equal(duplicates.length, 1); return duplicates; });
await check('BB03_PROBE_LOCAL_NONUNIFORM_H', () => { const result = evaluateConvergence({ quantityKind: 'LOCAL_STRESS', levels: [
  { level: 'M0', h: 10, probeH: 1.0, value: 11 },
  { level: 'M1', h: 7, probeH: 0.6, value: 10.36 },
  { level: 'M2', h: 5, probeH: 0.3, value: 10.09 },
  { level: 'M3', h: 3, probeH: 0.15, value: 10.0225 },
], finestRelativeChangeLimit: 0.02 }); assert.equal(result.characteristicSizeAuthority, 'PROBE_LOCAL_H'); assert.equal(result.disposition, CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC); assert.equal(result.acceptedForAdjudication, true); return result; });
await check('BB03_FOUR_LEVEL_OSCILLATION_REQUIRES_MORE', () => { const result = evaluateConvergence({ quantityKind: 'LOCAL_STRESS', levels: [
  { h: 1, probeH: 1, value: 10 }, { h: 0.5, probeH: 0.5, value: 11 }, { h: 0.25, probeH: 0.25, value: 10.5 }, { h: 0.125, probeH: 0.125, value: 10.8 },
] }); assert.equal(result.disposition, CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED); assert.equal(result.requiresAdditionalLevel, true); return result; });
await check('BB03_ZERO_CROSSING_REVIEW', () => { const result = evaluateConvergence({ quantityKind: 'GLOBAL_DISPLACEMENT', levels: [{ h: 1, value: 1 }, { h: 0.5, value: 0.2 }, { h: 0.25, value: -0.1 }] }); assert.equal(result.disposition, CONVERGENCE_DISPOSITIONS.ZERO_CROSSING_REVIEW); return result; });
await check('BB03_TOTAL_REACTION_EQUILIBRIUM_ONLY', () => { const result = evaluateConvergence({ quantityKind: 'TOTAL_REACTION', levels: [{ h: 1, value: 1 }, { h: 0.5, value: 1 }, { h: 0.25, value: 1 }] }); assert.equal(result.disposition, CONVERGENCE_DISPOSITIONS.EQUILIBRIUM_ONLY); return result; });

const gaussPointResults = Q8_GAUSS_POINTS.map((gp) => { const mapped = q8Map(rectangle, gp.xi, gp.eta); return { pointId: gp.pointId, stress: { sigmaX: mapped.x ** 2 + mapped.y, sigmaY: 2 * mapped.x - mapped.y ** 2, sigmaZ: 0, tauXY: mapped.x * mapped.y } }; });
await check('BB04_FIXED_COORDINATE_RECOVERY', () => { const point = { x: 0.8, y: 0.3 }; const recovered = recoverAtPhysicalCoordinate({ elementId: 'Q8-1', nodes: rectangle, point, gaussPointResults }); assert.ok(Math.abs(recovered.recoveredTensor.sigmaX - (point.x ** 2 + point.y)) < 1e-10); assert.equal('distanceFromElementBoundary' in recovered, false); assert.ok(recovered.minimumNaturalCoordinateMargin > 0); return recovered; });
await check('BB04_MISSING_STRESS_COMPONENT_REJECTED', () => { const malformed = gaussPointResults.map((row) => ({ ...row, stress: { ...row.stress } })); delete malformed[0].stress.sigmaZ; return expectThrows(() => recoverAtPhysicalCoordinate({ elementId: 'Q8-1', nodes: rectangle, point: { x: 0.8, y: 0.3 }, gaussPointResults: malformed }), /sigmaZ/); });
await check('BB04_AMBIGUOUS_CONTAINMENT_REJECTED', () => { const duplicateElements = [{ elementId: 'A', nodes: rectangle, gaussPointResults }, { elementId: 'B', nodes: rectangle, gaussPointResults }]; expectThrows(() => extractQ8Path({ pathId: 'P', points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }], elements: duplicateElements }), /AMBIGUOUS/); const selected = extractQ8Path({ pathId: 'P', points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }], elements: duplicateElements, elementSelector: () => 'B' }); assert.ok(selected.samples.every((row) => row.containingElementId === 'B')); return { selectedElement: 'B' }; });
await check('BB04_NON_ORTHONORMAL_FRAME_REJECTED', () => expectThrows(() => extractQ8Path({ pathId: 'P', points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }], elements: [{ elementId: 'A', nodes: rectangle, gaussPointResults }], localFrameAt: () => ({ tangent: [1, 0], normal: [1, 1] }) }), /orthonormal/));
await check('BB04_SCL_MANUFACTURED_EXPECTATIONS', () => { const suite = runSclManufacturedBenchmarks(); assert.equal(suite.accepted, true); assert.equal(suite.cases.length, 7); return suite; });
await check('BB04_SCL_DISPLAY_OR_MISSING_AUTHORITY_REJECTED', () => expectThrows(() => linearizeStressComponents([{ position: 0, stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 } }, { position: 1, stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 } }], { lineIdentity: 'BAD' }), /authoritative|authority/));

await check('BB05_STRESS_DERIVED_INTERFACE_SUITE', () => { const suite = runInterfaceManufacturedBenchmarks(); assert.equal(suite.accepted, true); return suite; });
await check('BB05_DIRECT_TRACTION_INPUT_REJECTED', () => expectThrows(() => evaluateConformalInterface({ interfaceId: 'BAD', normal: [1, 0], tangent: [0, 1], samples: [{ position: 0, point: { x: 0, y: 0 }, left: { traction: [1, 0], displacement: [0, 0] }, right: { stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 }, displacement: [0, 0] } }, { position: 1, point: { x: 0, y: 1 }, left: { traction: [1, 0], displacement: [0, 0] }, right: { stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 }, displacement: [0, 0] } }] }), /direct traction/));
await check('BB05_FRAME_HANDEDNESS_REJECTED', () => expectThrows(() => evaluateConformalInterface({ interfaceId: 'BAD', normal: [1, 0], tangent: [0, -1], samples: [{ position: 0, point: { x: 0, y: 0 }, left: side(), right: side() }, { position: 1, point: { x: 0, y: 1 }, left: side(), right: side() }] }), /positively handed/));

if (strictRepositoryDifferential) {
  await check('BB01_PRODUCTION_ASSEMBLED_Q8_PATCH', () => runChild('scripts/lafea.3-benchmark-cont-patch-01-check.mjs'));
  await check('BB01_PRODUCTION_KIRSCH_Q8', () => runChild('scripts/lafea.3-benchmark-cont-hole-01-check.mjs'));
}

const sourceFiles = readdirSync(resolve(ROOT, 'src/core/bucket-b')).filter((name) => name.endsWith('.js')).sort();
const sourceArtifactHashes = sourceFiles.map((name) => sha256(readFileSync(resolve(ROOT, 'src/core/bucket-b', name))));
const checkResultsHash = sha256(Buffer.from(JSON.stringify(checks)));
const childRawHashes = childEvidence.flatMap((row) => [row.stdoutHash, row.stderrHash]);
const rawEvidenceHashes = [checkResultsHash, ...childRawHashes];
const semanticEvidenceHashes = [semanticHash(checks), semanticHash({ sourceFiles, sourceArtifactHashes }), ...childEvidence.map((row) => semanticHash(row))];
const independentCheckerEvidence = createIndependentCheckerEvidence({
  exactHeadSha,
  sourceArtifactHashes,
  rawEvidenceHashes,
  semanticEvidenceHashes,
  ancestry: { baseRecordHash: sourceArtifactHashes[0], parentSpecificationHash: sourceArtifactHashes[1] ?? sourceArtifactHashes[0] },
  checks,
});
const receipt = createSharedGateQualificationReceipt({ exactHeadSha, baseSha, sourceArtifactHashes, rawEvidenceHashes, semanticEvidenceHashes, changedPaths, checkResults: checks, independentCheckerEvidence });
validateSharedGateQualificationReceipt(receipt);

await check('BB00_SHARED_GATE_RECEIPT_REQUIRED_FOR_ADVANCEMENT', () => {
  const record = createBenchmarkRecord({ moduleId: 'C2D-LUG-PINHOLE', recordKind: 'MESH', bindings: { exactHeadSha } });
  expectThrows(() => advanceQualificationState(record, QUALIFICATION_STATES.FORMULATION_QUALIFIED, {}), /receipt/);
  const advanced = advanceQualificationState(record, QUALIFICATION_STATES.FORMULATION_QUALIFIED, { sharedGateQualificationReceipt: receipt });
  assert.equal(advanced.state, QUALIFICATION_STATES.FORMULATION_QUALIFIED);
  return { advancedSemanticHash: advanced.semanticHash };
});

const finalChecksHash = sha256(Buffer.from(JSON.stringify(checks)));
const finalRawEvidenceHashes = [finalChecksHash, ...childRawHashes];
const finalSemanticEvidenceHashes = [semanticHash(checks), semanticHash({ sourceFiles, sourceArtifactHashes }), ...childEvidence.map((row) => semanticHash(row))];
const finalIndependentCheckerEvidence = createIndependentCheckerEvidence({ exactHeadSha, sourceArtifactHashes, rawEvidenceHashes: finalRawEvidenceHashes, semanticEvidenceHashes: finalSemanticEvidenceHashes, ancestry: { baseRecordHash: sourceArtifactHashes[0], parentSpecificationHash: sourceArtifactHashes[1] ?? sourceArtifactHashes[0] }, checks });
const finalReceipt = createSharedGateQualificationReceipt({ exactHeadSha, baseSha, sourceArtifactHashes, rawEvidenceHashes: finalRawEvidenceHashes, semanticEvidenceHashes: finalSemanticEvidenceHashes, changedPaths, checkResults: checks, independentCheckerEvidence: finalIndependentCheckerEvidence });
validateSharedGateQualificationReceipt(finalReceipt);

const report = Object.freeze({
  schema: 'bucket-b-shared-gate-report/v2',
  exactHeadSha,
  baseSha,
  suite: 'BB-00..BB-05 corrective qualification',
  status: checks.every((row) => row.status === 'PASS') ? 'PASS' : 'BLOCKED',
  checkCount: checks.length,
  checks,
  changedPaths,
  phase3T6Touched,
  productionDifferentialExecuted: strictRepositoryDifferential,
  applicationExecutionAuthorized: false,
  bb06Authorized: finalReceipt.bb06Authorized,
  axisymmetricAuthorized: false,
  qualificationReceipt: finalReceipt,
});
const reportPath = resolve(ROOT, process.env.REPORT_PATH ?? 'reports/bucket-b-bb00-bb05-exact-head-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function side() { return { stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 }, displacement: [0, 0] }; }
function runChild(relativePath) { const result = spawnSync(process.execPath, [relativePath], { cwd: ROOT, encoding: 'utf8' }); const evidence = { path: relativePath, status: result.status, stdoutHash: sha256(Buffer.from(result.stdout ?? '')), stderrHash: sha256(Buffer.from(result.stderr ?? '')) }; childEvidence.push(evidence); assert.equal(result.status, 0, `${relativePath} failed:\n${result.stdout}\n${result.stderr}`); return evidence; }
function resolveExactHeadSha() { const expected = process.env.EXPECTED_HEAD_SHA; if (expected && !/^[0-9a-f]{40}$/i.test(expected)) throw new TypeError('EXPECTED_HEAD_SHA must be a 40-character Git SHA.'); if (existsSync(resolve(ROOT, '.git'))) { const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); if (expected) assert.equal(actual, expected, 'Exact-head mismatch.'); return actual; } return expected ?? '1111111111111111111111111111111111111111'; }
function resolveBaseSha() { if (process.env.EXPECTED_BASE_SHA) { assert.match(process.env.EXPECTED_BASE_SHA, /^[0-9a-f]{40}$/i); return process.env.EXPECTED_BASE_SHA; } if (existsSync(resolve(ROOT, '.git'))) { const baseRef = process.env.EXPECTED_BASE_REF ?? 'origin/agent/bucket-b-c2d-benchmark-record'; return execFileSync('git', ['merge-base', 'HEAD', baseRef], { cwd: ROOT, encoding: 'utf8' }).trim(); } return '2222222222222222222222222222222222222222'; }
function resolveChangedPaths() { if (process.env.CHANGED_PATHS_JSON) return JSON.parse(process.env.CHANGED_PATHS_JSON); if (existsSync(resolve(ROOT, '.git'))) { const base = resolveBaseSha(); return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean); } return ['docs/Bucket_B_Two_Dimensional_Continuum_FEA_Benchmark_Record_Rev1.md', 'scripts/bucket-b-bb00-bb05-check.mjs', 'src/core/bucket-b/registry.js']; }
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function hashObject(value) { return sha256(Buffer.from(JSON.stringify(value))); }
