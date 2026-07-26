/**
 * Explicit capacity and review profiles for the LFEA workbench pipeline.
 *
 * Profiles contain policy only. They perform no mesh adaptation, solving, or
 * evidence calculation.
 */
export function createLfeaWorkbenchAdapterProfile() {
  return deepFreeze({
    schema: 'lfea-mesh-adapter-profile/v1',
    profileIdentity: 'lfea-workbench-adapter-v1',
    coordinateAbsoluteTolerance: 1e-9,
    areaAbsoluteTolerance: 1e-12,
    jacobianAbsoluteTolerance: 1e-12,
    maximumNodes: 2400,
    maximumElements: 2000,
    maximumEdges: 50000,
    maximumRegions: 1000,
    maximumBoundaries: 1000,
    maximumPoints: 1000,
    maximumAssignments: 10000,
  });
}

export function createLfeaWorkbenchReviewProfile(
  includeProjectedStress,
  includeConvergenceEvidence,
) {
  return deepFreeze({
    schema: 'lfea-review-profile/v1',
    profileIdentity: includeProjectedStress
      ? 'lfea-workbench-review-projected-v1'
      : 'lfea-workbench-review-raw-v1',
    deformationScale: 10,
    coordinateDisplayPrecision: 6,
    displacementDisplayPrecision: 8,
    forceDisplayPrecision: 8,
    stressDisplayPrecision: 8,
    energyDisplayPrecision: 10,
    includeProjectedStress,
    includeConvergenceEvidence: Boolean(includeConvergenceEvidence),
    includeSourceArtifacts: false,
    maximumExportRows: 400000,
    maximumExportBytes: 67108864,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
