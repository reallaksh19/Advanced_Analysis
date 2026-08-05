#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
} from './index.js';
import { Q8_GAUSS_POINTS, q8Map } from './q8-kernel.js';
import { semanticHash } from '../shared-piping-model/index.js';

const ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const GOVERNED_SHARED_NUMERICAL_PATHS = Object.freeze([
  'src/core/bucket-b/q8-kernel.js',
  'src/core/bucket-b/formulation-benchmarks.js',
  'src/core/bucket-b/variable-edge-load.js',
  'src/core/bucket-b/q8-quality.js',
  'src/core/bucket-b/convergence.js',
  'src/core/bucket-b/fixed-coordinate-recovery.js',
  'src/core/bucket-b/path-and-scl.js',
  'src/core/bucket-b/interface-resultants.js',
  'src/core/local-continuum/q8-element.js',
]);

const exactHeadSha = resolveExactHead();
const upstreamApprovedHeadSha = requiredSha(
  process.env.BB11_UPSTREAM_BB10_APPROVED_HEAD_SHA
    ?? 'bcd0add8859a08c322d23595f788a1f99afd539a',
  'BB11_UPSTREAM_BB10_APPROVED_HEAD_SHA',
);
assertGitAncestor(upstreamApprovedHeadSha, exactHeadSha);
const approvedManifest = blobManifest(
  upstreamApprovedHeadSha,
  GOVERNED_SHARED_NUMERICAL_PATHS,
);
const currentManifest = blobManifest(
  exactHeadSha,
  GOVERNED_SHARED_NUMERICAL_PATHS,
);
assert.deepEqual(
  currentManifest,
  approvedManifest,
  'BB-00 through BB-05 governed numerical source blobs changed.',
);

const checks = [];
async function check(checkId, operation) {
  try {
    const evidence = await operation();
    checks.push(Object.freeze({
      checkId,
      status: 'PASS',
      evidenceHash: sha256Json(evidence ?? true),
    }));
    return evidence;
  } catch (error) {
    checks.push(Object.freeze({
      checkId,
      status: 'FAIL',
      evidenceHash: sha256Json({
        name: error?.name,
        message: error?.message,
      }),
    }));
    throw new Error(`${checkId} failed: ${error?.stack ?? error}`);
  }
}
function expectThrows(operation, pattern) {
  assert.throws(operation, pattern);
  return { rejected: true };
}

const rectangle = standardQ8Rectangle(2, 1);
const distorted = distortedQ8Patch();

await check('BB11_REPLAY_BB00_INITIAL_STATE_FAIL_CLOSED', () => {
  assert.equal(
    MODULE_REGISTRY['C2D-LUG-PINHOLE'].elementProfile,
    'Q8_FULL_3X3',
  );
  const record = createBenchmarkRecord({
    moduleId: 'C2D-LUG-PINHOLE',
    recordKind: 'MESH',
  });
  assert.equal(
    record.state,
    QUALIFICATION_STATES.EXECUTION_BLOCKED_PENDING_SHARED_Q8_GATES,
  );
  assert.equal(
    validateBenchmarkRecord(record, { allowIncompleteBindings: true }),
    true,
  );
  return { recordSemanticHash: record.semanticHash };
});
await check('BB11_REPLAY_BB00_DIRECT_STATE_REJECTED', () => expectThrows(
  () => createBenchmarkRecord({
    moduleId: 'C2D-LUG-PINHOLE',
    recordKind: 'OUT',
    state: QUALIFICATION_STATES.MODULE_QUALIFIED,
  }),
  /authority-controlled/,
));
await check('BB11_REPLAY_BB00_AXISYMMETRIC_FAIL_CLOSED', () => {
  const record = createBenchmarkRecord({
    moduleId: 'C2D-FLANGE-HUB',
    recordKind: 'CORE',
  });
  assert.equal(
    record.state,
    QUALIFICATION_STATES.BLOCKED_PENDING_AXISYMMETRIC_REGISTRATION,
  );
  return expectThrows(
    () => advanceQualificationState(
      record,
      QUALIFICATION_STATES.FORMULATION_QUALIFIED,
      { axisymmetricRegistrationApprovalHash: 'fake' },
    ),
    /hash|required|receipt/i,
  );
});
await check('BB11_REPLAY_BB00_FAKE_BINDING_REJECTED', () => {
  const record = createBenchmarkRecord({
    moduleId: 'C2D-LUG-PINHOLE',
    recordKind: 'MESH',
    bindings: {
      exactHeadSha,
      geometryHash: 'fake',
    },
  });
  return expectThrows(
    () => validateBenchmarkRecord(record, { allowIncompleteBindings: true }),
    /governed hash/,
  );
});

