import { sha256Bytes } from './contracts.js';
import { createRawOutputManifest } from './raw-output-manifest.js';
import { parseExternalSolverStructuralResult } from './result-parser.js';
import { clone } from './nc00-fixtures.js';

export const EXTENDED_RIGID_FIXTURE_IDS = Object.freeze([
  'NC00-F2-PLANE',
  'NC00-F2-SPHERE',
  'NC00-F2-CYLINDER',
  'NC00-F2-SADDLE',
]);

export function createNc00ExtendedRigidFixtureInputs(baseContactInput) {
  const definitions = {
    'NC00-F2-PLANE': {
      surfaceType: 'RIGID_PLANE',
      dimensions: { radius: null, length: 200, width: 200, angle: null },
      referencePoint: null,
    },
    'NC00-F2-SPHERE': {
      surfaceType: 'RIGID_SPHERE',
      dimensions: { radius: 75, length: null, width: null, angle: 70 },
      referencePoint: null,
    },
    'NC00-F2-CYLINDER': {
      surfaceType: 'RIGID_CYLINDER',
      dimensions: { radius: 75, length: 200, width: null, angle: 120 },
      referencePoint: null,
    },
    'NC00-F2-SADDLE': {
      surfaceType: 'RIGID_SADDLE',
      dimensions: { radius: 75, length: 200, width: 100, angle: null },
      referencePoint: [50, 50, -25],
    },
  };
  return Object.fromEntries(Object.entries(definitions).map(([fixtureId, definition]) => {
    const input = clone(baseContactInput);
    input.modelId = `${fixtureId}-MODEL`;
    input.rigidSurfaces[0].rigidSurfaceId = `${fixtureId}-RIGID`;
    input.rigidSurfaces[0].surfaceType = definition.surfaceType;
    input.rigidSurfaces[0].dimensions = definition.dimensions;
    if (definition.referencePoint) {
      input.rigidSurfaces[0].referencePoint = [...definition.referencePoint];
    }
    input.contactPairs[0].rigidSurfaceId = input.rigidSurfaces[0].rigidSurfaceId;
    input.loadSteps.forEach((step) => step.prescribedMotions.forEach((motion) => {
      motion.targetId = input.rigidSurfaces[0].rigidSurfaceId;
    }));
    input.requestedOutputs = [...new Set([
      ...input.requestedOutputs,
      'CONTACT_NORMAL_FORCE',
      'CONTACT_AREA',
    ])];
    return [fixtureId, input];
  }));
}

export function createCompletedStructuralOutputFixture({
  model,
  deck,
  solverProfile,
  deckProfile,
  exactHeadSha,
  requestId = 'NC00-STRUCTURAL-INVENTORY-REQUEST',
}) {
  const statusLines = [];
  model.loadSteps.forEach((step, index) => {
    statusLines.push(`STEP ${step.stepId} INCREMENT 1`);
    statusLines.push(`STEP ${step.stepId} INCREMENT 2`);
    statusLines.push(`STEP ${step.stepId} COMPLETED ${index + 1}`);
  });
  statusLines.push('JOB FINISHED');
  const status = Buffer.from(`${statusLines.join('\n')}\n`, 'utf8');
  const stdout = Buffer.from('CALCULIX ANALYSIS COMPLETED\n', 'utf8');
  const stderr = Buffer.alloc(0);
  const dat = Buffer.from([
    'CFN TOTAL NORMAL FORCE = 1.000000E+00',
    'AREA OF THE CONTACT AREA = 2.000000E+00',
  ].join('\n'), 'utf8');
  const frd = Buffer.from([
    ...model.loadSteps.flatMap((step, stepIndex) => [
      `    1PSTEP      ${stepIndex + 1}`,
      ' -4  DISP        3    1',
      ' -5  D1          1',
      ' -5  D2          2',
      ' -5  D3          3',
      ` -1    1 ${stepIndex}.0 0.0 0.0`,
      ' -3',
      ' -4  FORC        3    1',
      ' -5  F1          1',
      ' -5  F2          2',
      ' -5  F3          3',
      ' -1    1 0.0 0.0 1.0',
      ' -3',
      ' -4  STRESS      6    1',
      ' -5  SXX         1',
      ' -1    1 1.0 2.0 3.0 0.0 0.0 0.0',
      ' -3',
      ' -4  CONTACT     6    1',
      ' -5  COPEN       1',
      ' -5  CPRESS      4',
      ' -1    1 0.0 0.0 0.0 1.0 0.0 0.0',
      ' -3',
    ]),
    ' 9999',
    '',
  ].join('\n'), 'utf8');
  const files = new Map([
    ['model.inp', Buffer.from(deck.deckText, 'utf8')],
    ['model.frd', frd],
    ['model.dat', dat],
    ['model.sta', status],
    ['solver.stdout.txt', stdout],
    ['solver.stderr.txt', stderr],
  ]);
  const rawManifest = createRawOutputManifest({
    requestId,
    exactHeadSha,
    canonicalModelHash: model.canonicalModelSemanticHash,
    solverProfileHash: solverProfile.solverProfileSemanticHash,
    deckProfileHash: deckProfile.deckProfileSemanticHash,
    deckSha256: deck.deckSha256,
    startedAtEvidence: 'synthetic-start',
    completedAtEvidence: 'synthetic-complete',
    exitCode: 0,
    timeoutDisposition: 'COMPLETED_WITHIN_TIMEOUT',
    stdoutSha256: sha256Bytes(stdout),
    stderrSha256: sha256Bytes(stderr),
    files: [...files.entries()].map(([relativePath, bytes]) => ({
      relativePath,
      role: relativePath === 'model.inp' ? 'INPUT_DECK'
        : relativePath === 'model.sta' ? 'STATUS'
          : relativePath === 'model.frd' || relativePath === 'model.dat' ? 'RAW_RESULT'
            : 'LOG',
      byteLength: bytes.length,
      sha256: sha256Bytes(bytes),
      mediaType: 'text/plain; charset=utf-8',
      required: true,
    })),
  });
  const parsedResult = parseExternalSolverStructuralResult({
    canonicalModel: model,
    solverProfile,
    deckProfile,
    rawManifest,
    retainedFiles: files,
  });
  return { files, rawManifest, parsedResult };
}
