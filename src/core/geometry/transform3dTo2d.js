import { detectDominantPlaneFromSegments, getSegmentEndpoints, projectPointToPlane } from './planeDetection.js';

const length3 = (start, end) => Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
const length2 = (start2D, end2D) => Math.hypot(end2D[0] - start2D[0], end2D[1] - start2D[1]);

export const transform3dSegmentsTo2d = (segments3D = [], options = {}) => {
  const requestedPlane = options.plane || 'AUTO';
  const nodesById = new Map((options.nodes || []).map((node) => [node.id, node]));
  const diagnostics = [];
  const planeTrace = requestedPlane === 'AUTO' || requestedPlane === 'Auto'
    ? detectDominantPlaneFromSegments(segments3D, { nodes: options.nodes || [] })
    : { plane: requestedPlane, axisMovement: {}, confidence: 1, reason: `Caller selected ${requestedPlane}.` };
  const plane = planeTrace.plane;

  diagnostics.push({ severity: 'info', code: 'TRANSFORM_PLANE_SELECTED', message: planeTrace.reason, data: planeTrace });

  let current2DPos = null;
  const segments2D = [];
  let trueLengthTotal = 0;
  let projectedLengthTotal = 0;

  segments3D.forEach((segment, index) => {
    const { start, end } = getSegmentEndpoints(segment, nodesById);
    const trueLength = length3(start, end);
    if (!Number.isFinite(trueLength) || trueLength <= 1e-9) {
      diagnostics.push({ severity: 'warn', code: 'TRANSFORM_ZERO_LENGTH_SEGMENT', message: `Skipped zero-length segment at index ${index}.`, data: { segmentId: segment?.id } });
      return;
    }

    const rawStart2D = projectPointToPlane(start, plane);
    const rawEnd2D = projectPointToPlane(end, plane);
    const rawProjectedLength = length2(rawStart2D, rawEnd2D);
    const start2D = current2DPos ? [...current2DPos] : rawStart2D;
    let end2D;

    if (rawProjectedLength <= 1e-9) {
      end2D = [start2D[0] + trueLength, start2D[1], 0];
      diagnostics.push({ severity: 'warn', code: 'TRANSFORM_PERPENDICULAR_SEGMENT_UNFOLDED', message: `Segment ${segment?.id || index} is perpendicular to ${plane}; unfolded along local X.`, data: { segmentId: segment?.id, trueLength } });
    } else {
      const scale = trueLength / rawProjectedLength;
      end2D = [start2D[0] + (rawEnd2D[0] - rawStart2D[0]) * scale, start2D[1] + (rawEnd2D[1] - rawStart2D[1]) * scale, 0];
    }

    trueLengthTotal += trueLength;
    projectedLengthTotal += rawProjectedLength;
    segments2D.push({
      ...segment,
      id: segment?.id || `T2D-${index + 1}`,
      sourceSegmentId: segment?.sourceSegmentId || segment?.id,
      sourceComponentUid: segment?.sourceComponentUid || segment?.rawComp?.id,
      start3D: [start.x, start.y, start.z],
      end3D: [end.x, end.y, end.z],
      start2D,
      end2D,
      trueLength,
      projectedLength: rawProjectedLength,
      lengthLossRatio: trueLength > 0 ? 1 - rawProjectedLength / trueLength : 0,
    });
    current2DPos = end2D;
  });

  return { schemaVersion: 'transform-2d-v1', source: options.source || 'transform', plane, requestedPlane, mode: options.mode || 'smart', planeTrace, segments2D, diagnostics, summary: { segmentCount: segments2D.length, trueLengthTotal, projectedLengthTotal, lengthLossTotal: trueLengthTotal - projectedLengthTotal } };
};

export const transformCanonical3dTo2d = (geometry, options = {}) => transform3dSegmentsTo2d(geometry?.segments || [], { ...options, nodes: geometry?.nodes || [], source: options.source || geometry?.source || 'canonical' });
