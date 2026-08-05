import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
} from '../src/core/bucket-b/flange-hub-transition-candidate.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_PATH = path.join(
  ROOT,
  'src/core/bucket-b/bb11-flange-hub.js',
);
const ORACLE_SOURCE_PATH = path.join(
  ROOT,
  'src/core/bucket-b/flange-hub-independent-oracle.js',
);
const expectedHeadSha = requiredSha(
  process.env.EXPECTED_HEAD_SHA,
  'EXPECTED_HEAD_SHA',
);
const productionParentSha = requiredSha(
  process.env.BB11_PRODUCTION_PARENT_SHA,
  'BB11_PRODUCTION_PARENT_SHA',
);
const outputDirectory = path.resolve(
  ROOT,
  process.env.BB11_TRANSITION_FULL_OUTPUT_DIR
    ?? 'reports/bb11-transition-full',
);
const reportPath = path.join(
  outputDirectory,
  'bb11-b03-b04-transition-full-qualification.json',
);
const temporaryModulePath = path.join(
  ROOT,
  'src/core/bucket-b',
  `.bb11-transition-candidate-core-${process.pid}.mjs`,
);
const temporaryOraclePath = path.join(
  ROOT,
  'src/core/bucket-b',
  `.bb11-transition-candidate-oracle-${process.pid}.mjs`,
);

const governedMeshImport = `import {
  createFlangeHubMesh,
  FLANGE_HUB_MESH_LEVELS,
} from './flange-hub-mesh.js';`;
const candidateMeshImport = `import {
  createFlangeHubTransitionCandidateMesh as createFlangeHubMesh,
  FLANGE_HUB_TRANSITION_CANDIDATE_LEVELS as FLANGE_HUB_MESH_LEVELS,
} from './flange-hub-transition-candidate.js';`;
const governedOracleImport =
  "import { runIndependentFlangeHubOracle } from './flange-hub-independent-oracle.js';";
const candidateOracleImport =
  `import { runIndependentFlangeHubOracle } from './${path.basename(temporaryOraclePath)}';`;
const governedOracleBlockMap = `function blockMap(block) {
  const outer = profile(block.profile);
  if (block.kind === 'STRIP') {
    return (u, v) => {`;
const correctedOracleBlockMap = `function blockMap(block) {
  if (block.kind === 'STRIP') {
    const outer = profile(block.profile);
    return (u, v) => {`;
const governedOracleCurvatureGuard = `    const product = multiply(direction);
    const curvature = dot(direction, product);
    if (!Number.isFinite(curvature) || !(curvature > 0)) {
      throw new RangeError('ORACLE_NONPOSITIVE_PCG_CURVATURE');
    }
    const alpha = residualPreconditioned / curvature;`;
const correctedOracleCurvatureGuard = `    let product = multiply(direction);
    let curvature = dot(direction, product);
    if (!Number.isFinite(curvature) || !(curvature > 0)) {
      const certified = explicitResidual(multiply, rhs, x);
      explicitResidualNorm = norm(certified);
      if (explicitResidualNorm <= tolerance) {
        return {
          x,
          iterations: iteration - 1,
          relativeResidual: explicitResidualNorm / denominator,
          explicitResidualNorm,
          residualReplacementCount,
        };
      }
      residualVector = certified;
      z = precondition(residualVector);
      direction = Float64Array.from(z);
      residualPreconditioned = dot(residualVector, z);
      if (!Number.isFinite(residualPreconditioned)
        || !(residualPreconditioned > 0)) {
        throw new RangeError('ORACLE_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
      }
      product = multiply(direction);
      curvature = dot(direction, product);
      if (!Number.isFinite(curvature) || !(curvature > 0)) {
        throw new RangeError('ORACLE_NONPOSITIVE_PCG_CURVATURE_AFTER_RESTART');
      }
      residualReplacementCount += 1;
      bestResidualNorm = explicitResidualNorm;
      lastMaterialImprovement = iteration;
    }
    const alpha = residualPreconditioned / curvature;`;

