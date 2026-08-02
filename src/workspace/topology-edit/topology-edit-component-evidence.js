/** Read-only extraction of explicit component geometry evidence from workspace data. */

export function buildTopologyEditComponentEvidence(dataset) {
  const evidence = {};
  for (const entity of dataset?.entities || []) {
    const attributes = mergedAttributes(entity);
    evidence[entity.entityId] = {
      workspaceEntityIds: [entity.entityId],
      sourcePath: entity.sourcePath,
      outsideDiameterMm: firstFinite(
        entity.outsideDiameterMm,
        attributes.outsideDiameterMm,
        attributes.OUTSIDE_DIAMETER,
      ),
      boreMm: firstFinite(entity.boreMm, attributes.boreMm, attributes.BORE),
      wallThicknessMm: firstFinite(
        entity.wallThicknessMm,
        attributes.wallThicknessMm,
        attributes.WALL_THICKNESS,
      ),
      centerlineRadiusMm: firstFinite(
        attributes.centerlineRadiusMm,
        attributes.CENTERLINE_RADIUS,
        attributes.BEND_RADIUS,
      ),
      center: finitePoint(entity.properties?.geometry?.center),
      reducerType: attributes.reducerType || attributes.REDUCER_TYPE,
      startOutsideDiameterMm: firstFinite(
        attributes.startOutsideDiameterMm,
        attributes.START_OUTSIDE_DIAMETER,
      ),
      endOutsideDiameterMm: firstFinite(
        attributes.endOutsideDiameterMm,
        attributes.END_OUTSIDE_DIAMETER,
      ),
      eccentricOffsetDirection: finitePoint(attributes.eccentricOffsetDirection),
      branchOutsideDiameterMm: firstFinite(
        attributes.branchOutsideDiameterMm,
        attributes.BRANCH_OUTSIDE_DIAMETER,
      ),
      hostEntityId: attributes.hostEntityId || attributes.HOST_ENTITY_ID,
      branchNodeId: attributes.branchNodeId || attributes.BRANCH_NODE_ID,
      runNodeIds: Array.isArray(attributes.runNodeIds) ? [...attributes.runNodeIds] : undefined,
      allowBranchSizeInheritance: attributes.allowBranchSizeInheritance === true,
      sourceEvidenceId: entity.sourcePath || entity.entityId,
    };
  }
  return Object.freeze(evidence);
}

function mergedAttributes(entity) {
  return {
    ...(entity.properties?.sourceAttributes || {}),
    ...(entity.properties?.attributes || {}),
    ...(entity.properties?.nativeParams || {}),
  };
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) }
    : undefined;
}
