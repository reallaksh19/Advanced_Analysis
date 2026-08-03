from pathlib import Path


def patch_solver() -> None:
    path = Path('src/core/local-continuum/solver.js')
    text = path.read_text()
    start = text.index('function conjugateGradientSolve(')
    end = text.index('\nfunction applyJacobi(', start)
    block = text[start:end]
    declaration = block.index('  const residualTolerance = tolerance(')
    close = block.index('\n  );', declaration) + len('\n  );')
    block = block[:close] + '\n  const convergenceTarget = residualTolerance / 10;' + block[close:]
    block = block.replace('finalResidualInfinity > residualTolerance', 'finalResidualInfinity > convergenceTarget')
    block = block.replace('finalResidualInfinity <= residualTolerance', 'finalResidualInfinity <= convergenceTarget')
    block = block.replace(
        '`Sparse PCG residual ${finalResidualInfinity} exceeds ${residualTolerance} after ${iterations} iterations.`',
        '`Sparse PCG residual ${finalResidualInfinity} exceeds internal target ${convergenceTarget} (acceptance gate ${residualTolerance}) after ${iterations} iterations.`',
    )
    evidence = '      residualTolerance: canonicalNumber(residualTolerance),\n'
    block = block.replace(evidence, '      convergenceTarget: canonicalNumber(convergenceTarget),\n' + evidence)
    path.write_text(text[:start] + block + text[end:])


def patch_t6_quadrature() -> None:
    path = Path('src/core/local-continuum/t6-element.js')
    text = path.read_text()
    start = text.index('export const T6_GAUSS_POINTS = Object.freeze([')
    end = text.index('\n]);', start) + len('\n]);')
    rule = """export const T6_GAUSS_POINTS = Object.freeze([
  Object.freeze({ pointId: 'GP1', xi: 1 / 3, eta: 1 / 3, weight: 0.1125 }),
  Object.freeze({ pointId: 'GP2', xi: 0.059715871789770, eta: 0.470142064105115, weight: 0.066197076394253 }),
  Object.freeze({ pointId: 'GP3', xi: 0.470142064105115, eta: 0.059715871789770, weight: 0.066197076394253 }),
  Object.freeze({ pointId: 'GP4', xi: 0.470142064105115, eta: 0.470142064105115, weight: 0.066197076394253 }),
  Object.freeze({ pointId: 'GP5', xi: 0.797426985353087, eta: 0.101286507323456, weight: 0.062969590272414 }),
  Object.freeze({ pointId: 'GP6', xi: 0.101286507323456, eta: 0.797426985353087, weight: 0.062969590272414 }),
  Object.freeze({ pointId: 'GP7', xi: 0.101286507323456, eta: 0.101286507323456, weight: 0.062969590272414 }),
]);"""
    text = text[:start] + rule + text[end:]
    text = text.replace(
        "GAUSS_QUADRATURE: 'T6_THREE_POINT_DEGREE_2_GAUSS_QUADRATURE_V1'",
        "GAUSS_QUADRATURE: 'T6_SEVEN_POINT_DEGREE_5_GAUSS_QUADRATURE_V2'",
    )
    path.write_text(text)


def patch_probe() -> None:
    path = Path('src/workspace/lafea-bucket-01-fixed-probe.js')
    text = path.read_text()
    text = text.replace('const GAUSS_POINT_COUNT = 3;', 'const MINIMUM_GAUSS_POINT_COUNT = 3;')
    text = text.replace(
        '|| elementResult.gaussPointResults.length !== GAUSS_POINT_COUNT)',
        '|| elementResult.gaussPointResults.length < MINIMUM_GAUSS_POINT_COUNT)',
    )
    text = text.replace(
        "'T6_THREE_POINT_LINEAR_NATURAL_COORDINATE_RECONSTRUCTION_V1'",
        "'T6_INTEGRATION_POINT_LINEAR_LEAST_SQUARES_RECONSTRUCTION_V2'",
    )
    old = """  const matrix = points.map((point) => [1, point.xi, point.eta]);
  const values = points.map(selector);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw probeError('LAFEA_B01_PROBE_STRESS_COMPONENT_INVALID');
  }
  const coefficients = solve3(matrix, values);"""
    new = """  const rows = points.map((point) => [1, point.xi, point.eta]);
  const values = points.map(selector);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw probeError('LAFEA_B01_PROBE_STRESS_COMPONENT_INVALID');
  }
  const normal = Array.from({ length: 3 }, () => Array(3).fill(0));
  const rightHandSide = Array(3).fill(0);
  rows.forEach((row, rowIndex) => {
    for (let i = 0; i < 3; i += 1) {
      rightHandSide[i] += row[i] * values[rowIndex];
      for (let j = 0; j < 3; j += 1) normal[i][j] += row[i] * row[j];
    }
  });
  const coefficients = solve3(normal, rightHandSide);"""
    if text.count(old) != 1:
        raise RuntimeError(f'reconstruct block count={text.count(old)}')
    path.write_text(text.replace(old, new))


def patch_kirsch_diagnostic() -> None:
    path = Path('scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs')
    text = path.read_text()
    old = "`${definition.probeId}: ${convergence.reasons.join(', ')}`"
    new = "`${definition.probeId}: ${JSON.stringify(convergence.convergence)}`"
    if text.count(old) != 1:
        raise RuntimeError(f'Kirsch assertion count={text.count(old)}')
    path.write_text(text.replace(old, new))


patch_solver()
patch_t6_quadrature()
patch_probe()
patch_kirsch_diagnostic()
