import { deepFreeze } from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_TABLE_COLUMN_SCHEMA = 'TopologyEditTableColumn.v1';

const COMMON = [
  column('tag', 'Tag', 'text', { frozen: true }),
  column('elementType', 'Type', 'text', { frozen: true }),
  column('line', 'Line', 'text'),
  column('connectFrom', 'Connect From', 'identity', { frozen: true }),
  column('connectTo', 'Connect To', 'identity', { frozen: true }),
  column('dnInMm', 'DN In', 'length'),
  column('dnOutMm', 'DN Out', 'length'),
  column('schedule', 'Schedule', 'text'),
  column('material', 'Material', 'text'),
  column('pipingClass', 'Piping Class', 'text'),
  column('pressureClass', 'Pressure Class', 'text'),
  column('catalogueAuthority', 'Catalogue', 'status', { readOnly: true }),
  column('sourceStatus', 'Source', 'status', { readOnly: true }),
];

const BY_TYPE = Object.freeze({
  PIPE: [
    column('lengthMm', 'Length', 'length', { editor: 'PIPE_LENGTH' }),
    column('slopePercent', 'Slope %', 'number', { readOnly: true }),
  ],
  ELBOW: [
    column('angleDeg', 'Angle', 'angle', { readOnly: true }),
    column('radiusMm', 'Radius', 'length', { readOnly: true }),
    column('turnIntent', 'Turn Intent', 'enum', { readOnly: true }),
  ],
  FLANGE: [
    column('flangeType', 'Flange Type', 'enum', { readOnly: true }),
    column('flangeFacing', 'Facing', 'enum', { readOnly: true }),
    column('rating', 'Rating', 'text', { readOnly: true }),
  ],
  VALVE: [
    column('valveType', 'Valve Type', 'enum', { editor: 'VALVE_REPLACE' }),
    column('endConnectionFrom', 'From End', 'enum'),
    column('endConnectionTo', 'To End', 'enum'),
    column('operator', 'Operator', 'text'),
    column('flowDirection', 'Flow Direction', 'enum'),
    column('componentLengthMm', 'Face-to-Face', 'length', { readOnly: true }),
  ],
  TEE: [
    column('runDnMm', 'Run DN', 'length'),
    column('branchDnMm', 'Branch DN', 'length', { editor: 'BRANCH_RECONFIGURE' }),
    column('branchAngleDeg', 'Branch Angle', 'angle', { editor: 'BRANCH_RECONFIGURE' }),
  ],
  REDUCER: [
    column('reducerType', 'Reducer Type', 'enum', { readOnly: true }),
    column('reducerOrientation', 'Orientation', 'enum', { readOnly: true }),
  ],
  SUPPORT: [
    column('hostEntityId', 'Host', 'identity', { readOnly: true }),
    column('stationMm', 'Station', 'length', { readOnly: true }),
    column('supportType', 'Support Type', 'enum', { readOnly: true }),
    column('direction', 'Direction', 'vector', { readOnly: true }),
    column('gapMm', 'Gap', 'length', { readOnly: true }),
    column('travelMm', 'Travel', 'length', { readOnly: true }),
  ],
  COMPONENT: [],
  JUNCTION: [],
});

export function topologyEditTableColumnsFor(elementType) {
  const type = String(elementType ?? 'COMPONENT').trim().toUpperCase();
  const specific = BY_TYPE[type] ?? BY_TYPE.COMPONENT;
  return deepFreeze([...COMMON, ...specific]);
}

export function topologyEditTableColumnKeysFor(elementType) {
  return topologyEditTableColumnsFor(elementType).map((descriptor) => descriptor.key);
}

function column(key, label, valueType, options = {}) {
  return deepFreeze({
    schema: TOPOLOGY_EDIT_TABLE_COLUMN_SCHEMA,
    key,
    label,
    valueType,
    frozen: options.frozen === true,
    readOnly: options.readOnly === true,
    editor: options.editor ?? null,
  });
}
