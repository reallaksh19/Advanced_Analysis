import { semanticHash, sha256Bytes } from './contracts.js';
import { createCanonicalStructuralResult } from './canonical-result.js';
import { validateRawOutputManifest } from './raw-output-manifest.js';
import { inventoryExternalSolverOutputs } from './structural-output-inventory.js';

export function parseExternalSolverStructuralResult({
  canonicalModel,
  solverProfile,
  deckProfile,
  rawManifest,
  retainedFiles,
}) {
  validateRawOutputManifest(rawManifest);
  if (!(retainedFiles instanceof Map)) {
    throw new TypeError('retainedFiles must be an internal Map of relative paths to Buffer values.');
  }
  rawManifest.files.forEach((row) => {
    const bytes = retainedFiles.get(row.relativePath);
    if (!Buffer.isBuffer(bytes)) {
      if (row.required) throw new TypeError(`Missing required retained file ${row.relativePath}.`);
      return;
    }
    if (bytes.length !== row.byteLength || sha256Bytes(bytes) !== row.sha256) {
      throw new TypeError(`Raw file custody mismatch for ${row.relativePath}.`);
    }
  });

  const inventory = inventoryExternalSolverOutputs(retainedFiles, canonicalModel);
  let solverCompletionDisposition = 'INCOMPLETE';
  if (rawManifest.timeoutDisposition === 'TIMED_OUT') solverCompletionDisposition = 'FAILED';
  else if (rawManifest.exitCode !== 0 || inventory.completionEvidence.hasFailureMarker) {
    solverCompletionDisposition = 'FAILED';
  } else if (inventory.completionEvidence.hasCompletionMarker) {
    solverCompletionDisposition = 'COMPLETE';
  }

  const diagnostics = [];
  if (!inventory.completionEvidence.hasCompletionMarker) {
    diagnostics.push('MISSING_SOLVER_COMPLETION_MARKER');
  }
  inventory.completionEvidence.failureMarkers.forEach((marker) => {
    diagnostics.push(`SOLVER_FAILURE_PATTERN:${marker}`);
  });
  if (rawManifest.exitCode !== 0) diagnostics.push(`NONZERO_EXIT_CODE:${rawManifest.exitCode}`);
  if (inventory.incrementSequenceEvidence.status === 'NON_MONOTONIC') {
    diagnostics.push('NON_MONOTONIC_INCREMENT_INVENTORY');
  }
  inventory.requestedOutputCoverage.missing.forEach((field) => {
    diagnostics.push(`REQUESTED_OUTPUT_NOT_OBSERVED:${field}`);
  });
  if (retainedFiles.has('model.frd') && !inventory.completionEvidence.frdEndRecordPresent) {
    diagnostics.push('FRD_END_RECORD_NOT_OBSERVED');
  }

  return createCanonicalStructuralResult({
    schema: 'nonlinear-shell-contact-result/v1',
    requestId: rawManifest.requestId,
    modelId: canonicalModel.modelId,
    canonicalModelHash: canonicalModel.canonicalModelSemanticHash,
    solverProfileHash: solverProfile.solverProfileSemanticHash,
    deckProfileHash: deckProfile.deckProfileSemanticHash,
    rawOutputManifestHash: rawManifest.rawManifestSemanticHash,
    solverCompletionDisposition,
    stepInventory: inventory.stepInventory,
    incrementInventory: inventory.incrementInventory,
    availableFieldInventory: inventory.availableFieldInventory,
    completionEvidence: inventory.completionEvidence,
    incrementSequenceEvidence: inventory.incrementSequenceEvidence,
    requestedOutputCoverage: inventory.requestedOutputCoverage,
    provisionalDatasetInventory: inventory.provisionalDatasetInventory,
    diagnostics,
    limitations: [
      'NC00_STRUCTURAL_AND_DATASET_INVENTORY_ONLY',
      'PROVISIONAL_NUMERIC_MIN_MAX_ARE_NOT_ENGINEERING_RESULTS',
      'NO_SHELL_ACCEPTANCE',
      'NO_CONTACT_ACCEPTANCE',
      'NO_DENTING_ACCEPTANCE',
      'NO_LAST_FRAME_WITHOUT_COMPLETION_EVIDENCE',
    ],
    executionEvidenceHash: semanticHash({
      rawManifestHash: rawManifest.rawManifestSemanticHash,
      fullRetainedFileHashes: rawManifest.files.map((row) => row.sha256),
      completionEvidence: inventory.completionEvidence,
      requestedOutputCoverage: inventory.requestedOutputCoverage,
      provisionalDatasetInventory: inventory.provisionalDatasetInventory,
    }),
  });
}
