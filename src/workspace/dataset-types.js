import { stringValue } from './dataset-utils.js';

const PIPE_TYPES = new Set([
  'PIPE', 'BEND', 'ELBOW', 'ELBO', 'TEE', 'FLAN', 'FLANGE', 'VALV',
  'VALVE', 'REDU', 'REDUCER', 'GASK', 'GASKET', 'INST', 'INSTRUMENT', 'OLET',
]);

const SUPPORT_TYPES = new Set([
  'ATTA', 'SUPPORT', 'REST', 'GUIDE', 'LINESTOP', 'LINE_STOP', 'LIMIT',
  'LIM', 'ANCHOR', 'SPRING', 'SHOE',
]);

const NATIVE_ROLE_TYPES = Object.freeze({
  segment: 'PIPE',
  supportshoe: 'SUPPORT',
  valvebody: 'VALVE',
  leftseat: 'VALVE',
  rightseat: 'VALVE',
  leftendflange: 'FLANGE',
  rightendflange: 'FLANGE',
  actuator: 'VALVE',
  weldneckhub: 'FLANGE',
  raisedfacedisk: 'FLANGE',
  blindflangedisk: 'FLANGE',
  reducercone: 'REDUCER',
  gasketdisk: 'GASKET',
});

export function resolveEntityType(item) {
  const direct = stringValue(
    item?.type
    || item?.kind
    || item?.attributes?.TYPE
    || item?.sourceAttributes?.TYPE,
  );
  if (direct) return direct.toUpperCase();

  const nativeRole = stringValue(
    item?.nativeParams?.role
    || stringValue(item?.native?.kind).replace(/^att-derived-/, ''),
  ).toLowerCase();
  return NATIVE_ROLE_TYPES[nativeRole] || 'OBJECT';
}

export function selectionTypeFor(entityType) {
  return isSupportType(entityType) ? 'support' : 'pipe';
}

export function isSupportType(type) {
  const normalized = normalizeType(type);
  return SUPPORT_TYPES.has(normalized)
    || normalized.includes('SUPPORT')
    || normalized.includes('ATTA')
    || normalized.includes('GUIDE');
}

export function isPipeType(type) {
  const normalized = normalizeType(type);
  return PIPE_TYPES.has(normalized)
    || normalized.includes('PIPE')
    || normalized.includes('BEND')
    || normalized.includes('VALV');
}

function normalizeType(value) {
  return stringValue(value).toUpperCase().replace(/[^A-Z0-9_]+/g, '');
}
