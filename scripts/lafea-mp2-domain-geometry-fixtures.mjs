import { PROFILE_KINDS, canonicalProfile } from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
  LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
} from '../src/workspace/lafea-analysis-geometry-contract.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

export function mp2SquareWithCircularHole() {
  return {
    schema: LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
    stageId: 'LAFEA.3',
    geometryId: 'PLATE-WITH-HOLE',
    coordinateSystemId: 'GLOBAL_XY',
    lengthUnit: 'mm',
    orientationPolicy: LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
    vertices: [
      { vertexId: 'A', x: 0, y: 0 }, { vertexId: 'B', x: 10, y: 0 },
      { vertexId: 'C', x: 10, y: 10 }, { vertexId: 'D', x: 0, y: 10 },
      { vertexId: 'H1', x: 4, y: 5 }, { vertexId: 'H2', x: 5, y: 6 },
      { vertexId: 'H3', x: 6, y: 5 }, { vertexId: 'H4', x: 5, y: 4 },
    ],
    segments: [
      line('S1', 'A', 'B'), line('S2', 'B', 'C'),
      line('S3', 'C', 'D'), line('S4', 'D', 'A'),
      arc('H1', 'H1', 'H2'), arc('H2', 'H2', 'H3'),
      arc('H3', 'H3', 'H4'), arc('H4', 'H4', 'H1'),
    ],
    loops: [
      { loopId: 'OUTER', role: 'OUTER', segmentIds: ['S1', 'S2', 'S3', 'S4'] },
      { loopId: 'HOLE', role: 'HOLE', segmentIds: ['H1', 'H2', 'H3', 'H4'] },
    ],
  };
}

export function mp2Attachment(attachmentId, kind, targetType, targetId, physicalCaseIds, payload) {
  return { attachmentId, kind, targetType, targetId, physicalCaseIds, payload };
}
export function mp2MeshProfile(continuumElement) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `MP2-${continuumElement}`,
    sourceRevision: 'TEST-1',
    fields: {
      continuumElement,
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 5,
      adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 3,
      aspectRatioBlock: 6,
      scaledJacobianWarn: 0.3,
      scaledJacobianBlock: 0.1,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}
export function mp2T6Mesh() {
  return {
    schema: 'lafea-analysis-mesh/v1',
    meshIdentity: 'MP2-T6',
    nodes: [
      node('N1', 0, 0), node('N2', 10, 0), node('N3', 0, 10),
      node('N4', 5, 0), node('N5', 5, 5), node('N6', 0, 5),
    ],
    elements: [{
      elementId: 'E1', elementType: 'T6',
      nodeIds: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'],
    }],
  };
}
export function mp2Hash(value) {
  return canonicalLafeaSha256({ schema: 'mp2-test-hash/v1', value });
}
function line(segmentId, startVertexId, endVertexId) {
  return { segmentId, type: 'LINE', startVertexId, endVertexId };
}
function arc(segmentId, startVertexId, endVertexId) {
  return {
    segmentId, type: 'CIRCULAR_ARC', startVertexId, endVertexId,
    centerX: 5, centerY: 5, radius: 1, sweep: 'CW',
  };
}
function node(nodeId, x, y) { return { nodeId, x, y, z: 0 }; }
