import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DEFAULT_DECK_PROFILE_INPUT,
  PROVISIONAL_CALCULIX_2_22_PROFILE,
  REQUIRED_LIMITATIONS,
  SCHEMAS,
  createAuthorityTable,
  createCanonicalNonlinearShellContactModel,
  createDeckProfile,
  createExecutionRequest,
  createNc00Report,
  createSolverProfile,
  executeNonlinearShellContactRequest,
  independentlyReconstructNc00Evidence,
  reconstructNc00ExecutionBindings,
  validateCanonicalNonlinearShellContactModel,
  validateNc00Report,
  writeDeterministicSolverDeck,
} from '../src/core/nonlinear-shell-contact/index.js';
import {
  clone, createNc00FixtureInputs, simulateNc00Parse, without,
} from '../src/core/nonlinear-shell-contact/nc00-fixtures.js';
import {
  createCompletedStructuralOutputFixture,
  createNc00ExtendedRigidFixtureInputs,
  EXTENDED_RIGID_FIXTURE_IDS,
} from '../src/core/nonlinear-shell-contact/nc00-extended-fixtures.js';
import {
  runNc00NegativeControls,
} from '../src/core/nonlinear-shell-contact/nc00-negative-controls.js';
import {
  runNc00ExtendedNegativeControls,
} from '../src/core/nonlinear-shell-contact/nc00-extended-negative-controls.js';

const PROMPT_BASE_SHA = '48aea9b2a795e070062a9e7769caefb79067c1f7';
const BRANCH = 'agent/lafea-nc00-shell-contact-foundation';
const contractsOnly = process.argv.includes('--contracts-only')
  || process.env.NC00_ALLOW_CONTRACTS_ONLY === '1';
const artifactRoot = resolve(process.env.NC00_ARTIFACT_DIR || '.artifacts/lafea-nc00');
const exactHeadSha = gitValue(process.env.NC00_EXACT_HEAD_SHA, ['rev-parse', 'HEAD'], PROMPT_BASE_SHA);
const baseSha = gitValue(process.env.NC00_BASE_SHA, ['merge-base', 'HEAD', 'origin/main'], PROMPT_BASE_SHA);
const solverProfile = createSolverProfile(await loadSolverProfile());
const deckProfile = createDeckProfile(DEFAULT_DECK_PROFILE_INPUT);
const fixtureInputs = createNc00FixtureInputs();
const extendedRigidInputs = createNc00ExtendedRigidFixtureInputs(fixtureInputs['NC00-F2']);
const allFixtureInputs = {
  'NC00-F1': fixtureInputs['NC00-F1'],
  'NC00-F2': fixtureInputs['NC00-F2'],
  'NC00-F3': fixtureInputs['NC00-F3'],
  ...extendedRigidInputs,
};
const fixtureResults = [];
const generated = new Map();

for (const [fixtureId, fixtureInput] of Object.entries(allFixtureInputs)) {
  const model = createCanonicalNonlinearShellContactModel(fixtureInput);
  validateCanonicalNonlinearShellContactModel(model);
  const first = writeDeterministicSolverDeck(model, deckProfile);
  const second = writeDeterministicSolverDeck(model, deckProfile);
  assert.equal(first.deckText, second.deckText);
  assert.equal(first.deckSha256, second.deckSha256);
  assert.deepEqual(first.maps, second.maps);
  if (fixtureId.startsWith('NC00-F2')) {
    assert.doesNotMatch(first.deckText, /\*RIGID BODY/iu);
    assert.match(
      first.deckText,
      /\*\* generated rigid carrier profile=DIRECTLY_PRESCRIBED_SHELL_CARRIER_V1/iu,
    );
    assert.match(first.deckText, /\*CONTACT PAIR/iu);
  }
  generated.set(fixtureId, { model, deck: first });
  fixtureResults.push({
    fixtureId,
    purpose: fixturePurpose(fixtureId),
    status: 'PASS',
    canonicalModelHash: model.canonicalModelSemanticHash,
    deckSha256: first.deckSha256,
    rigidGeometryMapHash: first.rigidGeometryMapHash,
    outputRequestMapHash: first.outputRequestMapHash,
    externalExecution: 'BLOCKED_PENDING_APPROVED_SOLVER_CUSTODY',
  });
}

const failedResult = simulateNc00Parse({
  ...generated.get('NC00-F1'), solverProfile, deckProfile, exactHeadSha,
}, { exitCode: 17, timedOut: false }).parsedResult;
assert.equal(failedResult.solverCompletionDisposition, 'FAILED');
fixtureResults.push({
  fixtureId: 'NC00-F4', purpose: 'FAILED_EXECUTION_FALSE_PASS_PREVENTION',
  status: 'PASS', solverCompletionDisposition: failedResult.solverCompletionDisposition,
});