let planeStress;
let distortedOracle;
await check('BB11_REPLAY_BB01_PLANE_STRESS_PATCH', () => {
  planeStress = runQ8FormulationBenchmark({
    benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRESS,
    nodes: rectangle,
    formulationProfile: 'PLANE_STRESS',
  });
  assert.equal(planeStress.accepted, true);
  assert.equal(planeStress.constitutiveConstraint.sigmaZ, 0);
  return planeStress;
});
await check('BB11_REPLAY_BB01_PLANE_STRAIN_PATCH', () => {
  const value = runQ8FormulationBenchmark({
    benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRAIN,
    nodes: rectangle,
    formulationProfile: 'PLANE_STRAIN',
  });
  assert.equal(value.accepted, true);
  assert.equal(value.constitutiveConstraint.epsilonZ, 0);
  return value;
});
await check('BB11_REPLAY_BB01_DISTORTED_PATCH', () => {
  distortedOracle = runQ8FormulationBenchmark({
    benchmarkId: FORMULATION_BENCHMARK_IDS.DISTORTED,
    nodes: distorted,
    formulationProfile: 'PLANE_STRESS',
  });
  assert.equal(distortedOracle.accepted, true);
  return distortedOracle;
});
await check('BB11_REPLAY_BB01_NEAR_INCOMPRESSIBLE_BLOCK', () => {
  const value = runQ8FormulationBenchmark({
    benchmarkId: FORMULATION_BENCHMARK_IDS.PLANE_STRAIN,
    nodes: rectangle,
    formulationProfile: 'PLANE_STRAIN',
    poissonRatio: 0.49,
  });
  assert.equal(value.accepted, false);
  assert.equal(
    value.constitutiveConstraint.poissonRatioScope,
    'LOCKING_NOT_QUALIFIED',
  );
  return value.constitutiveConstraint;
});
await check('BB11_REPLAY_BB01_EXECUTABLE_DIFFERENTIAL', async () => {
  const { q8ElementEvidence } = await import('../local-continuum/q8-element.js');
  const material = {
    materialId: 'MAT',
    elasticModulus: 210000,
    poissonRatio: 0.3,
  };
  const profile = {
    tolerances: {
      constitutiveSymmetry: { absolute: 1e-12, relative: 1e-12 },
      stiffnessSymmetry: { absolute: 1e-10, relative: 1e-12 },
      rigidBodyStrain: { absolute: 1e-12, relative: 1e-12 },
      patchTestStress: { absolute: 1e-9, relative: 1e-10 },
    },
  };
  const executableRectangle = q8ElementEvidence(
    'Q8-RECT',
    rectangle,
    material,
    'PLANE_STRESS',
    1,
    profile,
  );
  const executableDistorted = q8ElementEvidence(
    'Q8-DISTORTED',
    distorted,
    material,
    'PLANE_STRESS',
    1,
    profile,
  );
  const rectangleComparison = compareQ8OracleToExecutable({
    oracle: planeStress,
    executable: executableRectangle,
  });
  const distortedComparison = compareQ8OracleToExecutable({
    oracle: distortedOracle,
    executable: executableDistorted,
  });
  assert.equal(rectangleComparison.accepted, true);
  assert.equal(distortedComparison.accepted, true);
  return { rectangleComparison, distortedComparison };
});

