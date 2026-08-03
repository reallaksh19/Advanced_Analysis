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
    import_marker = "import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';\n"
    text = text.replace(
        import_marker,
        import_marker + "import { t6BMatrixAt } from '../core/local-continuum/t6-element.js';\n",
    )
    call_start = text.index('  const components = reconstructTensor(')
    call_end = text.index('\n  );', call_start) + len('\n  );')
    call = """  const components = recoverTensorAtProbe(
    result,
    loadCase,
    candidate,
    elementResult,
  );"""
    text = text[:call_start] + call + text[call_end:]
    old_method = "'T6_THREE_POINT_LINEAR_NATURAL_COORDINATE_RECONSTRUCTION_V1'"
    if text.count(old_method) != 1:
        raise RuntimeError(f'recovery method count={text.count(old_method)}')
    text = text.replace(
        old_method,
        "'T6_DIRECT_ELEMENT_FIELD_AT_FIXED_PROBE_V1'",
    )
    insertion = text.index('function reconstructTensor(')
    helper = """function recoverTensorAtProbe(result, loadCase, candidate, elementResult) {
  const retained = result.meshEvidence.elementEvidence.find(
    (row) => row.elementId === candidate.element.elementId,
  );
  if (!retained || !Array.isArray(retained.dMatrix)) {
    throw probeError('LAFEA_B01_PROBE_ELEMENT_EVIDENCE_MISSING');
  }
  const displacementByNode = new Map(
    loadCase.nodalDisplacements.map((row) => [row.nodeId, row]),
  );
  const localDisplacement = candidate.element.nodeIds.flatMap((nodeId) => {
    const row = displacementByNode.get(nodeId);
    if (!row) throw probeError('LAFEA_B01_PROBE_DISPLACEMENT_MISSING');
    return [row.ux, row.uy];
  });
  const { B } = t6BMatrixAt(
    candidate.nodes,
    candidate.natural.xi,
    candidate.natural.eta,
  );
  const strain = multiplyMatrixVector(B, localDisplacement);
  const rawStress = multiplyMatrixVector(retained.dMatrix, strain);
  const offsets = elementResult.gaussPointResults.map((point) => {
    const pointStrain = [
      point.strain.epsilonX,
      point.strain.epsilonY,
      point.strain.gammaXY,
    ];
    const pointRaw = multiplyMatrixVector(retained.dMatrix, pointStrain);
    return [
      pointRaw[0] - point.stress.sigmaX,
      pointRaw[1] - point.stress.sigmaY,
      pointRaw[2] - point.stress.tauXY,
    ];
  });
  const offset = [0, 1, 2].map((component) => (
    offsets.reduce((sum, row) => sum + row[component], 0) / offsets.length
  ));
  const scale = Math.max(
    1,
    ...rawStress.map(Math.abs),
    ...elementResult.gaussPointResults.flatMap((point) => [
      Math.abs(point.stress.sigmaX),
      Math.abs(point.stress.sigmaY),
      Math.abs(point.stress.tauXY),
    ]),
  );
  const spread = Math.max(...offsets.flatMap((row) => row.map(
    (value, component) => Math.abs(value - offset[component]),
  )));
  if (spread > 1e-10 * scale) {
    throw probeError('LAFEA_B01_PROBE_ELEMENT_STRESS_OFFSET_NOT_CONSTANT');
  }
  const sigmaX = normalizeZero(rawStress[0] - offset[0]);
  const sigmaY = normalizeZero(rawStress[1] - offset[1]);
  const tauXY = normalizeZero(rawStress[2] - offset[2]);
  let sigmaZ = 0;
  if (result.meshEvidence.formulation === 'PLANE_STRAIN') {
    const ratio = retained.dMatrix[0][1] / retained.dMatrix[0][0];
    const poissonRatio = ratio / (1 + ratio);
    sigmaZ = normalizeZero(poissonRatio * (sigmaX + sigmaY));
  }
  return deepFreeze({ sigmaX, sigmaY, sigmaZ, tauXY });
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, index) => sum + value * vector[index],
    0,
  ));
}

"""
    path.write_text(text[:insertion] + helper + text[insertion:])


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