const completedEvidence = createCompletedStructuralOutputFixture({
  ...generated.get('NC00-F2-SADDLE'),
  solverProfile,
  deckProfile,
  exactHeadSha,
});
assert.equal(completedEvidence.parsedResult.solverCompletionDisposition, 'COMPLETE');
assert.equal(completedEvidence.parsedResult.requestedOutputCoverage.status, 'COMPLETE');
assert.equal(completedEvidence.parsedResult.incrementSequenceEvidence.status, 'MONOTONIC_OR_EMPTY');
const completedReconstruction = reconstructNc00ExecutionBindings({
  canonicalModel: generated.get('NC00-F2-SADDLE').model,
  solverProfile,
  deckProfile,
  deckArtifact: generated.get('NC00-F2-SADDLE').deck,
  rawManifest: completedEvidence.rawManifest,
  parsedResult: completedEvidence.parsedResult,
});
assert.equal(completedReconstruction.status, 'PASS');
fixtureResults.push({
  fixtureId: 'NC00-F5',
  purpose: 'COMPLETION_STEP_INCREMENT_FIELD_AND_FRD_INVENTORY_RECONSTRUCTION',
  status: 'PASS',
  requestedOutputCoverage: completedEvidence.parsedResult.requestedOutputCoverage,
  datasetCount: completedEvidence.parsedResult.provisionalDatasetInventory.length,
  reconstructionHash: completedReconstruction.semanticHash,
});

const negativeControlResults = [
  ...runNc00NegativeControls({
    baseInput: fixtureInputs['NC00-F2'], multiInput: fixtureInputs['NC00-F3'],
    ...generated.get('NC00-F2'), solverProfile, deckProfile, exactHeadSha, baseSha,
  }),
  ...runNc00ExtendedNegativeControls({
    extendedRigidInputs,
    completedModel: generated.get('NC00-F2-SADDLE').model,
  }),
];
const independentCheckerResults = aggregateIndependentChecks(generated, solverProfile);
const deterministicReplayResults = deterministicReplay(generated, deckProfile);
const contractsPass = fixtureResults.every((row) => row.status === 'PASS')
  && negativeControlResults.every((row) => row.status === 'PASS')
  && independentCheckerResults.status === 'PASS'
  && deterministicReplayResults.status === 'PASS';
const approvedSolver = solverProfile.licenseReviewStatus === 'REVIEWED'
  && ['sourceArchiveSha256', 'binarySha256', 'containerDigest', 'linkedLibraryManifestHash']
    .every((field) => solverProfile[field] !== null);
const externalExecution = approvedSolver
  ? await executeApprovedFixtures(generated, solverProfile, deckProfile, exactHeadSha, baseSha)
  : { attempted: false, complete: false, results: [], reason: 'SOLVER_CUSTODY_UNAPPROVED' };
const solverBridgeQualified = contractsPass && approvedSolver && externalExecution.complete;
const authority = createAuthorityTable({
  contractQualified: contractsPass,
  solverBridgeQualified,
  nc01Authorized: solverBridgeQualified,
});
const limitations = [...REQUIRED_LIMITATIONS,
  'RIGID_SURFACE_GEOMETRY_IS_DETERMINISTICALLY_FACETED_NOT_ACCURACY_QUALIFIED',
  'FRD_NUMERIC_INVENTORY_IS_PROVISIONAL_NOT_ENGINEERING_AUTHORITY',
  'SHELL_SECTION_FORCE_AND_EXTERNAL_WORK_OUTPUTS_REMAIN_UNMAPPED',
];
if (!approvedSolver) limitations.push(
  'SOURCE_ARCHIVE_SHA256_UNRESOLVED',
  'BINARY_SHA256_UNRESOLVED',
  'CONTAINER_DIGEST_UNRESOLVED',
  'COMPILER_AND_LINKED_LIBRARIES_UNRESOLVED',
  'LICENSE_REVIEW_UNRESOLVED',
);
if (!externalExecution.complete) limitations.push(
  externalExecution.attempted ? 'EXTERNAL_EXECUTION_INCOMPLETE' : 'EXTERNAL_EXECUTION_NOT_PERFORMED',
  'NC01_NOT_AUTHORIZED',
);
const report = createNc00Report({
  schema: SCHEMAS.NC00_REPORT,
  status: !contractsPass || (externalExecution.attempted && !externalExecution.complete)
    ? 'NC00_FAILED'
    : solverBridgeQualified ? 'NC00_SOLVER_BRIDGE_QUALIFIED' : 'NC00_BLOCKED',
  exactHeadSha,
  baseSha,
  branch: process.env.NC00_BRANCH || BRANCH,
  solverProfileHash: solverProfile.solverProfileSemanticHash,
  deckProfileHash: deckProfile.deckProfileSemanticHash,
  fixtureResults,
  negativeControlResults,
  independentCheckerResults,
  deterministicReplayResults,
  changedPaths: changedPaths(baseSha),
  authority,
  limitations,
});
validateNc00Report(report);
await writeArtifacts(
  generated,
  solverProfile,
  deckProfile,
  report,
  { completedEvidence, completedReconstruction, externalExecution },
);
console.log(JSON.stringify({
  status: report.status,
  exactHeadSha,
  baseSha,
  branch: report.branch,
  reportSemanticHash: report.semanticHash,
  fixtureCount: fixtureResults.length,
  negativeControlCount: negativeControlResults.length,
  independentReconstruction: independentCheckerResults.status,
  deterministicReplay: deterministicReplayResults.status,
  externalExecutionAttempted: externalExecution.attempted,
  externalExecutionComplete: externalExecution.complete,
  contractQualified: authority.contractQualified,
  solverBridgeQualified: authority.solverBridgeQualified,
  nc01Authorized: authority.nc01Authorized,
  unresolvedGates: report.limitations.filter((value) => (
    value.endsWith('_UNRESOLVED') || value.endsWith('_NOT_PERFORMED')
  )),
}, null, 2));
if (!contractsPass || (externalExecution.attempted && !externalExecution.complete)) process.exitCode = 1;
else if (!solverBridgeQualified && !contractsOnly) process.exitCode = 2;