await check('BB11_REPLAY_BB02_CURVED_EDGE_REFERENCES', () => {
  const suite = runCurvedEdgeLoadBenchmarks();
  assert.equal(suite.accepted, true);
  Object.values(suite.cases).forEach((row) => {
    assert.equal(row.comparison.accepted, true);
  });
  return suite;
});
await check('BB11_REPLAY_BB02_NODAL_MOMENT_NORMALIZATION', () => {
  const definition = {
    nodes: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ],
    tractionAt: (_s, x) => [2 + x, -3],
  };
  const observed = integrateVariableEdgeLoad(definition);
  const reference = independentlyReferenceEdgeLoad(definition);
  const comparison = compareEdgeLoadToReference(
    observed,
    reference,
    2e-4,
  );
  assert.equal(comparison.accepted, true);
  assert.ok(Math.hypot(...observed.normalizationResidual) < 1e-10);
  return comparison;
});
await check('BB11_REPLAY_BB02_INVALID_CALLBACK_REJECTED', () => (
  expectThrows(
    () => integrateVariableEdgeLoad({
      nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      tractionAt: () => [Number.NaN, 0],
    }),
    /return|finite|\[tx, ty\]/,
  )
));

await check('BB11_REPLAY_BB03_QUALITY_AND_INVALID_MAPPING', () => {
  const quality = evaluateQ8Quality({
    elementId: 'Q8-1',
    nodes: rectangle,
  });
  assert.equal(quality.accepted, true);
  const inverted = rectangle.map((node) => ({ ...node }));
  [inverted[1], inverted[3]] = [inverted[3], inverted[1]];
  const rejected = evaluateQ8Quality({
    elementId: 'Q8-BAD',
    nodes: inverted,
  });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.failures.some((row) => row.includes('JACOBIAN')));
  return {
    qualityHash: semanticHash(quality),
    rejectedFailures: rejected.failures,
  };
});
await check('BB11_REPLAY_BB03_DUPLICATE_INTERFACE_DETECTION', () => {
  const duplicates = detectDuplicateInterfaceNodes([
    { nodeId: 'A', x: 0, y: 0 },
    { nodeId: 'B', x: 0, y: 0 },
  ]);
  assert.equal(duplicates.length, 1);
  return duplicates;
});
await check('BB11_REPLAY_BB03_PROBE_LOCAL_H', () => {
  const result = evaluateConvergence({
    quantityKind: 'LOCAL_STRESS',
    levels: [
      { level: 'M0', h: 10, probeH: 1.0, value: 11 },
      { level: 'M1', h: 7, probeH: 0.6, value: 10.36 },
      { level: 'M2', h: 5, probeH: 0.3, value: 10.09 },
      { level: 'M3', h: 3, probeH: 0.15, value: 10.0225 },
    ],
    finestRelativeChangeLimit: 0.02,
  });
  assert.equal(result.characteristicSizeAuthority, 'PROBE_LOCAL_H');
  assert.equal(
    result.disposition,
    CONVERGENCE_DISPOSITIONS.PASS_ASYMPTOTIC,
  );
  assert.equal(result.acceptedForAdjudication, true);
  return result;
});
await check('BB11_REPLAY_BB03_OSCILLATION_REQUIRES_MORE', () => {
  const result = evaluateConvergence({
    quantityKind: 'LOCAL_STRESS',
    levels: [
      { h: 1, probeH: 1, value: 10 },
      { h: 0.5, probeH: 0.5, value: 11 },
      { h: 0.25, probeH: 0.25, value: 10.5 },
      { h: 0.125, probeH: 0.125, value: 10.8 },
    ],
  });
  assert.equal(
    result.disposition,
    CONVERGENCE_DISPOSITIONS.ADDITIONAL_LEVEL_REQUIRED,
  );
  assert.equal(result.requiresAdditionalLevel, true);
  return result;
});
await check('BB11_REPLAY_BB03_ZERO_CROSSING_REVIEW', () => {
  const result = evaluateConvergence({
    quantityKind: 'GLOBAL_DISPLACEMENT',
    levels: [
      { h: 1, value: 1 },
      { h: 0.5, value: 0.2 },
      { h: 0.25, value: -0.1 },
    ],
  });
  assert.equal(
    result.disposition,
    CONVERGENCE_DISPOSITIONS.ZERO_CROSSING_REVIEW,
  );
  return result;
});
await check('BB11_REPLAY_BB03_REACTION_EQUILIBRIUM_ONLY', () => {
  const result = evaluateConvergence({
    quantityKind: 'TOTAL_REACTION',
    levels: [
      { h: 1, value: 1 },
      { h: 0.5, value: 1 },
      { h: 0.25, value: 1 },
    ],
  });
  assert.equal(
    result.disposition,
    CONVERGENCE_DISPOSITIONS.EQUILIBRIUM_ONLY,
  );
  return result;
});