await mkdir(outputDirectory, { recursive: true });
const source = await readFile(SOURCE_PATH, 'utf8');
const oracleSource = await readFile(ORACLE_SOURCE_PATH, 'utf8');
assert.equal(
  occurrences(source, governedMeshImport),
  1,
  'BB11_TRANSITION_GOVERNED_MESH_IMPORT_COUNT',
);
assert.equal(
  occurrences(source, governedOracleImport),
  1,
  'BB11_TRANSITION_GOVERNED_ORACLE_IMPORT_COUNT',
);
assert.equal(
  occurrences(oracleSource, governedOracleBlockMap),
  1,
  'BB11_TRANSITION_GOVERNED_ORACLE_BLOCK_MAP_COUNT',
);
assert.equal(
  occurrences(oracleSource, governedOracleCurvatureGuard),
  1,
  'BB11_TRANSITION_GOVERNED_ORACLE_CURVATURE_GUARD_COUNT',
);
let correctedOracleSource = oracleSource.replace(
  governedOracleBlockMap,
  correctedOracleBlockMap,
);
correctedOracleSource = correctedOracleSource.replace(
  governedOracleCurvatureGuard,
  correctedOracleCurvatureGuard,
);
assert.notEqual(
  correctedOracleSource,
  oracleSource,
  'BB11_TRANSITION_ORACLE_CONTROL_FLOW_NOT_CORRECTED',
);
let transformed = source.replace(governedMeshImport, candidateMeshImport);
transformed = transformed.replace(governedOracleImport, candidateOracleImport);
assert.notEqual(transformed, source, 'BB11_TRANSITION_IMPORTS_NOT_REPLACED');
await writeFile(temporaryOraclePath, correctedOracleSource, 'utf8');
await writeFile(temporaryModulePath, transformed, 'utf8');

let first;
let second;
try {
  first = runCoreChild(temporaryModulePath);
  second = runCoreChild(temporaryModulePath);
} finally {
  await rm(temporaryModulePath, { force: true });
  await rm(temporaryOraclePath, { force: true });
}

await writeFile(
  path.join(outputDirectory, 'candidate-core-a.stdout.json'),
  first.stdout,
  'utf8',
);
await writeFile(
  path.join(outputDirectory, 'candidate-core-a.stderr.log'),
  first.stderr,
  'utf8',
);
await writeFile(
  path.join(outputDirectory, 'candidate-core-b.stdout.json'),
  second.stdout,
  'utf8',
);
await writeFile(
  path.join(outputDirectory, 'candidate-core-b.stderr.log'),
  second.stderr,
  'utf8',
);

assert.equal(first.status, 0, first.stderr || first.error?.stack);
assert.equal(second.status, 0, second.stderr || second.error?.stack);
assert.equal(
  first.stdout,
  second.stdout,
  'BB11_TRANSITION_CORE_STDOUT_NOT_BYTE_IDENTICAL',
);
assert.equal(
  first.stderr,
  second.stderr,
  'BB11_TRANSITION_CORE_STDERR_NOT_BYTE_IDENTICAL',
);

const core = JSON.parse(first.stdout);
assert.equal(core.schema, 'bucket-b-bb11-core-qualification/v1');
assert.equal(core.status, 'BB11_CORE_NUMERICAL_EVIDENCE_PASS');
assert.equal(core.applicationProcedureAccepted, true);
assert.equal(core.numericalOutputAccepted, true);
assert.equal(core.semanticHash, semanticHash(withoutHash(core)));
assert.equal(
  core.meshEvidence.meshFamilyId,
  FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
);
assert.equal(core.meshEvidence.levels.length, 4);
assert.equal(core.meshEvidence.qualified, true);
core.meshEvidence.levels.forEach((level) => {
  assert.equal(level.quality.accepted, true);
});
assert.ok(core.checkResults.length > 0);
core.checkResults.forEach((row) => assert.equal(row.status, 'PASS'));
assert.deepEqual(core.authority, {
  codeAssessmentQualified: false,
  moduleQualified: false,
  applicationModulePromoted: false,
  productionSwitchAuthorized: false,
  bucket01Qualified: 'UNCHANGED',
});

