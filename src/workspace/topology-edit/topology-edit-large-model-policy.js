/** Deterministic presentation policy for keeping large 3D edit models responsive. */
export const TOPOLOGY_EDIT_LARGE_MODEL_TIERS = Object.freeze({
  STANDARD: 'STANDARD',
  LARGE: 'LARGE',
  MASSIVE: 'MASSIVE',
});

export const TOPOLOGY_EDIT_LARGE_MODEL_THRESHOLDS = Object.freeze({
  large: 2_500,
  massive: 12_000,
});

export function createTopologyEditLargeModelPolicy({
  model,
  devicePixelRatio = 1,
  viewportWidth = 1,
  viewportHeight = 1,
} = {}) {
  const complexity = topologyEditRenderComplexity(model);
  const tier = complexity.renderItemCount >= TOPOLOGY_EDIT_LARGE_MODEL_THRESHOLDS.massive
    ? TOPOLOGY_EDIT_LARGE_MODEL_TIERS.MASSIVE
    : complexity.renderItemCount >= TOPOLOGY_EDIT_LARGE_MODEL_THRESHOLDS.large
      ? TOPOLOGY_EDIT_LARGE_MODEL_TIERS.LARGE
      : TOPOLOGY_EDIT_LARGE_MODEL_TIERS.STANDARD;
  const requestedPixelRatio = positive(devicePixelRatio) ?? 1;
  const pixelRatioCap = tier === TOPOLOGY_EDIT_LARGE_MODEL_TIERS.MASSIVE
    ? 1
    : tier === TOPOLOGY_EDIT_LARGE_MODEL_TIERS.LARGE
      ? 1.5
      : 2;
  const pixelRatio = Math.min(requestedPixelRatio, pixelRatioCap);
  const viewportPixels = Math.max(1, finite(viewportWidth, 1))
    * Math.max(1, finite(viewportHeight, 1))
    * pixelRatio
    * pixelRatio;
  return Object.freeze({
    schema: 'TopologyEditLargeModelPolicy.v1',
    tier,
    ...complexity,
    requestedPixelRatio,
    pixelRatioCap,
    pixelRatio,
    viewportPixels,
    objectTreeInitialRows: tier === TOPOLOGY_EDIT_LARGE_MODEL_TIERS.STANDARD ? 240 : 160,
    objectTreeRowIncrement: tier === TOPOLOGY_EDIT_LARGE_MODEL_TIERS.MASSIVE ? 120 : 160,
    gpuFirstPicking: true,
    sourceVisualReuse: true,
  });
}

export function topologyEditRenderComplexity(model) {
  const projections = [model?.source, model?.draft, model?.supports].filter(Boolean);
  const counts = projections.reduce((result, projection) => {
    result.elements += count(projection.elements);
    result.segments += count(projection.segments);
    result.compactElements += count(projection.compactElements);
    result.compactSegments += count(projection.compactSegments);
    result.primitives += count(projection.primitives);
    result.glyphOverlays += count(projection.glyphOverlays);
    return result;
  }, {
    elements: 0,
    segments: 0,
    compactElements: 0,
    compactSegments: 0,
    primitives: 0,
    glyphOverlays: 0,
  });
  const renderItemCount = counts.elements
    + counts.segments
    + counts.compactElements
    + counts.compactSegments
    + counts.primitives
    + counts.glyphOverlays;
  return Object.freeze({ ...counts, renderItemCount });
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
