import { deepFreeze, semanticHash } from './contracts.js';
import { validateCanonicalStructuralResult } from './canonical-result.js';
import { validateRawOutputManifest } from './raw-output-manifest.js';

export function reconstructNc00ExecutionBindings({
  canonicalModel,
  solverProfile,
  deckProfile,
  deckArtifact,
  rawManifest,
  parsedResult,
}) {
  validateRawOutputManifest(rawManifest);
  validateCanonicalStructuralResult(parsedResult);
  const expectedStepIds = canonicalModel.loadSteps.map((step) => step.stepId);
  const stepSequence = reconstructStepSequence(expectedStepIds, parsedResult.stepInventory);
  const outputCoverage = reconstructOutputCoverage(
    canonicalModel,
    deckArtifact,
    parsedResult.requestedOutputCoverage,
  );
  const checks = {
    modelBound: parsedResult.canonicalModelHash === canonicalModel.canonicalModelSemanticHash,
    solverBound: parsedResult.solverProfileHash === solverProfile.solverProfileSemanticHash,
    deckProfileBound: parsedResult.deckProfileHash === deckProfile.deckProfileSemanticHash,
    deckFileBound: rawManifest.deckSha256 === deckArtifact.deckSha256,
    manifestBound: parsedResult.rawOutputManifestHash === rawManifest.rawManifestSemanticHash,
    stdoutBound: rawManifest.files.some((row) => (
      row.relativePath === deckProfile.fileNames.stdout
      && row.sha256 === rawManifest.stdoutSha256
    )),
    stderrBound: rawManifest.files.some((row) => (
      row.relativePath === deckProfile.fileNames.stderr
      && row.sha256 === rawManifest.stderrSha256
    )),
    completionEvidenceBound: parsedResult.solverCompletionDisposition === 'COMPLETE'
      && parsedResult.completionEvidence.hasCompletionMarker === true
      && parsedResult.completionEvidence.hasFailureMarker === false,
    incrementSequenceBound:
      parsedResult.incrementSequenceEvidence.status === 'MONOTONIC_OR_EMPTY',
    stepSequenceBound: stepSequence.status !== 'MISMATCH'
      && stepSequence.status !== 'NOT_OBSERVED',
    requestedOutputCoverageBound: outputCoverage.status === 'COMPLETE',
    noUnmappedDeckOutputs: outputCoverage.unmappedByDeck.length === 0,
    noMissingRequiredRawFiles: rawManifest.files
      .filter((row) => row.required)
      .every((row) => typeof row.sha256 === 'string' && row.byteLength >= 0),
  };
  const evidence = {
    checks,
    stepSequence,
    outputCoverage,
    datasetInventorySummary: parsedResult.provisionalDatasetInventory.map((row) => ({
      sourceFile: row.sourceFile,
      ordinal: row.ordinal,
      datasetLabel: row.datasetLabel,
      recordCount: row.recordCount,
      finiteValueCount: row.finiteValueCount,
    })),
    canonicalModelHash: canonicalModel.canonicalModelSemanticHash,
    solverProfileHash: solverProfile.solverProfileSemanticHash,
    deckProfileHash: deckProfile.deckProfileSemanticHash,
    deckSha256: deckArtifact.deckSha256,
    rawManifestHash: rawManifest.rawManifestSemanticHash,
    parsedResultHash: parsedResult.resultPayloadSemanticHash,
  };
  return deepFreeze({
    status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    ...evidence,
    semanticHash: semanticHash(evidence),
  });
}

export function reconstructStepSequence(expectedStepIds, observedRows) {
  const observed = observedRows
    .filter((row) => row.source === 'TEXT_STEP_MARKER')
    .map((row) => row.stepId);
  if (observed.length === 0) {
    const ordinalRows = observedRows.filter((row) => row.source === 'FRD_PARAMETER_HEADER');
    return {
      status: ordinalRows.length === expectedStepIds.length ? 'ORDINAL_COUNT_ONLY' : 'NOT_OBSERVED',
      expectedStepIds,
      observedStepIds: ordinalRows.map((row) => row.stepId),
    };
  }
  const exact = observed.length === expectedStepIds.length
    && observed.every((value, index) => value === expectedStepIds[index]);
  return {
    status: exact ? 'EXACT' : 'MISMATCH',
    expectedStepIds,
    observedStepIds: observed,
  };
}

export function reconstructOutputCoverage(canonicalModel, deckArtifact, parsedCoverage) {
  const requested = [...new Set([
    ...canonicalModel.requestedOutputs,
    ...canonicalModel.loadSteps.flatMap((step) => step.outputRequests),
  ])].sort();
  const mapRows = Object.values(deckArtifact.maps.outputRequestMap ?? {});
  const emitted = [...new Set(mapRows.flatMap((row) => row.emitted ?? []))].sort();
  const unmappedByDeck = [...new Set(mapRows.flatMap((row) => row.unmapped ?? []))].sort();
  const missingInRawOutput = requested.filter(
    (field) => !parsedCoverage.available.includes(field),
  );
  return {
    status: unmappedByDeck.length === 0 && missingInRawOutput.length === 0
      ? 'COMPLETE'
      : 'INCOMPLETE',
    requested,
    emittedByDeck: emitted,
    unmappedByDeck,
    availableInRawOutput: [...parsedCoverage.available].sort(),
    missingInRawOutput,
  };
}
