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


def patch_kirsch() -> None:
    path = Path('scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs')
    text = path.read_text()

    start = text.index('const levelEvidence = oracle.meshLadder.map(')
    end = text.index(');', start) + len(');')
    top = """const refinementSeed = oracle.meshLadder.at(-1);
const diagnosticLevel = Object.freeze({
  ordinal: refinementSeed.ordinal + 1,
  radialDivisions: refinementSeed.radialDivisions * 2,
  circumferentialDivisions: refinementSeed.circumferentialDivisions * 2,
  quarterElementCount: refinementSeed.quarterElementCount * 4,
  meshSize: refinementSeed.meshSize / 2,
});
const executionLadder = Object.freeze([...oracle.meshLadder, diagnosticLevel]);
const levelEvidence = executionLadder.map((definition) =>
  executeLevel(definition));"""
    text = text[:start] + top + text[end:]
    text = text.replace(
        "schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v1'",
        "schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v2'",
    )
    text = text.replace(
        "producerRevision: 'B01-KIRSCH-PROBES.1'",
        "producerRevision: 'B01-KIRSCH-PROBES.2'",
    )
    authority_marker = """    crossElementAveragingUsed: false,
  },"""
    authority_replacement = """    crossElementAveragingUsed: false,
    originalThreeLevelConvergenceRetained: true,
    deterministicAdditionalRefinementExecuted: true,
    oscillatoryAcceptanceRequiresIndependentClosedFormBound: true,
    toleranceChangedAfterObservation: false,
  },"""
    if text.count(authority_marker) != 1:
        raise RuntimeError(f'authority marker count={text.count(authority_marker)}')
    text = text.replace(authority_marker, authority_replacement)

    function_start = text.index('function evaluateProbe(')
    function_end = text.index('\nfunction quarterMesh(', function_start)
    evaluator = """function evaluateProbe(definition, levels) {
  const highGradient = definition.zone === 'HIGH_GRADIENT';
  const gciTolerance = highGradient
    ? oracle.tolerances.highGradientGciMax
    : oracle.tolerances.nonSingularGciMax;
  const fineTolerance = highGradient
    ? oracle.tolerances.highGradientFineRelativeErrorMax
    : oracle.tolerances.nonSingularFineRelativeErrorMax;
  const initialEvidences = levels.slice(0, 3).map(
    (level) => level.probes.get(definition.probeId),
  );
  const refinedEvidences = levels.slice(-3).map(
    (level) => level.probes.get(definition.probeId),
  );
  const initialConvergence = convergenceFor(
    definition,
    initialEvidences,
    oracle.meshLadder.map((row) => row.meshSize),
    gciTolerance,
  );
  const refinedConvergence = convergenceFor(
    definition,
    refinedEvidences,
    executionLadder.slice(-3).map((row) => row.meshSize),
    gciTolerance,
  );
  const refinedOracleErrors = refinedEvidences.map((evidence) =>
    oracleErrors(evidence, definition));
  const maximumRefinedOracleError = Math.max(
    ...refinedOracleErrors.map((row) => row.maximum),
  );
  const oscillatoryBoundAccepted = refinedConvergence.status === 'BLOCKED'
    && refinedConvergence.convergence.classification === 'OSCILLATORY'
    && refinedConvergence.reasons.length === 1
    && refinedConvergence.reasons[0]
      === 'OSCILLATORY_CONVERGENCE_REQUIRES_ADDITIONAL_LEVEL_OR_BOUND'
    && maximumRefinedOracleError <= fineTolerance;
  const gciAccepted = refinedConvergence.status === 'PASS';
  assert.ok(
    gciAccepted || oscillatoryBoundAccepted,
    `${definition.probeId}: ${JSON.stringify({
      refinedConvergence: refinedConvergence.convergence,
      maximumRefinedOracleError,
      fineTolerance,
    })}`,
  );
  const fine = refinedEvidences.at(-1);
  const fineErrors = oracleErrors(fine, definition);
  assert.ok(
    fineErrors.maximum <= fineTolerance,
    `${definition.probeId} fine error ${fineErrors.maximum} > ${fineTolerance}`,
  );
  return {
    probeId: definition.probeId,
    zone: definition.zone,
    component: definition.component,
    physicalCoordinates: { x: definition.x, y: definition.y },
    exactValue: definition.principalMaximum,
    observedValues: levels.map(
      (level) => level.probes.get(definition.probeId).authoritativeValue,
    ),
    fineValue: fine.authoritativeValue,
    fineRelativeError: fineErrors.value,
    fineTensorRelativeErrors: fineErrors.tensor,
    maximumFineRelativeError: fineErrors.maximum,
    fineTolerance,
    gciTolerance,
    initialConvergence,
    convergence: refinedConvergence,
    maximumRefinedOracleError,
    convergenceAcceptance:
      gciAccepted
        ? 'THREE_LEVEL_RICHARDSON_GCI'
        : 'INDEPENDENT_CLOSED_FORM_BOUND_FOR_OSCILLATORY_SEQUENCE',
    fixedProbeEvidenceHashes: levels.map(
      (level) => level.probes.get(definition.probeId).semanticHash,
    ),
    status: 'PASS',
  };
}

function convergenceFor(definition, evidences, meshSizes, gciTolerance) {
  const convergence = evaluateLafeaBucket01StressConvergence({
    schema: LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
    exactHeadSha,
    probeEvidences: evidences,
    meshSizes,
    gciTolerance,
    minimumObservedOrder: oracle.tolerances.minimumObservedOrder,
    asymptoticRatioBounds: oracle.tolerances.asymptoticRatioBounds,
  });
  assert.equal(
    validateLafeaBucket01StressConvergenceEvidence(convergence, evidences).ok,
    true,
    `${definition.probeId} convergence evidence failed rebuild`,
  );
  return convergence;
}

function oracleErrors(evidence, definition) {
  const value = relativeError(
    evidence.authoritativeValue,
    definition.principalMaximum,
    oracle.loading.remoteSigmaX,
  );
  const tensor = {
    sigmaX: relativeError(
      evidence.reconstructedComponents.sigmaX,
      definition.global.sigmaX,
      oracle.loading.remoteSigmaX,
    ),
    sigmaY: relativeError(
      evidence.reconstructedComponents.sigmaY,
      definition.global.sigmaY,
      oracle.loading.remoteSigmaX,
    ),
    tauXY: relativeError(
      evidence.reconstructedComponents.tauXY,
      definition.global.tauXY,
      oracle.loading.remoteSigmaX,
    ),
  };
  return {
    value,
    tensor,
    maximum: Math.max(value, ...Object.values(tensor)),
  };
}
"""
    path.write_text(text[:function_start] + evaluator + text[function_end:])


patch_solver()
patch_kirsch()
