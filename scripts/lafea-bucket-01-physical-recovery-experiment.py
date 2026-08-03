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
    block = block.replace(
        'finalResidualInfinity > residualTolerance',
        'finalResidualInfinity > convergenceTarget',
    )
    block = block.replace(
        'finalResidualInfinity <= residualTolerance',
        'finalResidualInfinity <= convergenceTarget',
    )
    block = block.replace(
        '`Sparse PCG residual ${finalResidualInfinity} exceeds ${residualTolerance} after ${iterations} iterations.`',
        '`Sparse PCG residual ${finalResidualInfinity} exceeds internal target ${convergenceTarget} (acceptance gate ${residualTolerance}) after ${iterations} iterations.`',
    )
    evidence = '      residualTolerance: canonicalNumber(residualTolerance),\n'
    block = block.replace(
        evidence,
        '      convergenceTarget: canonicalNumber(convergenceTarget),\n' + evidence,
    )
    path.write_text(text[:start] + block + text[end:])


def patch_probe() -> None:
    path = Path('src/workspace/lafea-bucket-01-fixed-probe.js')
    text = path.read_text()
    call_start = text.index('  const components = reconstructTensor(')
    call_end = text.index('\n  );', call_start) + len('\n  );')
    call = """  const components = reconstructTensor(
    elementResult.gaussPointResults,
    candidate.nodes,
    probe.x,
    probe.y,
  );"""
    text = text[:call_start] + call + text[call_end:]
    old_method = "'T6_THREE_POINT_LINEAR_NATURAL_COORDINATE_RECONSTRUCTION_V1'"
    if text.count(old_method) != 1:
        raise RuntimeError(f'recovery method count={text.count(old_method)}')
    text = text.replace(
        old_method,
        "'T6_THREE_POINT_LINEAR_PHYSICAL_COORDINATE_RECONSTRUCTION_V2'",
    )
    function_start = text.index('function reconstructTensor(')
    function_end = text.index('\nfunction solve3(', function_start)
    functions = """function reconstructTensor(points, nodes, x, y) {
  return deepFreeze({
    sigmaX: reconstruct(points, nodes, x, y, (point) => point.stress?.sigmaX),
    sigmaY: reconstruct(points, nodes, x, y, (point) => point.stress?.sigmaY),
    sigmaZ: reconstruct(points, nodes, x, y, (point) => point.stress?.sigmaZ),
    tauXY: reconstruct(points, nodes, x, y, (point) => point.stress?.tauXY),
  });
}

function reconstruct(points, nodes, x, y, selector) {
  const matrix = points.map((point) => {
    const physical = mapT6(nodes, point.xi, point.eta);
    return [1, physical.x, physical.y];
  });
  const values = points.map(selector);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw probeError('LAFEA_B01_PROBE_STRESS_COMPONENT_INVALID');
  }
  const coefficients = solve3(matrix, values);
  return normalizeZero(coefficients[0] + coefficients[1] * x + coefficients[2] * y);
}
"""
    path.write_text(text[:function_start] + functions + text[function_end:])


def patch_kirsch_diagnostic() -> None:
    path = Path('scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs')
    text = path.read_text()
    old = "`${definition.probeId}: ${convergence.reasons.join(', ')}`"
    new = "`${definition.probeId}: ${JSON.stringify(convergence.convergence)}`"
    if text.count(old) != 1:
        raise RuntimeError(f'Kirsch assertion count={text.count(old)}')
    path.write_text(text.replace(old, new))


patch_solver()
patch_probe()
patch_kirsch_diagnostic()
