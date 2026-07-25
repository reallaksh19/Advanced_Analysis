import { freezeDeep, isRecord, stringValue } from './dataset-utils.js';

const FIELD_ALIASES = Object.freeze({
  outerDiameterMm: [
    'outerDiameterMm', 'outsideDiameter', 'outsideDiameterMm', 'OUTSIDE_DIAMETER', 'OUTSIDE-DIAMETER',
    'PIPE_OD', 'PIPE_OD_MM', 'OD', 'DIAMETER',
  ],
  nominalBoreMm: ['nominalBoreMm', 'nominalBore', 'NOMINAL_BORE', 'NOMINAL_BORE_MM', 'BORE'],
  wallThicknessMm: ['wallThicknessMm', 'wallThickness', 'WALL_THICKNESS_MM', 'WALL_THICKNESS', 'THICKNESS'],
  bendRadiusMm: ['bendRadiusMm', 'bendRadius', 'BEND_RADIUS_MM', 'BEND_RADIUS', 'RADIUS'],
  angleDeg: ['angleDeg', 'angle', 'ANGLE_DEG', 'ANGLE', 'BEND_ANGLE'],
  inletDiameterMm: [
    'inletDiameterMm', 'inletDiameter', 'largeEndDiameter', 'LARGE_END_DIAMETER', 'OD1', 'DIAMETER1', 'END1_DIAMETER',
  ],
  outletDiameterMm: [
    'outletDiameterMm', 'outletDiameter', 'smallEndDiameter', 'SMALL_END_DIAMETER', 'OD2', 'DIAMETER2', 'END2_DIAMETER',
  ],
  branchDiameterMm: ['branchDiameterMm', 'branchDiameter', 'BRANCH_DIAMETER', 'BRANCH_OD'],
  flangeOutsideDiameterMm: [
    'flangeOutsideDiameterMm', 'flangeOutsideDiameter', 'FLANGE_OUTSIDE_DIAMETER', 'FLANGE_OD', 'OD_FLANGE',
  ],
  flangeThicknessMm: ['flangeThicknessMm', 'flangeThickness', 'FLANGE_THICKNESS', 'FLANGE_WIDTH'],
  valveBodyDiameterMm: ['valveBodyDiameterMm', 'valveBodyDiameter', 'VALVE_BODY_DIAMETER', 'BODY_DIAMETER'],
  valveLengthMm: ['valveLengthMm', 'valveLength', 'VALVE_LENGTH', 'FACE_TO_FACE', 'FACE_TO_FACE_MM'],
  supportSizeMm: ['supportSizeMm', 'supportSize', 'SUPPORT_SIZE', 'SHOE_HEIGHT', 'GUIDE_HEIGHT'],
});

const SCOPE_ORDER = Object.freeze([
  ['nativeParams', 'properties.nativeParams'],
  ['enrichedAttributes', 'properties.enrichedAttributes'],
  ['sourceAttributes', 'properties.sourceAttributes'],
  ['attributes', 'properties.attributes'],
]);

export function resolveEngineeringDimensions(entity) {
  const scopes = buildScopes(entity);
  const values = {};
  const evidence = {};

  Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
    const resolved = findDimension(scopes, aliases, field === 'angleDeg');
    values[field] = resolved?.value ?? null;
    evidence[field] = resolved || null;
  });

  const geometryBore = positiveNumber(entity?.properties?.geometry?.boreMm);
  if (values.nominalBoreMm === null && geometryBore !== null) {
    values.nominalBoreMm = geometryBore;
    evidence.nominalBoreMm = freezeDeep({
      value: geometryBore,
      sourcePath: 'properties.geometry.boreMm',
      sourceKey: 'boreMm',
    });
  }

  return freezeDeep({ values, evidence });
}

function buildScopes(entity) {
  return SCOPE_ORDER.map(([key, sourcePath]) => {
    const value = entity?.properties?.[key];
    return {
      sourcePath,
      values: flattenRecord(isRecord(value) ? value : {}),
    };
  });
}

function flattenRecord(record, prefix = '', output = new Map()) {
  Object.entries(record).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      flattenRecord(value, path, output);
      return;
    }
    output.set(normalizeKey(key), { key: path, value });
  });
  return output;
}

function findDimension(scopes, aliases, isAngle) {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const scope of scopes) {
    for (const alias of normalizedAliases) {
      const candidate = scope.values.get(alias);
      if (!candidate) continue;
      const value = parseDimension(candidate.value, isAngle);
      if (value === null) continue;
      return freezeDeep({
        value,
        sourcePath: `${scope.sourcePath}.${candidate.key}`,
        sourceKey: candidate.key,
      });
    }
  }
  return null;
}

function parseDimension(value, isAngle) {
  const parsed = numberMaybe(value);
  if (parsed === null) return null;
  if (isAngle) return parsed > 0 && parsed <= 360 ? parsed : null;
  return parsed > 0 ? parsed : null;
}

function numberMaybe(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const match = stringValue(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value) {
  const parsed = numberMaybe(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizeKey(value) {
  return stringValue(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}