function fixturePurpose(fixtureId) {
  const values = {
    'NC00-F1': 'DETERMINISTIC_MINIMAL_SHELL_DECK',
    'NC00-F2': 'DETERMINISTIC_RIGID_PLANE_AND_CONTACT_DECLARATION',
    'NC00-F3': 'EXPLICIT_MULTI_STEP_ORDER_AND_PARSE_INVENTORY',
    'NC00-F2-PLANE': 'RIGID_PLANE_DETERMINISTIC_GEOMETRY_ADAPTER',
    'NC00-F2-SPHERE': 'RIGID_SPHERE_DETERMINISTIC_FACETED_GEOMETRY_ADAPTER',
    'NC00-F2-CYLINDER': 'RIGID_CYLINDER_DETERMINISTIC_FACETED_GEOMETRY_ADAPTER',
    'NC00-F2-SADDLE': 'RIGID_SADDLE_DETERMINISTIC_FACETED_GEOMETRY_ADAPTER',
  };
  return values[fixtureId] ?? 'NC00_STRUCTURAL_FIXTURE';
}

function aggregateIndependentChecks(values, solver) {
  const fixtures = Object.fromEntries([...values].map(([fixtureId, evidence]) => [
    fixtureId,
    independentlyReconstructNc00Evidence({
      canonicalModel: evidence.model,
      deckArtifact: evidence.deck,
      solverProfile: solver,
    }),
  ]));
  return {
    status: Object.values(fixtures).every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL',
    fixtures,
  };
}

