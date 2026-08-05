import { createHash } from 'node:crypto';
import {
  CANONICAL_UNITS,
  ENGINEERING_LEVEL,
  MATERIAL_PROFILE,
  REQUIRED_LIMITATIONS,
  SHELL_ELEMENT_PROFILE,
} from './canonical-model.js';
import { SCHEMAS, semanticHash, sha256Bytes } from './contracts.js';
import { createRawOutputManifest } from './raw-output-manifest.js';
import { parseExternalSolverStructuralResult } from './result-parser.js';

export function createNc00FixtureInputs() {
  const sourceAuthority = {
    sourceId: 'NC00-WORK-PACK',
    sourceHash: semanticHash('AGENT-NC00-WORK-PACK'),
  };
  const ref = (entityId) => ({ sourceId: sourceAuthority.sourceId, entityId });
  const nodes = [
    ['N1', 0, 0, 1], ['N2', 100, 0, 1],
    ['N3', 100, 100, 1], ['N4', 0, 100, 1],
  ].map(([nodeId, x, y, z]) => ({ nodeId, x, y, z, sourceRef: ref(nodeId) }));
  const material = {
    materialId: 'MAT-ELASTIC', materialProfile: MATERIAL_PROFILE,
    youngsModulus: 210000, poissonRatio: 0.3, density: 7.85e-9, sourceAuthority,
  };
  const section = {
    sectionId: 'SEC-1', materialId: material.materialId, thickness: 2,
    referenceSurface: 'MIDSURFACE', offset: 0,
    throughThicknessIntegrationProfile: 'EXTERNAL_KERNEL_DEFAULT_UNQUALIFIED_V1',
    sourceAuthority,
  };
  const element = {
    elementId: 'E1', elementProfile: SHELL_ELEMENT_PROFILE,
    nodeIds: ['N1', 'N2', 'N3', 'N4'], sectionId: section.sectionId,
    materialId: material.materialId,
    orientationAuthority: 'CONNECTIVITY_RIGHT_HAND_RULE',
    referenceSurface: 'MIDSURFACE',
    surfaceNormalAuthority: 'CONNECTIVITY_RIGHT_HAND_RULE',
    sourceRef: ref('E1'),
  };
  const surface = {
    schema: SCHEMAS.SURFACE, surfaceId: 'PIPE-OUTER',
    elementFaces: [{ elementId: 'E1', face: 'SNEG' }],
    sideAuthority: 'EXPLICIT_ELEMENT_FACE', normalAuthority: 'ELEMENT_CONNECTIVITY',
    thicknessInContactPolicy: 'INCLUDE_PHYSICAL_HALF_THICKNESS',
  };
  const rigid = {
    rigidSurfaceId: 'RIGID-PLANE-1', surfaceType: 'RIGID_PLANE',
    referencePoint: [50, 50, -1],
    orientation: { normal: [0, 0, 1], axis: [1, 0, 0] },
    dimensions: { radius: null, length: 200, width: 200, angle: null },
    motionAuthority: 'PRESCRIBED', sourceAuthority,
  };
  const contact = {
    schema: SCHEMAS.CONTACT_PAIR, contactPairId: 'CP-1',
    deformableSurfaceId: surface.surfaceId, rigidSurfaceId: rigid.rigidSurfaceId,
    normalBehaviourProfile: 'HARD_FRICTIONLESS', slidingProfile: 'FINITE_SLIDING',
    thicknessPolicy: 'INCLUDE_SHELL_THICKNESS',
    enforcementProfile: 'EXTERNAL_KERNEL_PENALTY_UNQUALIFIED_V1',
    initialClearancePolicy: 'AS_MODELED_NO_ADJUSTMENT',
    selfContact: false, frictionProfile: 'NONE', sourceAuthority,
  };
  const constraints = [
    ['BC-N1', 'N1', ['UX', 'UY', 'UZ'], [0, 0, 0]],
    ['BC-N2', 'N2', ['UY', 'UZ'], [0, 0]],
    ['BC-N4', 'N4', ['UZ'], [0]],
  ].map(([constraintId, nodeId, dofs, values]) => ({
    constraintId, nodeId, dofs, values, sourceAuthority,
  }));
  const step = (stepId, stepType, loads = [], prescribedMotions = []) => ({
    schema: SCHEMAS.LOAD_STEP, stepId, stepType, targetTime: 1,
    initialIncrement: 0.1, minimumIncrement: 0.001, maximumIncrement: 0.2,
    maximumIterations: 30, loads, prescribedMotions,
    outputRequests: ['NODAL_DISPLACEMENT', 'NODAL_REACTION'],
    convergenceProfileId: 'NC00-STRUCTURAL-ONLY-V1',
  });
  const load = {
    loadId: 'LOAD-N3', loadType: 'NODAL_FORCE', targetId: 'N3',
    magnitude: 1, components: [0, 0, -1], sourceAuthority,
  };
  const motion = {
    motionId: 'MOVE-RIGID', targetType: 'RIGID_SURFACE',
    targetId: rigid.rigidSurfaceId, dof: 'UZ', value: 0.1, sourceAuthority,
  };
  const base = {
    schema: SCHEMAS.MODEL, modelId: 'NC00-F1-MODEL',
    engineeringLevel: ENGINEERING_LEVEL, unitSystem: clone(CANONICAL_UNITS),
    nodes, shellElements: [element], materials: [material], shellSections: [section],
    surfaceDefinitions: [], rigidSurfaces: [], contactPairs: [], constraints,
    loadSteps: [step('STEP-STATIC', 'STATIC_GENERAL', [load])],
    requestedOutputs: ['NODAL_DISPLACEMENT', 'NODAL_REACTION', 'SHELL_STRESS'],
    sourceAuthority, limitations: [...REQUIRED_LIMITATIONS],
  };
  const contactModel = clone(base);
  Object.assign(contactModel, {
    modelId: 'NC00-F2-MODEL', surfaceDefinitions: [surface], rigidSurfaces: [rigid],
    contactPairs: [contact],
    loadSteps: [step('STEP-CONTACT', 'PRESCRIBED_INDENTATION', [], [motion])],
    requestedOutputs: [...base.requestedOutputs, 'CONTACT_PRESSURE', 'CONTACT_OPENING'],
  });
  const multi = clone(contactModel);
  multi.modelId = 'NC00-F3-MODEL';
  multi.loadSteps = [
    step('STEP-PRESSURE', 'PRESSURE_RAMP', [{
      loadId: 'PRESSURE-1', loadType: 'PRESSURE', targetId: surface.surfaceId,
      magnitude: 1, components: [0, 0, 1], sourceAuthority,
    }]),
    step('STEP-INDENT', 'PRESCRIBED_INDENTATION', [], [motion]),
    step('STEP-UNLOAD', 'UNLOADING', [], [{ ...motion, motionId: 'MOVE-RIGID-BACK', value: 0 }]),
  ];
  return { 'NC00-F1': base, 'NC00-F2': contactModel, 'NC00-F3': multi };
}

