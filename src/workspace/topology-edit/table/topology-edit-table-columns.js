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
    column('slopePercent', 'Slope %', 'number', { editor: 'PIPE_SLOPE' }),
  ],
  ELBOW: [
    column('angleDeg', 'Angle', 'angle', { editor: 'BEND_ANGLE' }),
    column('radiusMm', 'Radius', 'length', { editor: 'BEND_RADIUS' }),
    column('turnIntent', 'Turn Intent', 'enum', { editor: 'BEND_TURN' }),
  ],
  FLANGE: [
    column('flangeType', 'Flange Type', 'enum', { editor: 'FLANGE_REPLACE' }),
    column('flangeFacing', 'Facing', 'enum', { editor: 'FLANGE_REPLACE' }),
    column('rating', 'Rating', 'text', { editor: 'FLANGE_REPLACE' }),
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
    column('reducerType', 'Reducer Type', 'enum', { editor: 'REDUCER_REPLACE' }),
    column('reducerOrientation', 'Orientation', 'enum', { editor: 'REDUCER_REPLACE' }),
  ],
  SUPPORT: [
    column('hostEntityId', 'Host', 'identity', { readOnly: true }),
    column('stationMm', 'Station', 'length'),
    column('supportType', 'Support Type', 'enum'),
    column('direction', 'Direction', 'vector'),
    column('gapMm', 'Gap', 'length'),
    column('travelMm', 'Travel', 'length'),
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