const gaussPointResults = Q8_GAUSS_POINTS.map((gaussPoint) => {
  const mapped = q8Map(rectangle, gaussPoint.xi, gaussPoint.eta);
  return {
    pointId: gaussPoint.pointId,
    stress: {
      sigmaX: mapped.x ** 2 + mapped.y,
      sigmaY: 2 * mapped.x - mapped.y ** 2,
      sigmaZ: 0,
      tauXY: mapped.x * mapped.y,
    },
  };
});
await check('BB11_REPLAY_BB04_FIXED_COORDINATE_RECOVERY', () => {
  const point = { x: 0.8, y: 0.3 };
  const recovered = recoverAtPhysicalCoordinate({
    elementId: 'Q8-1',
    nodes: rectangle,
    point,
    gaussPointResults,
  });
  assert.ok(Math.abs(
    recovered.recoveredTensor.sigmaX - (point.x ** 2 + point.y),
  ) < 1e-10);
  assert.ok(recovered.minimumNaturalCoordinateMargin > 0);
  return recovered;
});
await check('BB11_REPLAY_BB04_MISSING_STRESS_REJECTED', () => {
  const malformed = gaussPointResults.map((row) => ({
    ...row,
    stress: { ...row.stress },
  }));
  delete malformed[0].stress.sigmaZ;
  return expectThrows(
    () => recoverAtPhysicalCoordinate({
      elementId: 'Q8-1',
      nodes: rectangle,
      point: { x: 0.8, y: 0.3 },
      gaussPointResults: malformed,
    }),
    /sigmaZ/,
  );
});
await check('BB11_REPLAY_BB04_AMBIGUOUS_CONTAINMENT_REJECTED', () => {
  const elements = [
    { elementId: 'A', nodes: rectangle, gaussPointResults },
    { elementId: 'B', nodes: rectangle, gaussPointResults },
  ];
  expectThrows(
    () => extractQ8Path({
      pathId: 'P',
      points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }],
      elements,
    }),
    /AMBIGUOUS/,
  );
  const selected = extractQ8Path({
    pathId: 'P',
    points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }],
    elements,
    elementSelector: () => 'B',
  });
  assert.ok(selected.samples.every((row) => (
    row.containingElementId === 'B'
  )));
  return { selectedElement: 'B' };
});
await check('BB11_REPLAY_BB04_FRAME_REJECTED', () => expectThrows(
  () => extractQ8Path({
    pathId: 'P',
    points: [{ x: 0.2, y: 0.2 }, { x: 1, y: 0.5 }],
    elements: [{ elementId: 'A', nodes: rectangle, gaussPointResults }],
    localFrameAt: () => ({ tangent: [1, 0], normal: [1, 1] }),
  }),
  /orthonormal/,
));
await check('BB11_REPLAY_BB04_SCL_MANUFACTURED', () => {
  const suite = runSclManufacturedBenchmarks();
  assert.equal(suite.accepted, true);
  assert.equal(suite.cases.length, 7);
  return suite;
});
await check('BB11_REPLAY_BB04_SCL_AUTHORITY_REJECTED', () => expectThrows(
  () => linearizeStressComponents([
    {
      position: 0,
      stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 },
    },
    {
      position: 1,
      stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 },
    },
  ], { lineIdentity: 'BAD' }),
  /authoritative|authority/,
));

