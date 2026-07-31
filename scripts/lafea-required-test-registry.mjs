// scripts/lafea-required-test-registry.mjs

export const REQUIRED_CANVAS_TESTS = Object.freeze([
  'LAFEA-CANVAS-T01',
  'LAFEA-CANVAS-T02',
  'LAFEA-CANVAS-T03',
  'LAFEA-CANVAS-T04',
  'LAFEA-CANVAS-T05',
  'LAFEA-CANVAS-T06',
  'LAFEA-CANVAS-T07',
  'LAFEA-CANVAS-T08',
  'LAFEA-CANVAS-T09',
  'LAFEA-CANVAS-T10',
  'LAFEA-CANVAS-T11',
  'LAFEA-CANVAS-T12',
  'LAFEA-CANVAS-T13',
  'LAFEA-CANVAS-T14',
  'LAFEA-CANVAS-T15',
  'LAFEA-CANVAS-T16',
  'LAFEA-CANVAS-T17',
  'LAFEA-CANVAS-T18',
  'LAFEA-CANVAS-T19',
  'LAFEA-CANVAS-T20',
  'LAFEA-CANVAS-T21',
  'LAFEA-CANVAS-T22',
  'LAFEA-CANVAS-T23',
  'LAFEA-CANVAS-T24',
]);

export const REQUIRED_MESH_TESTS = Object.freeze([
  // Planned browser/mesher qualification fixtures. Registration is not
  // execution evidence; each ID remains NOT RUN until its real test exists.
  'MESH-SQUARE-T6',
  'MESH-SQUARE-Q8',
  'MESH-HOLE-01',
  'MESH-MULTIHOLE-01',
  'MESH-CURVE-01',
  'MESH-REFINE-01',
  'MESH-SHELL-CYL-01',
  'MESH-TRANSITION-01',
  'MESH-DETERMINISM-01',
  'MESH-CONVERGENCE-01',
]);

export function assertRequiredTestsRegistered(actualIds, requiredIds) {
  const actual = new Set(actualIds);

  const missing = requiredIds.filter((id) => !actual.has(id));

  if (missing.length) {
    const error = new Error(
      `Mandatory tests are not registered: ${missing.join(', ')}`,
    );
    error.code = 'LAFEA_REQUIRED_TESTS_MISSING';
    error.missing = missing;
    throw error;
  }
}
