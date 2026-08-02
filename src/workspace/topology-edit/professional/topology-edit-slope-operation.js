import {
  createTopologyEditOperationPlan,
  createUnrepresentableTopologyEditOperationResult,
} from './topology-edit-operation-plan.js';
import { deriveTopologyEditChangedScope } from './topology-edit-change-scope.js';
import {
  assertMovedGeometry,
  exactNode,
  normalizeCanonicalIds,
  positiveMm,
  requiredText,
  routeContext,
  simpleOrderedPath,
} from './topology-edit-route-operation-helpers.js';

export function planApplyDeclaredSlope(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  const verticalAxis = requiredText(input.verticalAxis ?? 'Z', 'verticalAxis').toUpperCase();
  if (verticalAxis !== 'Z') {
    return createUnrepresentableTopologyEditOperationResult({
      operationType: 'APPLY_DECLARED_SLOPE',
      basisHash: context.basisHash,
      targetIds: normalizeCanonicalIds(input.orderedNodeIds ?? [], 'orderedNodeIds', 'node:'),
      reasonCode: 'VERTICAL_AXIS_NOT_SUPPORTED',
      reason: 'The current bounded slope planner supports only an explicitly declared Z vertical axis.',
    });
  }
  const path = simpleOrderedPath(context, input.orderedNodeIds);
  const riseMm = positiveMm(input.riseMm, 'riseMm');
  const runMm = positiveMm(input.runMm, 'runMm');
  const direction = requiredText(input.direction, 'direction').toUpperCase();
  if (!['ASCENDING', 'DESCENDING'].includes(direction)) {
    throw new RangeError('TopologyEditRouteOperations: direction must be ASCENDING or DESCENDING.');
  }
  const sign = direction === 'ASCENDING' ? 1 : -1;
  const anchor = exactNode(context, path.orderedNodeIds[0]);
  let cumulativeRunMm = 0;
  const movedPositions = new Map();
  for (let index = 1; index < path.orderedNodeIds.length; index += 1) {
    const previous = exactNode(context, path.orderedNodeIds[index - 1]);
    const current = exactNode(context, path.orderedNodeIds[index]);
    const horizontal = Math.hypot(
      current.position.x - previous.position.x,
      current.position.y - previous.position.y,
    );
    if (!(horizontal > 1e-9)) {
      throw new RangeError(
        `TopologyEditRouteOperations: slope segment ${previous.id} → ${current.id} has zero horizontal run.`,
      );
    }
    cumulativeRunMm += horizontal;
    movedPositions.set(current.id, {
      x: current.position.x,
      y: current.position.y,
      z: anchor.position.z + sign * cumulativeRunMm * (riseMm / runMm),
    });
  }
  assertMovedGeometry(context, movedPositions);
  const changedScope = deriveTopologyEditChangedScope(context.topology, {
    basisHash: context.basisHash,
    nodeIds: path.orderedNodeIds.slice(1),
    edgeIds: path.pathEdgeIds,
  });
  return createTopologyEditOperationPlan({
    operationType: 'APPLY_DECLARED_SLOPE',
    basisHash: context.basisHash,
    targetIds: path.orderedNodeIds,
    parameters: {
      orderedNodeIds: path.orderedNodeIds,
      pathEdgeIds: path.pathEdgeIds,
      verticalAxis,
      riseMm,
      runMm,
      direction,
    },
    commandIntents: path.orderedNodeIds.slice(1).map((nodeId) => ({
      commandType: 'MOVE_NODE',
      payload: { nodeId, position: movedPositions.get(nodeId) },
    })),
    changedScope,
    unresolvedEvidence: [],
  });
}
