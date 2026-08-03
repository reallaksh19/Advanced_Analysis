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


def patch_mesh() -> None:
    path = Path('src/core/lafea-meshing/lug-pinhole-t6.js')
    text = path.read_text()
    old = """      addT6Element(state, `E-R${ring}-S${sector}-A`, [
        innerA, outerA, outerB,
      ]);
      addT6Element(state, `E-R${ring}-S${sector}-B`, [
        innerA, outerB, innerB,
      ]);"""
    new = """      const alternate = (ring + sector) % 2 === 1;
      if (alternate) {
        addT6Element(state, `E-R${ring}-S${sector}-A`, [
          innerA, outerA, innerB,
        ]);
        addT6Element(state, `E-R${ring}-S${sector}-B`, [
          outerA, outerB, innerB,
        ]);
      } else {
        addT6Element(state, `E-R${ring}-S${sector}-A`, [
          innerA, outerA, outerB,
        ]);
        addT6Element(state, `E-R${ring}-S${sector}-B`, [
          innerA, outerB, innerB,
        ]);
      }"""
    if text.count(old) != 1:
        raise RuntimeError(f'cell split count={text.count(old)}')
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
patch_mesh()
patch_kirsch_diagnostic()
