import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  finiteTopologyEditNumber,
  finiteTopologyEditPoint,
  positiveTopologyEditNumber,
  requiredCanonicalNodeId,
  requiredTopologyEditText,
} from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_GIZMO_MODEL_SCHEMA =
  'TopologyEditGizmoDisplayModel.v1';

const HANDLE_DEFINITIONS = Object.freeze([
  { handleId: 'gizmo:axis:x', mode: 'AXIS_X', kind: 'AXIS', axes: ['X'] },
  { handleId: 'gizmo:axis:y', mode: 'AXIS_Y', kind: 'AXIS', axes: ['Y'] },
  { handleId: 'gizmo:axis:z', mode: 'AXIS_Z', kind: 'AXIS', axes: ['Z'] },
  { handleId: 'gizmo:plane:xy', mode: 'PLANE_XY', kind: 'PLANE', axes: ['X', 'Y'] },
  { handleId: 'gizmo:plane:yz', mode: 'PLANE_YZ', kind: 'PLANE', axes: ['Y', 'Z'] },
  { handleId: 'gizmo:plane:xz', mode: 'PLANE_XZ', kind: 'PLANE', axes: ['X', 'Z'] },
]);

export function computeTopologyEditGizmoScaleMm(input = {}) {
  const cameraDistanceMm = positiveTopologyEditNumber(
    input.cameraDistanceMm,
    'cameraDistanceMm',
  );
  const viewportHeightPx = positiveTopologyEditNumber(
    input.viewportHeightPx,
    'viewportHeightPx',
  );
  const perspectiveFovDeg = positiveTopologyEditNumber(
    input.perspectiveFovDeg,
    'perspectiveFovDeg',
  );
  if (perspectiveFovDeg >= 179) {
    throw new RangeError('perspectiveFovDeg must be less than 179.');
  }
  const desiredPixelSize = positiveTopologyEditNumber(
    input.desiredPixelSize ?? 96,
    'desiredPixelSize',
  );
  const radians = perspectiveFovDeg * Math.PI / 180;
  const worldHeightMm = 2 * cameraDistanceMm * Math.tan(radians / 2);
  return finiteTopologyEditNumber(
    worldHeightMm * desiredPixelSize / viewportHeightPx,
    'gizmoScaleMm',
  );
}

export function createTopologyEditGizmoModel(input = {}) {
  const material = {
    schema: TOPOLOGY_EDIT_GIZMO_MODEL_SCHEMA,
    nodeId: requiredCanonicalNodeId(input.nodeId),
    basisHash: requiredTopologyEditText(input.basisHash, 'basisHash'),
    anchorPosition: finiteTopologyEditPoint(
      input.anchorPosition,
      'anchorPosition',
    ),
    scaleMm: computeTopologyEditGizmoScaleMm(input),
    units: 'MM',
    handles: HANDLE_DEFINITIONS.map((definition) => deepFreeze({
      ...definition,
      axes: [...definition.axes],
      pickable: true,
      authority: 'DISPLAY_HANDLE_ONLY',
    })),
    anchorMarker: deepFreeze({
      role: 'ANCHOR',
      pickable: false,
    }),
    movingMarker: deepFreeze({
      role: 'MOVING_TARGET',
      pickable: false,
    }),
    displayOnly: true,
  };
  return deepFreeze({
    ...material,
    gizmoHash: semanticHash(material),
  });
}
