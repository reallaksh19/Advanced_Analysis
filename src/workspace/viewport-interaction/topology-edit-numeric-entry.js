import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  addTopologyEditPoints,
  finiteTopologyEditNumber,
  finiteTopologyEditPoint,
  normalizeTopologyEditDirection,
  normalizeTopologyEditUnits,
  scaleTopologyEditPoint,
  subtractTopologyEditPoints,
} from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_NUMERIC_ENTRY_SCHEMA =
  'TopologyEditNumericEntry.v1';

export const TOPOLOGY_EDIT_NUMERIC_ENTRY_MODES = Object.freeze([
  'ABSOLUTE',
  'DELTA',
  'MAGNITUDE',
]);

const MODE_SET = new Set(TOPOLOGY_EDIT_NUMERIC_ENTRY_MODES);
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseTopologyEditDecimal(value, label = 'value') {
  if (typeof value === 'number') {
    return finiteTopologyEditNumber(value, label);
  }
  const text = String(value ?? '').trim();
  if (!text || !DECIMAL_PATTERN.test(text)) {
    throw new TypeError(
      `${label} must be a locale-independent decimal without units.`,
    );
  }
  return finiteTopologyEditNumber(Number(text), label);
}

export function formatTopologyEditMm(value, fractionDigits = 6) {
  const number = finiteTopologyEditNumber(value, 'value');
  const digits = Number(fractionDigits);
  if (!Number.isInteger(digits) || digits < 0 || digits > 12) {
    throw new RangeError('fractionDigits must be an integer from 0 to 12.');
  }
  const fixed = number.toFixed(digits);
  const compact = fixed
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');
  return compact === '-0' ? '0' : compact;
}

export function createTopologyEditNumericEntry(input = {}) {
  const entryMode = normalizeEntryMode(input.entryMode);
  const units = normalizeTopologyEditUnits(input.units);
  const anchorPosition = finiteTopologyEditPoint(
    input.anchorPosition,
    'anchorPosition',
  );
  const targetPosition = targetForMode(entryMode, anchorPosition, input);
  const material = {
    schema: TOPOLOGY_EDIT_NUMERIC_ENTRY_SCHEMA,
    entryMode,
    anchorPosition,
    targetPosition,
    delta: subtractTopologyEditPoints(targetPosition, anchorPosition),
    units,
  };
  return deepFreeze({
    ...material,
    numericEntryHash: semanticHash(material),
  });
}

function normalizeEntryMode(value) {
  const entryMode = String(value ?? '').trim().toUpperCase();
  if (!MODE_SET.has(entryMode)) {
    throw new RangeError(`Unsupported numeric entry mode ${entryMode}.`);
  }
  return entryMode;
}

function targetForMode(entryMode, anchor, input) {
  if (entryMode === 'ABSOLUTE') {
    return finiteTopologyEditPoint({
      x: parseTopologyEditDecimal(input.values?.x, 'values.x'),
      y: parseTopologyEditDecimal(input.values?.y, 'values.y'),
      z: parseTopologyEditDecimal(input.values?.z, 'values.z'),
    }, 'targetPosition');
  }
  if (entryMode === 'DELTA') {
    return addTopologyEditPoints(anchor, {
      x: parseTopologyEditDecimal(input.values?.x, 'values.x'),
      y: parseTopologyEditDecimal(input.values?.y, 'values.y'),
      z: parseTopologyEditDecimal(input.values?.z, 'values.z'),
    });
  }
  const magnitudeMm = parseTopologyEditDecimal(
    input.magnitudeMm,
    'magnitudeMm',
  );
  if (magnitudeMm < 0) {
    throw new RangeError('magnitudeMm must be non-negative.');
  }
  const direction = normalizeTopologyEditDirection(input.direction);
  return addTopologyEditPoints(
    anchor,
    scaleTopologyEditPoint(direction, magnitudeMm),
  );
}
