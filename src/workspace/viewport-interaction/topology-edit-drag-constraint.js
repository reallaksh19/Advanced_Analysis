import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  finiteTopologyEditPoint,
  normalizeTopologyEditUnits,
  requiredTopologyEditText,
  subtractTopologyEditPoints,
} from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_DRAG_CONSTRAINT_SCHEMA =
  'TopologyEditDragConstraint.v1';

export const TOPOLOGY_EDIT_TRANSFORM_MODES = Object.freeze([
  'FREE',
  'AXIS_X',
  'AXIS_Y',
  'AXIS_Z',
  'PLANE_XY',
  'PLANE_YZ',
  'PLANE_XZ',
]);

const MODE_SET = new Set(TOPOLOGY_EDIT_TRANSFORM_MODES);

export function normalizeTopologyEditTransformMode(value) {
  const mode = requiredTopologyEditText(value ?? 'FREE', 'mode').toUpperCase();
  if (!MODE_SET.has(mode)) {
    throw new RangeError(`Unsupported topology-edit transform mode ${mode}.`);
  }
  return mode;
}

export function constrainTopologyEditTarget(input = {}) {
  const mode = normalizeTopologyEditTransformMode(input.mode);
  const units = normalizeTopologyEditUnits(input.units);
  const anchorPosition = finiteTopologyEditPoint(
    input.anchorPosition,
    'anchorPosition',
  );
  const pointerTarget = finiteTopologyEditPoint(
    input.pointerTarget,
    'pointerTarget',
  );
  const targetPosition = constrainedPoint(mode, anchorPosition, pointerTarget);
  const material = {
    schema: TOPOLOGY_EDIT_DRAG_CONSTRAINT_SCHEMA,
    mode,
    anchorPosition,
    pointerTarget,
    targetPosition,
    delta: subtractTopologyEditPoints(targetPosition, anchorPosition),
    units,
  };
  return deepFreeze({
    ...material,
    constraintHash: semanticHash(material),
  });
}

function constrainedPoint(mode, anchor, target) {
  const values = { x: target.x, y: target.y, z: target.z };
  if (mode === 'AXIS_X') {
    values.y = anchor.y;
    values.z = anchor.z;
  } else if (mode === 'AXIS_Y') {
    values.x = anchor.x;
    values.z = anchor.z;
  } else if (mode === 'AXIS_Z') {
    values.x = anchor.x;
    values.y = anchor.y;
  } else if (mode === 'PLANE_XY') {
    values.z = anchor.z;
  } else if (mode === 'PLANE_YZ') {
    values.x = anchor.x;
  } else if (mode === 'PLANE_XZ') {
    values.y = anchor.y;
  }
  return finiteTopologyEditPoint(values, 'targetPosition');
}
