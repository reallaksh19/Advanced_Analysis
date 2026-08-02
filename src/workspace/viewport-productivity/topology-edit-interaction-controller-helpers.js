export function topologyEditInteractionAxisDirection(axisInput) {
  const axis = String(axisInput ?? '').trim().toUpperCase();
  if (!['X', 'Y', 'Z'].includes(axis)) throw new RangeError('Axis must be X, Y or Z.');
  return {
    x: axis === 'X' ? 1 : 0,
    y: axis === 'Y' ? 1 : 0,
    z: axis === 'Z' ? 1 : 0,
  };
}

export function topologyEditInteractionPointsEqual(left, right) {
  return ['x', 'y', 'z'].every(
    (key) => Number(left?.[key]) === Number(right?.[key]),
  );
}

export function topologyEditInteractionIsTextControl(target) {
  const name = String(target?.tagName ?? '').toUpperCase();
  return Boolean(
    target?.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(name),
  );
}

export function projectTopologyEditInteractionEvidence(
  hostElement,
  runtimeState,
  acceptance = null,
) {
  if (!hostElement) return;
  hostElement.dataset.topologyEditInteractionRuntimeHash =
    runtimeState?.runtimeHash ?? '';
  hostElement.dataset.topologyEditInteractionPreviewHash =
    runtimeState?.preview?.previewHash ?? '';
  hostElement.dataset.topologyEditInteractionIntentHash =
    runtimeState?.intent?.intentHash ?? '';
  hostElement.dataset.topologyEditInteractionBasisHash =
    runtimeState?.basisHash ?? '';
  hostElement.dataset.topologyEditInteractionAcceptanceHash =
    acceptance?.acceptanceHash ?? '';
  hostElement.dataset.topologyEditInteractionCertificationHash =
    acceptance?.certificationHash ?? '';
}