function deterministicReplay(values, profile) {
  const checks = {};
  for (const [fixtureId, evidence] of values) {
    const rebuilt = createCanonicalNonlinearShellContactModel(
      without(evidence.model, ['canonicalModelSemanticHash']),
    );
    const replay = writeDeterministicSolverDeck(rebuilt, profile);
    checks[`${fixtureId}:modelBytes`] = JSON.stringify(rebuilt) === JSON.stringify(evidence.model);
    checks[`${fixtureId}:deckBytes`] = replay.deckText === evidence.deck.deckText;
    checks[`${fixtureId}:mappingRecords`] = JSON.stringify(replay.maps) === JSON.stringify(evidence.deck.maps);
    checks[`${fixtureId}:rigidGeometryMapHash`] = replay.rigidGeometryMapHash
      === evidence.deck.rigidGeometryMapHash;
    checks[`${fixtureId}:outputRequestMapHash`] = replay.outputRequestMapHash
      === evidence.deck.outputRequestMapHash;
  }
  return { status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', checks };
}

async function executeApprovedFixtures(values, solver, profile, headSha, mergeBaseSha) {
  const policyPath = process.env.LAFEA_NC00_EXECUTION_POLICY_JSON;
  if (!policyPath) {
    return { attempted: false, complete: false, results: [], reason: 'EXECUTION_POLICY_NOT_SUPPLIED' };
  }
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  if (policy.exactHeadSha !== headSha || policy.baseSha !== mergeBaseSha) {
    throw new TypeError('Approved execution policy exact-head bindings are stale.');
  }
  const executionFixtureIds = ['NC00-F1', 'NC00-F2', 'NC00-F3', ...EXTENDED_RIGID_FIXTURE_IDS];
  const results = [];
  for (const fixtureId of executionFixtureIds) {
    const evidence = values.get(fixtureId);
    const request = createExecutionRequest({
      schema: SCHEMAS.EXECUTION_REQUEST,
      requestId: `${fixtureId}-EXECUTION`,
      canonicalModelHash: evidence.model.canonicalModelSemanticHash,
      solverProfileHash: solver.solverProfileSemanticHash,
      deckProfileHash: profile.deckProfileSemanticHash,
      timeoutSeconds: 600,
      maximumInputBytes: 100_000_000,
      maximumOutputBytes: 1_000_000_000,
      requestedArtifactPolicy: 'RETAIN_ALLOWLISTED_RAW_OUTPUTS',
    });
    try {
      const result = await executeNonlinearShellContactRequest(
        evidence.model,
        solver,
        profile,
        policy,
        request,
      );
      results.push({ fixtureId, status: result.executionDisposition, evidence: result });
    } catch (error) {
      results.push({
        fixtureId,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    attempted: true,
    complete: results.every((row) => row.status === 'EXECUTED'),
    results,
    reason: null,
  };
}

async function writeArtifacts(values, solver, profile, reportValue, supplemental) {
  await mkdir(artifactRoot, { recursive: true });
  for (const [fixtureId, evidence] of values) {
    const directory = resolve(artifactRoot, fixtureId);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'model.inp'), evidence.deck.deckText);
    await writeFile(resolve(directory, 'mapping-records.json'), `${JSON.stringify(evidence.deck.maps, null, 2)}\n`);
  }
  await writeFile(resolve(artifactRoot, 'solver-profile.json'), `${JSON.stringify(solver, null, 2)}\n`);
  await writeFile(resolve(artifactRoot, 'deck-profile.json'), `${JSON.stringify(profile, null, 2)}\n`);
  await writeFile(resolve(artifactRoot, 'nc00-report.json'), `${JSON.stringify(reportValue, null, 2)}\n`);
  await writeFile(
    resolve(artifactRoot, 'completed-structural-result.json'),
    `${JSON.stringify(supplemental.completedEvidence.parsedResult, null, 2)}\n`,
  );
  await writeFile(
    resolve(artifactRoot, 'completed-structural-reconstruction.json'),
    `${JSON.stringify(supplemental.completedReconstruction, null, 2)}\n`,
  );
  const externalExecutionLedger = supplemental.externalExecution.results.map((row) => ({
    fixtureId: row.fixtureId,
    status: row.status,
    error: row.error ?? null,
    executionDisposition: row.evidence?.executionDisposition ?? null,
    receiptHash: row.evidence?.receipt?.semanticHash ?? null,
    rawManifestHash: row.evidence?.rawManifest?.rawManifestSemanticHash ?? null,
    parsedResultHash: row.evidence?.parsedResult?.resultPayloadSemanticHash ?? null,
    reconstructionHash: row.evidence?.reconstruction?.semanticHash ?? null,
  }));
  await writeFile(
    resolve(artifactRoot, 'external-execution-results.json'),
    `${JSON.stringify(externalExecutionLedger, null, 2)}\n`,
  );
  for (const row of supplemental.externalExecution.results) {
    if (!row.evidence) continue;
    const directory = resolve(artifactRoot, row.fixtureId, 'raw');
    await mkdir(directory, { recursive: true });
    for (const [relativePath, bytes] of row.evidence.retainedFiles.entries()) {
      await writeFile(resolve(directory, relativePath), bytes);
    }
    await writeFile(
      resolve(directory, 'raw-manifest.json'),
      `${JSON.stringify(row.evidence.rawManifest, null, 2)}\n`,
    );
    await writeFile(
      resolve(directory, 'execution-receipt.json'),
      `${JSON.stringify(row.evidence.receipt, null, 2)}\n`,
    );
  }
}

async function loadSolverProfile() {
  const path = process.env.LAFEA_NC00_APPROVED_SOLVER_PROFILE_JSON;
  if (!path) return clone(PROVISIONAL_CALCULIX_2_22_PROFILE);
  return JSON.parse(await readFile(path, 'utf8'));
}
function gitValue(explicit, argumentsList, fallback) {
  if (explicit) return explicit;
  try {
    return execFileSync('git', argumentsList, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return fallback; }
}
function changedPaths(base) {
  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split(/\r?\n/u).filter(Boolean).sort();
  } catch {
    return [
      '.github/workflows/lafea-nc00-solver-bridge.yml',
      'docs/nonlinear-shell-contact/**',
      'package.json',
      'scripts/lafea-nc00-check.mjs',
      'src/core/nonlinear-shell-contact/**',
    ];
  }
}