await check('BB11_REPLAY_BB05_INTERFACE_SUITE', () => {
  const suite = runInterfaceManufacturedBenchmarks();
  assert.equal(suite.accepted, true);
  return suite;
});
await check('BB11_REPLAY_BB05_DIRECT_TRACTION_REJECTED', () => expectThrows(
  () => evaluateConformalInterface({
    interfaceId: 'BAD',
    normal: [1, 0],
    tangent: [0, 1],
    samples: [
      {
        position: 0,
        point: { x: 0, y: 0 },
        left: { traction: [1, 0], displacement: [0, 0] },
        right: {
          stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 },
          displacement: [0, 0],
        },
      },
      {
        position: 1,
        point: { x: 0, y: 1 },
        left: { traction: [1, 0], displacement: [0, 0] },
        right: {
          stress: { sigmaX: 1, sigmaY: 0, sigmaZ: 0, tauXY: 0 },
          displacement: [0, 0],
        },
      },
    ],
  }),
  /stress|traction/i,
));

const payload = {
  schema: 'bucket-b-bb00-bb05-same-head-regression/v1',
  exactHeadSha,
  upstreamApprovedHeadSha,
  governedSharedNumericalPaths: GOVERNED_SHARED_NUMERICAL_PATHS,
  approvedBlobManifest: approvedManifest,
  currentBlobManifest: currentManifest,
  sourceBlobIdentityStatus: 'BYTE_IDENTICAL',
  checkResults: checks,
  status: 'BB00_BB05_SAME_HEAD_REGRESSION_PASS',
  authority: {
    sharedGateQualificationReceiptCreated: false,
    applicationExecutionAuthorized: false,
    axisymmetricAuthorized: false,
    moduleQualified: false,
    productionSwitchAuthorized: false,
    bucket01Qualified: 'UNCHANGED',
  },
};
const report = Object.freeze({
  ...payload,
  semanticHash: semanticHash(payload),
});
const outputPath = resolve(
  process.env.BB11_SHARED_REPLAY_REPORT_PATH
    ?? 'reports/bucket-b-bb00-bb05-report.json',
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function blobManifest(commitSha, paths) {
  return [...paths].sort().map((path) => {
    const gitBlobOid = git(['rev-parse', `${commitSha}:${path}`]);
    const bytes = execFileSync(
      'git',
      ['show', `${commitSha}:${path}`],
      { cwd: ROOT, maxBuffer: 1024 ** 3 },
    );
    const treeRow = git(['ls-tree', commitSha, '--', path]);
    return {
      path,
      gitBlobOid,
      rawSha256: sha256(bytes),
      fileMode: treeRow.split(/\s+/u)[0],
    };
  });
}

function resolveExactHead() {
  const head = git(['rev-parse', 'HEAD']);
  const expected = requiredSha(
    process.env.EXPECTED_HEAD_SHA ?? head,
    'EXPECTED_HEAD_SHA',
  );
  assert.equal(head, expected);
  return head;
}

function assertGitAncestor(ancestor, descendant) {
  const status = execFileSync(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    { cwd: ROOT },
  );
  return status;
}

function requiredSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/iu.test(value)) {
    throw new TypeError(`${label} must be a 40-character Git SHA.`);
  }
  return value;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 ** 3,
  }).trim();
}