export function simulateNc00Parse({ model, deck, solverProfile, deckProfile, exactHeadSha }, { exitCode, timedOut }) {
  const stdout = Buffer.from(exitCode === 0 && !timedOut
    ? 'STEP STEP-1\nINCREMENT 1\nJOB FINISHED\n'
    : 'STEP STEP-1\nINCREMENT 1\n');
  const stderr = Buffer.from(exitCode === 0 ? '' : 'ERROR\n');
  const files = new Map([
    ['model.inp', Buffer.from(deck.deckText)],
    ['solver.stdout.txt', stdout], ['solver.stderr.txt', stderr],
  ]);
  const rawManifest = createRawOutputManifest({
    requestId: 'SIMULATED-REQUEST', exactHeadSha,
    canonicalModelHash: model.canonicalModelSemanticHash,
    solverProfileHash: solverProfile.solverProfileSemanticHash,
    deckProfileHash: deckProfile.deckProfileSemanticHash,
    deckSha256: deck.deckSha256, startedAtEvidence: 'start', completedAtEvidence: 'complete',
    exitCode, timeoutDisposition: timedOut ? 'TIMED_OUT' : 'COMPLETED_WITHIN_TIMEOUT',
    stdoutSha256: sha256Bytes(stdout), stderrSha256: sha256Bytes(stderr),
    files: [...files].map(([relativePath, bytes]) => ({
      relativePath, role: relativePath === 'model.inp' ? 'INPUT_DECK' : 'LOG',
      byteLength: bytes.length, sha256: sha256Bytes(bytes),
      mediaType: 'text/plain; charset=utf-8', required: true,
    })),
  });
  const parsedResult = parseExternalSolverStructuralResult({
    canonicalModel: model, solverProfile, deckProfile, rawManifest, retainedFiles: files,
  });
  return { files, rawManifest, parsedResult };
}

export function syntheticExecutionReceipt(ctx) {
  const payload = {
    schema: SCHEMAS.EXECUTION_RECEIPT, requestId: 'RECEIPT-TEST',
    exactHeadSha: ctx.exactHeadSha, baseSha: ctx.baseSha,
    canonicalModelHash: ctx.model.canonicalModelSemanticHash,
    solverProfileHash: ctx.solverProfile.solverProfileSemanticHash,
    deckProfileHash: ctx.deckProfile.deckProfileSemanticHash,
    deckSha256: ctx.deck.deckSha256, rawOutputManifestHash: hashOf('manifest'),
    parsedResultHash: hashOf('result'), stdoutHash: hashOf('stdout'),
    stderrHash: hashOf('stderr'), executionDisposition: 'EXECUTED',
    authorityState: 'CONTRACT_QUALIFIED',
  };
  return { ...payload, semanticHash: semanticHash(payload) };
}

export function reviewedSyntheticSolverProfileInput(provisional) {
  return {
    ...clone(provisional), sourceArchiveSha256: hashOf('source'),
    binarySha256: hashOf('binary'), containerImage: 'registry.invalid/lafea/ccx:2.22',
    containerDigest: hashOf('container'), operatingSystem: 'linux', architecture: 'x86_64',
    compilerName: 'gcc', compilerVersion: 'PINNED_TEST_IDENTITY',
    linkedLibraryManifestHash: hashOf('libs'), licenseReviewStatus: 'REVIEWED',
  };
}

export function hashOf(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function without(value, fields) {
  const copy = clone(value); fields.forEach((field) => delete copy[field]); return copy;
}
export function setPath(value, path, next) {
  let cursor = value;
  for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
  cursor[path.at(-1)] = next;
}
