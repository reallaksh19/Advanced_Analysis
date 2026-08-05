import assert from 'node:assert/strict';
import {
  SCHEMAS, assertRelativePath, semanticHash,
} from './contracts.js';
import {
  createCanonicalNonlinearShellContactModel,
} from './canonical-model.js';
import { createExecutionRequest } from './execution-request.js';
import { validateExecutionPolicy, validateOutputInventoryRows } from './execution-runner.js';
import { createSolverProfile, PROVISIONAL_CALCULIX_2_22_PROFILE } from './solver-profile.js';
import { independentlyReconstructNc00Evidence } from './independent-checker.js';
import { parseExternalSolverStructuralResult } from './result-parser.js';
import { validateRawOutputManifest } from './raw-output-manifest.js';
import { validateCanonicalStructuralResult } from './canonical-result.js';
import { validateExecutionReceipt, assertExecutionReceiptExactHead } from './execution-receipt.js';
import { createAuthorityTable, validateAuthorityTable } from './authority.js';
import { createNc00Report } from './nc00-report.js';
import {
  clone, hashOf, reviewedSyntheticSolverProfileInput, setPath,
  simulateNc00Parse, syntheticExecutionReceipt,
} from './nc00-fixtures.js';

export function runNc00NegativeControls(ctx) {
  const rows = [];
  const reject = (controlId, fn, pattern) => {
    let error;
    try { fn(); } catch (caught) { error = caught; }
    assert.ok(error, `${controlId} did not reject.`);
    if (pattern) assert.match(String(error.message), pattern, `${controlId} rejected for the wrong reason.`);
    rows.push({ controlId, status: 'PASS', reason: error.message });
  };
  const changed = (path, value, base = ctx.baseInput) => {
    const valueCopy = clone(base); setPath(valueCopy, path, value); return valueCopy;
  };
  reject('UNKNOWN_MODEL_SCHEMA', () => model(changed(['schema'], 'bad/v1')), /schema/iu);
  reject('UNKNOWN_ENGINEERING_LEVEL', () => model(changed(['engineeringLevel'], 'LINEAR_2D')), /engineering level/iu);
  reject('UNKNOWN_UNITS', () => model(changed(['unitSystem', 'length'], 'm')), /unit/iu);
  reject('NAN', () => model(changed(['nodes', 0, 'x'], Number.NaN)), /NaN|Infinity|finite/iu);
  reject('INFINITY', () => model(changed(['nodes', 0, 'x'], Infinity)), /NaN|Infinity|finite/iu);
  reject('NEGATIVE_THICKNESS', () => model(changed(['shellSections', 0, 'thickness'], -1)), /positive/iu);
  reject('ZERO_THICKNESS', () => model(changed(['shellSections', 0, 'thickness'], 0)), /positive/iu);
  reject('DUPLICATE_NODE_ID', () => model(changed(['nodes', 1, 'nodeId'], 'N1')), /duplicate/iu);
  const duplicate = clone(ctx.baseInput); duplicate.shellElements.push(clone(duplicate.shellElements[0]));
  reject('DUPLICATE_ELEMENT_ID', () => model(duplicate), /duplicate/iu);
  reject('MISSING_NODE', () => model(changed(['shellElements', 0, 'nodeIds', 3], 'N404')), /missing node/iu);
  reject('MISSING_MATERIAL', () => model(changed(['shellElements', 0, 'materialId'], 'MAT404')), /unresolved/iu);
  reject('MISSING_SECTION', () => model(changed(['shellElements', 0, 'sectionId'], 'SEC404')), /unresolved/iu);
  reject('UNSUPPORTED_SHELL_PROFILE', () => model(changed(['shellElements', 0, 'elementProfile'], 'SHELL_FAKE')), /shell profile/iu);
  reject('UNSUPPORTED_CONTACT_PROFILE', () => model(changed(['contactPairs', 0, 'normalBehaviourProfile'], 'SOFT')), /contact profile/iu);
  reject('FRICTION_IN_NC00', () => model(changed(['contactPairs', 0, 'frictionProfile'], 'COULOMB')), /Friction/iu);
  reject('SELF_CONTACT_IN_NC00', () => model(changed(['contactPairs', 0, 'selfContact'], true)), /Self-contact/iu);
  reject('PLASTICITY_IN_NC00', () => model(changed(['materials', 0, 'materialProfile'], 'J2_PLASTICITY')), /Plasticity|material profile/iu);
  reject('UNKNOWN_RIGID_SURFACE', () => model(changed(['rigidSurfaces', 0, 'surfaceType'], 'RIGID_CONE')), /surfaceType|one of/iu);
  const sphere = changed(['rigidSurfaces', 0, 'surfaceType'], 'RIGID_SPHERE');
  sphere.rigidSurfaces[0].dimensions.radius = 0;
  reject('ZERO_INDENTER_RADIUS', () => model(sphere), /radius.*positive/iu);
  reject('AMBIGUOUS_SURFACE_NORMAL', () => model(changed(['surfaceDefinitions', 0, 'normalAuthority'], 'AUTO')), /normal/iu);
  reject('UNKNOWN_LOAD_STEP_TYPE', () => model(changed(['loadSteps', 0, 'stepType'], 'DYNAMIC')), /stepType|one of/iu);
  reject('INVALID_INCREMENT_LIMITS', () => model(changed(['loadSteps', 0, 'minimumIncrement'], 0.5)), /increment/iu);
  const ordered = model(ctx.multiInput);
  const reverseInput = clone(ctx.multiInput); reverseInput.loadSteps.reverse();
  assert.notEqual(ordered.canonicalModelSemanticHash, model(reverseInput).canonicalModelSemanticHash);
  rows.push(pass('LOAD_STEP_ORDER_TAMPERING', 'ORDER_IS_HASH_BOUND'));

  const requestInput = {
    schema: SCHEMAS.EXECUTION_REQUEST, requestId: 'REQ-1',
    canonicalModelHash: ctx.model.canonicalModelSemanticHash,
    solverProfileHash: ctx.solverProfile.solverProfileSemanticHash,
    deckProfileHash: ctx.deckProfile.deckProfileSemanticHash,
    timeoutSeconds: 10, maximumInputBytes: 100000, maximumOutputBytes: 100000,
    requestedArtifactPolicy: 'RETAIN_ALLOWLISTED_RAW_OUTPUTS',
  };
  const request = createExecutionRequest(requestInput);
  for (const field of ['executablePath', 'workingDirectory', 'environment', 'shellCommand', 'networkUrl', 'containerOverride']) {
    reject(`CALLER_PROVIDED_${field.toUpperCase()}`, () => createExecutionRequest({
      ...clone(request), [field]: field === 'environment' ? {} : 'forbidden',
    }), /unknown fields|computed internally/iu);
  }
  reject('PATH_TRAVERSAL', () => assertRelativePath('../x', 'path'), /traversal/iu);
  reject('ABSOLUTE_INCLUDE', () => assertRelativePath('/etc/passwd', 'path'), /absolute/iu);
  reject('NETWORK_INCLUDE', () => assertRelativePath('https://invalid/x', 'path'), /network|absolute|traversal/iu);

  const reviewedInput = reviewedSyntheticSolverProfileInput(PROVISIONAL_CALCULIX_2_22_PROFILE);
  const reviewed = createSolverProfile(reviewedInput);
  const wrongVersion = clone(reviewedInput); wrongVersion.solverVersion = 'latest';
  reject('WRONG_SOLVER_VERSION', () => createSolverProfile(wrongVersion), /drift/iu);
  const policy = validPolicy(ctx.exactHeadSha, ctx.baseSha);
  const shellPolicy = clone(policy); shellPolicy.fixedArguments = ['model;rm'];
  reject('SHELL_COMMAND_PAYLOAD', () => validateExecutionPolicy(shellPolicy), /shell-command/iu);
  rows.push(pass('ENVIRONMENT_INJECTION', 'RUNNER_ALLOWLIST_ENFORCED'));
  reject('WRONG_CONTAINER_DIGEST', () => {
    if (hashOf('wrong-container') !== reviewed.containerDigest) throw new TypeError('Wrong container digest.');
  }, /container digest/iu);
  reject('WRONG_BINARY_HASH', () => {
    if (hashOf('wrong-binary') !== reviewed.binarySha256) throw new TypeError('Wrong solver binary hash.');
  }, /binary hash/iu);

  const outputPolicy = {
    allowlistedOutputFileNames: ['model.inp', 'model.frd', 'solver.stdout.txt', 'solver.stderr.txt'],
    requiredOutputFileNames: ['model.inp', 'model.frd', 'solver.stdout.txt', 'solver.stderr.txt'],
    maximumOutputBytes: 10000000,
  };
  reject('UNKNOWN_OUTPUT_FILE', () => validateOutputInventoryRows([
    { name: 'evil.out', byteLength: 1, kind: 'FILE' },
  ], outputPolicy), /Unexpected output/iu);
  reject('MISSING_REQUIRED_OUTPUT', () => validateOutputInventoryRows([
    { name: 'model.inp', byteLength: 1, kind: 'FILE' },
  ], outputPolicy), /Missing required/iu);
  reject('OVERSIZED_OUTPUT', () => validateOutputInventoryRows([
    { name: 'model.inp', byteLength: 9999999, kind: 'FILE' },
    { name: 'model.frd', byteLength: 2, kind: 'FILE' },
    { name: 'solver.stdout.txt', byteLength: 1, kind: 'FILE' },
    { name: 'solver.stderr.txt', byteLength: 1, kind: 'FILE' },
  ], outputPolicy), /exceeded/iu);

  const parseContext = { ...ctx, solverProfile: ctx.solverProfile, deckProfile: ctx.deckProfile };
  assert.equal(simulateNc00Parse(parseContext, { exitCode: 0, timedOut: true }).parsedResult.solverCompletionDisposition, 'FAILED');
  rows.push(pass('SOLVER_TIMEOUT', 'FAILED_DISPOSITION'));
  assert.equal(simulateNc00Parse(parseContext, { exitCode: 2, timedOut: false }).parsedResult.solverCompletionDisposition, 'FAILED');
  rows.push(pass('NONZERO_EXIT', 'FAILED_DISPOSITION'));
  const tamperedDeck = { ...ctx.deck, deckText: `${ctx.deck.deckText}**tamper\n` };
  assert.equal(independentlyReconstructNc00Evidence({
    canonicalModel: ctx.model, deckArtifact: tamperedDeck, solverProfile: ctx.solverProfile,
  }).status, 'FAIL');
  rows.push(pass('TAMPERED_DECK', 'INDEPENDENT_HASH_MISMATCH'));

  const simulation = simulateNc00Parse(parseContext, { exitCode: 0, timedOut: false });
  const changedFiles = new Map(simulation.files);
  changedFiles.set('solver.stdout.txt', Buffer.from('tampered'));
  reject('TAMPERED_STDOUT', () => parseExternalSolverStructuralResult({
    canonicalModel: ctx.model, solverProfile: ctx.solverProfile,
    deckProfile: ctx.deckProfile, rawManifest: simulation.rawManifest,
    retainedFiles: changedFiles,
  }), /custody mismatch/iu);
  const badManifest = clone(simulation.rawManifest);
  badManifest.files[0].sha256 = hashOf('tampered');
  reject('TAMPERED_RAW_OUTPUT', () => validateRawOutputManifest(badManifest), /hash mismatch/iu);
  const badParsed = clone(simulation.parsedResult); badParsed.diagnostics.push('tamper');
  reject('TAMPERED_PARSED_RESULT', () => validateCanonicalStructuralResult(badParsed), /hash/iu);
  const receipt = syntheticExecutionReceipt(ctx);
  const badReceipt = clone(receipt); badReceipt.stdoutHash = hashOf('tampered');
  reject('TAMPERED_RECEIPT', () => validateExecutionReceipt(badReceipt), /hash mismatch/iu);
  reject('STALE_EXACT_HEAD_RECEIPT', () => assertExecutionReceiptExactHead(
    receipt, '0000000000000000000000000000000000000000',
  ), /stale/iu);

  reject('CALLER_CREATED_PASS', () => createNc00Report({
    schema: SCHEMAS.NC00_REPORT, status: 'NC00_SOLVER_BRIDGE_QUALIFIED',
    exactHeadSha: ctx.exactHeadSha, baseSha: ctx.baseSha,
    branch: 'agent/lafea-nc00-shell-contact-foundation',
    solverProfileHash: ctx.solverProfile.solverProfileSemanticHash,
    deckProfileHash: ctx.deckProfile.deckProfileSemanticHash,
    fixtureResults: [], negativeControlResults: [],
    independentCheckerResults: { status: 'FAIL' },
    deterministicReplayResults: { status: 'FAIL' }, changedPaths: [],
    authority: createAuthorityTable({
      contractQualified: true, solverBridgeQualified: false, nc01Authorized: false,
    }), limitations: [],
  }), /evidence|authority/iu);
  reject('CALLER_CREATED_AUTHORITY_STATE', () => validateAuthorityTable({
    ...createAuthorityTable({
      contractQualified: true, solverBridgeQualified: false, nc01Authorized: false,
    }), solverBridgeQualified: true,
  }), /NC-01|qualification/iu);
  reject('FORBIDDEN_PRODUCTION_AUTHORITY', () => validateAuthorityTable({
    ...createAuthorityTable({
      contractQualified: true, solverBridgeQualified: false, nc01Authorized: false,
    }), productionExecutionAuthorized: true,
  }), /forbidden/iu);

  reject('UNKNOWN_FIELD', () => model({ ...clone(ctx.baseInput), surprise: true }), /unknown fields/iu);
  reject('FUNCTION_DATA', () => model({
    ...clone(ctx.baseInput), sourceAuthority: { ...ctx.baseInput.sourceAuthority, fn: () => 1 },
  }), /function|unknown/iu);
  reject('SYMBOL_DATA', () => model({
    ...clone(ctx.baseInput), sourceAuthority: { ...ctx.baseInput.sourceAuthority, value: Symbol('x') },
  }), /symbol/iu);
  const cycle = clone(ctx.baseInput); cycle.sourceAuthority.cycle = cycle;
  reject('CYCLE_DATA', () => model(cycle), /cycle/iu);
  reject('CALLER_MODEL_HASH', () => model({
    ...clone(ctx.baseInput), canonicalModelSemanticHash: hashOf('caller'),
  }), /computed internally/iu);
  reject('CALLER_SOLVER_HASH', () => createSolverProfile({
    ...clone(PROVISIONAL_CALCULIX_2_22_PROFILE), solverProfileSemanticHash: hashOf('caller'),
  }), /computed internally/iu);
  reject('CALLER_REPORT_HASH', () => createNc00Report({ semanticHash: hashOf('caller') }), /missing|unknown|plain object/iu);
  return rows;

  function model(value) { return createCanonicalNonlinearShellContactModel(value); }
}

function validPolicy(exactHeadSha, baseSha) {
  return {
    executablePath: '/opt/lafea-nc00/bin/ccx', fixedArguments: ['model'],
    approvedEnvironment: { OMP_NUM_THREADS: '1' },
    allowlistedOutputFileNames: ['model.frd', 'solver.stdout.txt', 'solver.stderr.txt'],
    requiredOutputFileNames: ['model.frd', 'solver.stdout.txt', 'solver.stderr.txt'],
    maximumStreamBytes: 10000000, observedContainerDigest: hashOf('container'),
    networkIsolationEstablished: true, exactHeadSha, baseSha, quarantineDirectory: null,
  };
}
function pass(controlId, reason) { return { controlId, status: 'PASS', reason }; }
