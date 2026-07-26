/**
 * Mesh-package preflight.
 *
 * Predicts DOF count, sparse storage and evidence-export size in O(N + E),
 * BEFORE any adaptation, solve or hashing is attempted. Its purpose is to stop
 * the workbench from spending tens of seconds only to reject the run at the
 * final export stage on a byte-capacity limit the user was never shown.
 *
 * The export-size model is a two-parameter linear fit calibrated against
 * measured exports of structured Q4 grids. Its coefficients live in
 * EXPORT_CALIBRATION together with the data they were fitted to, so the model
 * is auditable and refittable rather than a pair of magic numbers.
 */
import { estimateCsrStorageBytes } from '../core/element-fea/index.js';

export const EXPORT_CALIBRATION = Object.freeze({
  calibrationIdentity: 'LFEA_EXPORT_SIZE_LINEAR_V1',
  bytesPerNode: 5338.3,
  bytesPerRawStressRow: 6525.6,
  fittedTo: Object.freeze([
    { nodes: 81, rawStressRows: 256, measuredBytes: 2114042 },
    { nodes: 225, rawStressRows: 784, measuredBytes: 6311181 },
    { nodes: 441, rawStressRows: 1600, measuredBytes: 12789884 },
    { nodes: 729, rawStressRows: 2704, measuredBytes: 21540676 },
  ]),
  worstFitErrorFraction: 0.0052,
  note: 'Fitted on structured Q4 grids, plane stress, projection enabled. '
    + 'Refit and re-record this block if the review or export contract changes.',
});

export const PREFLIGHT_STATUS = Object.freeze({
  WITHIN_CAPACITY: 'WITHIN_CAPACITY',
  EXPORT_AT_RISK: 'EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY',
  BLOCKED: 'BLOCKED_BY_DECLARED_CAPACITY',
});

/**
 * Predict cost and capacity outcome without solving.
 *
 * @param {Record<string, unknown>} packageValue Mesh package (need not be sealed).
 * @param {Record<string, unknown>} adapterProfile Adapter capacity profile.
 * @param {Record<string, unknown>} reviewProfile Review/export profile.
 * @returns {Readonly<Record<string, unknown>>} Immutable preflight record.
 */
export function preflightMeshPackage(packageValue, adapterProfile, reviewProfile) {
  const nodes = Array.isArray(packageValue?.nodes) ? packageValue.nodes : [];
  const elements = Array.isArray(packageValue?.elements) ? packageValue.elements : [];
  const nodeCount = nodes.length;
  const elementCount = elements.length;
  const dofCount = 2 * nodeCount;

  // Upper bound on structural nonzeros: every element couples all of its own
  // DOFs. Over-counting shared entries is deliberate — for a capacity gate the
  // safe side is to over-predict.
  const nonzeroUpperBound = elements.reduce(
    (sum, element) => sum + (2 * (element.nodeIds?.length ?? 0)) ** 2,
    dofCount,
  );
  const sparseStorageBytes = estimateCsrStorageBytes(dofCount, nonzeroUpperBound);

  const rawStressRows = elements.reduce(
    (sum, element) => sum + (element.elementType === 'Q4' ? 4 : 1),
    0,
  );
  const estimatedExportBytes = Math.round(
    EXPORT_CALIBRATION.bytesPerNode * nodeCount
    + EXPORT_CALIBRATION.bytesPerRawStressRow * rawStressRows,
  );

  const blockers = [];
  if (nodeCount > adapterProfile.maximumNodes) {
    blockers.push(capacityRow('NODE_COUNT', nodeCount, adapterProfile.maximumNodes));
  }
  if (elementCount > adapterProfile.maximumElements) {
    blockers.push(capacityRow('ELEMENT_COUNT', elementCount, adapterProfile.maximumElements));
  }

  const exportAtRisk = estimatedExportBytes > reviewProfile.maximumExportBytes;
  const status = blockers.length
    ? PREFLIGHT_STATUS.BLOCKED
    : exportAtRisk ? PREFLIGHT_STATUS.EXPORT_AT_RISK : PREFLIGHT_STATUS.WITHIN_CAPACITY;

  return Object.freeze({
    schema: 'lfea-preflight/v1',
    status,
    nodeCount,
    elementCount,
    dofCount,
    rawStressRows,
    nonzeroUpperBound,
    sparseStorageBytes,
    estimatedExportBytes,
    estimateBasis: EXPORT_CALIBRATION.calibrationIdentity,
    estimateWorstFitErrorFraction: EXPORT_CALIBRATION.worstFitErrorFraction,
    declaredMaximumExportBytes: reviewProfile.maximumExportBytes,
    declaredMaximumElements: adapterProfile.maximumElements,
    declaredMaximumNodes: adapterProfile.maximumNodes,
    effectiveElementCeiling: effectiveElementCeiling(reviewProfile.maximumExportBytes),
    blockers: Object.freeze(blockers),
    recommendedStage: blockers.length ? null : (exportAtRisk ? 'SOLVE' : 'EXPORT'),
    advice: adviceFor(status, estimatedExportBytes, reviewProfile.maximumExportBytes),
  });
}

/**
 * Largest structured-Q4 element count whose export is predicted to fit.
 *
 * For a structured quad grid the node count approaches the element count, so
 * bytes ~= (bytesPerNode + 4 * bytesPerRawStressRow) * elements. Reported so a
 * declared element capacity can be checked against what the chain can deliver.
 *
 * @param {number} maximumExportBytes Declared export byte capacity.
 * @returns {number} Effective element ceiling.
 */
export function effectiveElementCeiling(maximumExportBytes) {
  const perElement = EXPORT_CALIBRATION.bytesPerNode + 4 * EXPORT_CALIBRATION.bytesPerRawStressRow;
  return Math.floor(maximumExportBytes / perElement);
}

function capacityRow(limitId, requested, allowed) {
  return Object.freeze({ limitId, requested, allowed, exceededBy: requested - allowed });
}

function adviceFor(status, estimated, allowed) {
  if (status === PREFLIGHT_STATUS.BLOCKED) {
    return 'This mesh exceeds a declared adapter capacity. Reduce the mesh or raise the adapter profile limits.';
  }
  if (status === PREFLIGHT_STATUS.EXPORT_AT_RISK) {
    return `The evidence export is predicted at ${formatBytes(estimated)}, above the declared `
      + `${formatBytes(allowed)} limit. Run to SOLVE to obtain displacements and stress; the export stage `
      + 'would be rejected. This is predicted before any work is spent.';
  }
  return `Predicted export ${formatBytes(estimated)} of ${formatBytes(allowed)} allowed.`;
}

function formatBytes(value) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} kB`;
  return `${value} B`;
}
