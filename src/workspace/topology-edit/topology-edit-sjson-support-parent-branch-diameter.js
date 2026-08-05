import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';
import {
  buildSjsonParentBranchDiameterIndex,
  parentBranchDiameterForEntity,
} from './topology-edit-sjson-parent-branch-diameter.js';

export const TOPOLOGY_EDIT_SJSON_SUPPORT_PARENT_BRANCH_DIAMETER =
  'TopologyEditSjsonSupportParentBranchDiameter.v1';

/**
 * Supplies the support/restraint visual projection with the same parent-branch
 * diameter authority used by pipes and fittings. The input canonical topology
 * remains untouched; only a detached support-projection topology is returned.
 */
export function applySjsonParentBranchDiametersToSupportTopology(
  canonicalTopology,
  dataset,
  existingIndex = null,
) {
  if (!canonicalTopology?.nodes || !canonicalTopology?.edges) {
    throw new TypeError('Support parent-branch diameter projection requires canonical topology.');
  }
  const index = existingIndex || buildSjsonParentBranchDiameterIndex(dataset);
  const entities = new Map(
    (dataset?.entities || []).map((entity) => [stringValue(entity.entityId), entity]),
  );
  const adaptations = [];
  const edges = (canonicalTopology.edges || []).map((edge) => {
    const entity = entities.get(stringValue(edge.componentKey));
    const context = entity ? parentBranchDiameterForEntity(index, entity) : null;
    if (!(context?.diameterMm > 0)) return edge;
    adaptations.push({
      edgeId: stringValue(edge.id),
      componentKey: stringValue(edge.componentKey),
      parentBranchId: context.branchId,
      outsideDiameterMm: context.diameterMm,
      dimensionBasis: context.dimensionBasis,
    });
    return {
      ...edge,
      outsideDiameterMm: context.diameterMm,
      supportVisualOutsideDiameterAuthority: 'SOURCE_PARENT_BRANCH',
      supportVisualDimensionBasis: context.dimensionBasis,
      supportVisualParentBranchId: context.branchId,
    };
  });
  return deepFreeze({
    ...canonicalTopology,
    edges,
    supportVisualDiameterAuthority: TOPOLOGY_EDIT_SJSON_SUPPORT_PARENT_BRANCH_DIAMETER,
    supportVisualDiameterIndexHash: index.indexHash,
    supportVisualDiameterAdaptations: adaptations.sort((left, right) => (
      left.edgeId.localeCompare(right.edgeId)
    )),
  });
}