const prerequisites = await readPrerequisites(expectedHeadSha);
const payload = {
  schema: 'bb11-b03-b04-transition-full-qualification/v3',
  exactHeadSha: expectedHeadSha,
  productionParentSha,
  moduleId: 'C2D-FLANGE-HUB',
  meshFamilyId: FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  status: 'CANDIDATE_FULL_BB11_QUALIFICATION_PASS',
  decision: 'CANDIDATE_QUALIFIED_FOR_GOVERNED_PROMOTION_REVIEW',
  oracleCompatibilityCorrection: {
    classification: 'CANDIDATE_ONLY_NON_AUTHORIZING_ORACLE_ROBUSTNESS_CORRECTION',
    governedOracleSourceModified: false,
    corrections: [
      'DEFER_PROFILE_RESOLUTION_UNTIL_BLOCK_KIND_IS_STRIP',
      'CERTIFIED_RESIDUAL_RESTART_ON_NONPOSITIVE_PCG_CURVATURE',
    ],
    mechanicalInputsModified: false,
    oracleFormulationModified: false,
    oracleSolverControlFlowModified: true,
    productionPromotionBlockedUntilGovernedCorrectionLands: true,
    governedOracleSourceSha256: sha256(oracleSource),
    correctedOracleSourceSha256: sha256(correctedOracleSource),
  },
  deterministicReplay: {
    byteIdentical: true,
    stdoutSha256: sha256(first.stdout),
    stderrSha256: sha256(first.stderr),
    stdoutBytes: Buffer.byteLength(first.stdout),
    stderrBytes: Buffer.byteLength(first.stderr),
  },
  prerequisites,
  coreEvidence: {
    semanticHash: core.semanticHash,
    geometryEvidenceHash: core.geometryEvidence.semanticHash,
    meshEvidenceHash: core.meshEvidence.semanticHash,
    coreEvidenceHash: core.coreEvidence.semanticHash,
    outputEvidenceHash: core.outputEvidence.semanticHash,
    independentEvidenceHash: core.independentEvidence.semanticHash,
    checkResults: core.checkResults,
    meshLevels: core.meshEvidence.levels,
    loadCaseConvergence: Object.fromEntries(
      Object.entries(core.outputEvidence.loadCases).map(
        ([loadCaseId, value]) => [loadCaseId, value.convergence],
      ),
    ),
  },
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
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  event: 'BB11_TRANSITION_FULL_QUALIFICATION_COMPLETED',
  exactHeadSha: expectedHeadSha,
  productionParentSha,
  meshFamilyId: FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  status: report.status,
  decision: report.decision,
  coreEvidenceHash: core.semanticHash,
  reportHash: report.semanticHash,
  reportPath: path.relative(ROOT, reportPath),
})}\n`);

function runCoreChild(modulePath) {
  const moduleUrl = pathToFileURL(modulePath).href;
  const program = [
    `import { runBb11FlangeHubCore } from ${JSON.stringify(moduleUrl)};`,
    'const result = runBb11FlangeHubCore();',
    'process.stdout.write(JSON.stringify(result));',
  ].join('\n');
  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', program],
    {
      cwd: ROOT,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      timeout: 25 * 60 * 1000,
    },
  );
}

async function readPrerequisites(headSha) {
  const shared = await readJsonEnv('BB11_BB00_BB05_REPORT_PATH');
  const bb06 = await readJsonEnv('BB11_BB06_REPORT_PATH');
  const bb07 = await readJsonEnv('BB11_BB07_REPORT_PATH');
  const bb08 = await readJsonEnv('BB11_BB08_REPORT_PATH');
  assert.equal(shared.qualificationReceipt.exactHeadSha, headSha);
  assert.equal(bb06.exactHeadSha, headSha);
  assert.equal(bb07.exactHeadSha, headSha);
  assert.equal(bb08.exactHeadSha, headSha);
  const bb10APath = requiredEnvPath('BB11_BB10_CORE_A_PATH');
  const bb10BPath = requiredEnvPath('BB11_BB10_CORE_B_PATH');
  const bb10A = await readFile(bb10APath, 'utf8');
  const bb10B = await readFile(bb10BPath, 'utf8');
  assert.equal(bb10A, bb10B, 'BB11_TRANSITION_BB10_CORE_NOT_BYTE_IDENTICAL');
  const bb10 = JSON.parse(bb10A);
  assert.equal(bb10.schema, 'bucket-b-bb10-core-evidence/v1');
  assert.equal(bb10.semanticHash, semanticHash(withoutHash(bb10)));
  bb10.cases.forEach((row) => assert.equal(row.status, 'PASS'));
  bb10.checkResults.forEach((row) => assert.equal(row.status, 'PASS'));
  return {
    bb00Bb05: {
      status: shared.qualificationReceipt.status,
      semanticHash: shared.qualificationReceipt.semanticHash,
    },
    bb06: { status: bb06.status, semanticHash: bb06.semanticHash },
    bb07: { status: bb07.status, semanticHash: bb07.semanticHash },
    bb08: { status: bb08.status, semanticHash: bb08.semanticHash },
    bb10: {
      schema: bb10.schema,
      semanticHash: bb10.semanticHash,
      stdoutSha256: sha256(bb10A),
      byteIdentical: true,
    },
  };
}

async function readJsonEnv(name) {
  return JSON.parse(await readFile(requiredEnvPath(name), 'utf8'));
}

function requiredEnvPath(name) {
  const value = process.env[name];
  if (!value) throw new TypeError(`BB11_TRANSITION_${name}_REQUIRED`);
  return path.resolve(ROOT, value);
}

function requiredSha(value, name) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? '')) {
    throw new TypeError(`BB11_TRANSITION_${name}_REQUIRED`);
  }
  return value.toLowerCase();
}

function occurrences(text, target) {
  return text.split(target).length - 1;
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...payload } = value;
  return payload;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
