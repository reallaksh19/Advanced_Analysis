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


def patch_kirsch_refinement() -> None:
    path = Path('scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs')
    text = path.read_text()
    start = text.index('const levelEvidence = oracle.meshLadder.map(')
    end = text.index(');', start) + len(');')
    replacement = """const diagnosticLevel = Object.freeze({
  ordinal: 4,
  radialDivisions: 32,
  circumferentialDivisions: 256,
  quarterElementCount: 4096,
  meshSize: 0.015625,
});
const executionLadder = Object.freeze([...oracle.meshLadder, diagnosticLevel]);
const levelEvidence = executionLadder.map((definition) =>
  executeLevel(definition));"""
    text = text[:start] + replacement + text[end:]
    text = text.replace(
        '  const evidences = levels.map((level) => level.probes.get(definition.probeId));',
        """  const convergenceLevels = levels.slice(-3);
  const evidences = convergenceLevels.map(
    (level) => level.probes.get(definition.probeId),
  );""",
    )
    text = text.replace(
        '    meshSizes: oracle.meshLadder.map((row) => row.meshSize),',
        '    meshSizes: executionLadder.slice(-3).map((row) => row.meshSize),',
    )
    old = "`${definition.probeId}: ${convergence.reasons.join(', ')}`"
    new = "`${definition.probeId}: ${JSON.stringify(convergence.convergence)}`"
    if text.count(old) != 1:
        raise RuntimeError(f'Kirsch assertion count={text.count(old)}')
    path.write_text(text.replace(old, new))


patch_solver()
patch_kirsch_refinement()
