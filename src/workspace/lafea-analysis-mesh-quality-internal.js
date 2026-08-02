/**
 * Private NB-T4A analysis-mesh quality implementation.
 *
 * This module evaluates only an already-canonical, stage-authorized analysis
 * mesh. It does not generate topology, execute an engine, or create lifecycle
 * evidence. The public contract remains lafea-analysis-mesh-contract.js.
 */
import {
  qualifyScaledJacobian,
  worstStatus,
} from '../core/lafea-meshing/index.js';

export function qualifyLafeaAnalysisMeshQuality(
  stageId,
  mesh,
  meshProfile,
  qualitySchema,
) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const thresholds = meshProfile.fields;
  const elementResults = mesh.elements.map((element) => {
    const physicalNodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    if (stageId === 'LAFEA.3' && physicalNodes.some((node) => node.z !== 0)) {
      throw meshQualityError('LAFEA_ANALYSIS_MESH_CONTINUUM_NODE_NOT_PLANAR');
    }
    const cornerCount = element.elementType === 'Q8' ? 4 : 3;
    const aspectRatio = aspectRatioMetric(
      physicalNodes.slice(0, cornerCount), thresholds,
    );
    const scaledJacobian = scaledJacobianMetric(
      stageId, element.elementType, physicalNodes, thresholds,
    );
    const metrics = Object.freeze([aspectRatio, scaledJacobian]);
    return Object.freeze({
      elementId: element.elementId,
      elementType: element.elementType,
      metrics,
      worstStatus: worstStatus(metrics),
    });
  });
  const aspectValue = Math.max(...elementResults.map((row) => row.metrics[0].value));
  const jacobianValue = Math.min(...elementResults.map((row) => row.metrics[1].value));
  const gateResults = Object.freeze([
    aggregateMetric('ASPECT_RATIO', aspectValue,
      classifyHigher(aspectValue, thresholds.aspectRatioWarn, thresholds.aspectRatioBlock),
      thresholds.aspectRatioWarn, thresholds.aspectRatioBlock),
    aggregateMetric('SCALED_JACOBIAN', jacobianValue,
      jacobianValue <= 0 ? 'BLOCK' : classifyLower(
        jacobianValue, thresholds.scaledJacobianWarn, thresholds.scaledJacobianBlock,
      ), thresholds.scaledJacobianWarn, thresholds.scaledJacobianBlock),
  ]);
  return deepFreeze({
    schema: qualitySchema,
    meshProfileIdentity: meshProfile.profileIdentity,
    meshProfileHash: meshProfile.semanticHash,
    elementResults,
    gateResults,
    worstStatus: worstStatus(gateResults),
    blockingElementIds: elementResults
      .filter((row) => row.worstStatus === 'BLOCK').map((row) => row.elementId),
    warningElementIds: elementResults
      .filter((row) => row.worstStatus === 'WARNING').map((row) => row.elementId),
    elementCount: elementResults.length,
  });
}

function aspectRatioMetric(cornerNodes, thresholds) {
  const lengths = cornerNodes.map((node, index) => distance3d(
    node, cornerNodes[(index + 1) % cornerNodes.length],
  ));
  const shortest = Math.min(...lengths);
  if (!(shortest > 0)) {
    throw meshQualityError('LAFEA_ANALYSIS_MESH_DEGENERATE_EDGE');
  }
  const value = Math.max(...lengths) / shortest;
  return Object.freeze({
    metric: 'ASPECT_RATIO',
    value,
    status: classifyHigher(value, thresholds.aspectRatioWarn,
      thresholds.aspectRatioBlock),
  });
}

function scaledJacobianMetric(stageId, elementType, physicalNodes, thresholds) {
  if (elementType === 'T6' || elementType === 'Q8') {
    return qualifyScaledJacobian(elementType, physicalNodes, {
      warn: thresholds.scaledJacobianWarn,
      block: thresholds.scaledJacobianBlock,
    });
  }
  const value = triangleScaledJacobian(stageId, physicalNodes.slice(0, 3));
  return Object.freeze({
    metric: 'SCALED_JACOBIAN',
    value,
    status: value <= 0 ? 'BLOCK' : classifyLower(
      value, thresholds.scaledJacobianWarn, thresholds.scaledJacobianBlock,
    ),
  });
}

function triangleScaledJacobian(stageId, nodes) {
  return Math.min(...nodes.map((origin, index) => {
    const first = subtract3d(nodes[(index + 1) % 3], origin);
    const second = subtract3d(nodes[(index + 2) % 3], origin);
    const denominator = norm3d(first) * norm3d(second);
    if (!(denominator > 0)) return 0;
    if (stageId === 'LAFEA.3') {
      return ((first.x * second.y) - (first.y * second.x)) / denominator;
    }
    return norm3d(cross3d(first, second)) / denominator;
  }));
}

function aggregateMetric(metric, value, status, warningThreshold, blockingThreshold) {
  return Object.freeze({ metric, value, status, warningThreshold, blockingThreshold });
}

function classifyHigher(value, warning, blocking) {
  if (value >= blocking) return 'BLOCK';
  if (value >= warning) return 'WARNING';
  return 'OK';
}

function classifyLower(value, warning, blocking) {
  if (value <= blocking) return 'BLOCK';
  if (value <= warning) return 'WARNING';
  return 'OK';
}

function distance3d(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function subtract3d(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function cross3d(left, right) {
  return {
    x: (left.y * right.z) - (left.z * right.y),
    y: (left.z * right.x) - (left.x * right.z),
    z: (left.x * right.y) - (left.y * right.x),
  };
}

function norm3d(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function meshQualityError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
