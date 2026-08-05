import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const EMPIRICAL_RESTRAINT_NETWORK_PROFILE_SCHEMA =
  'empirical-restraint-network-profile/v1';
export const EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS = Object.freeze({
  straightDirectionalCompliance: 'EMP-LSN-001',
  projectedThermalMovement: 'EMP-LSN-002',
  scalarNetworkAssembly: 'EMP-LSN-003',
  bilateralGapActiveSet: 'EMP-LSN-004',
  restraintReactionRecovery: 'EMP-LSN-005',
  forceClosure: 'EMP-EQ-001',
});

const QUALIFICATIONS = Object.freeze(['QUALIFIED', 'UNQUALIFIED', 'EXPERIMENTAL']);
const PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'profileVersion',
  'qualification',
  'locked',
  'lineProperties',
  'compliance',
  'domain',
  'tolerances',
  'numericalOptions',
  'semanticHash',
]);

export function createEmpiricalRestraintNetworkProfile(input) {
  requireRecord(input, 'empirical restraint-network profile input');
  const lineProperties = Object.fromEntries(Object.entries(input.lineProperties || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lineId, value]) => [requiredString(lineId, 'lineId'), requireLine(value, lineId)]));
  if (Object.keys(lineProperties).length === 0) {
    throw new TypeError('At least one restraint-network line-property record is required.');
  }
  const base = {
    schema: EMPIRICAL_RESTRAINT_NETWORK_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    qualification: oneOf(input.qualification, QUALIFICATIONS, 'qualification'),
    locked: booleanValue(input.locked, 'locked'),
    lineProperties,
    compliance: requireCompliance(input.compliance),
    domain: requireDomain(input.domain),
    tolerances: requireTolerances(input.tolerances),
    numericalOptions: requireNumericalOptions(input.numericalOptions),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalRestraintNetworkProfile(value) {
  exactKeys(value, PROFILE_KEYS, 'empirical restraint-network profile');
  if (value.schema !== EMPIRICAL_RESTRAINT_NETWORK_PROFILE_SCHEMA) {
    throw new TypeError('Unsupported empirical restraint-network profile schema.');
  }
  const normalized = createEmpiricalRestraintNetworkProfile(value);
  if (normalized.semanticHash !== value.semanticHash) {
    throw new TypeError('Empirical restraint-network profile semantic hash mismatch.');
  }
  return normalized;
}

export function cloneEmpiricalRestraintNetworkProfile(profile, value = {}) {
  const source = requireEmpiricalRestraintNetworkProfile(profile);
  return createEmpiricalRestraintNetworkProfile({
    profileId: requiredString(
      value.profileId || `${source.profileId}-CLONE`,
      'profileId',
    ),
    profileVersion: Number.isInteger(value.profileVersion)
      ? value.profileVersion
      : source.profileVersion + 1,
    qualification: 'UNQUALIFIED',
    locked: false,
    lineProperties: structuredClone(source.lineProperties),
    compliance: structuredClone(source.compliance),
    domain: structuredClone(source.domain),
    tolerances: structuredClone(source.tolerances),
    numericalOptions: structuredClone(source.numericalOptions),
  });
}

function requireLine(value, lineId) {
  exactKeys(value, [
    'outsideDiameterM',
    'wallThicknessM',
    'elasticModulusPa',
    'thermalExpansionPerK',
    'authority',
  ], `lineProperties.${lineId}`);
  const outsideDiameterM = positive(value.outsideDiameterM, `${lineId}.outsideDiameterM`);
  const wallThicknessM = positive(value.wallThicknessM, `${lineId}.wallThicknessM`);
  if (2 * wallThicknessM >= outsideDiameterM) {
    throw new TypeError(`Line ${lineId} wall thickness leaves no inside diameter.`);
  }
  return deepFreeze({
    outsideDiameterM,
    wallThicknessM,
    elasticModulusPa: positive(value.elasticModulusPa, `${lineId}.elasticModulusPa`),
    thermalExpansionPerK: nonnegative(
      value.thermalExpansionPerK,
      `${lineId}.thermalExpansionPerK`,
    ),
    authority: requireAuthority(value.authority, lineId),
  });
}

function requireAuthority(value, lineId) {
  exactKeys(value, ['section', 'elasticModulus', 'thermalExpansion'], `${lineId}.authority`);
  return deepFreeze({
    section: requiredString(value.section, `${lineId}.authority.section`),
    elasticModulus: requiredString(
      value.elasticModulus,
      `${lineId}.authority.elasticModulus`,
    ),
    thermalExpansion: requiredString(
      value.thermalExpansion,
      `${lineId}.authority.thermalExpansion`,
    ),
  });
}

function requireCompliance(value) {
  exactKeys(value, [
    'axialComplianceMultiplier',
    'bendingComplianceMultiplier',
    'topologyInteractionMultiplier',
  ], 'compliance');
  return deepFreeze({
    axialComplianceMultiplier: positive(
      value.axialComplianceMultiplier,
      'compliance.axialComplianceMultiplier',
    ),
    bendingComplianceMultiplier: positive(
      value.bendingComplianceMultiplier,
      'compliance.bendingComplianceMultiplier',
    ),
    topologyInteractionMultiplier: positive(
      value.topologyInteractionMultiplier,
      'compliance.topologyInteractionMultiplier',
    ),
  });
}

function requireDomain(value) {
  exactKeys(value, [
    'allowedComponentTypes',
    'requireTerminalAnchors',
    'maximumFiniteGapCount',
    'maximumFiniteStiffnessCount',
    'allowFriction',
    'allowBranches',
    'allowClosedLoops',
  ], 'domain');
  const allowedComponentTypes = [...new Set((value.allowedComponentTypes || [])
    .map((item) => requiredString(item, 'domain.allowedComponentTypes').toUpperCase()))].sort();
  if (allowedComponentTypes.length === 0) {
    throw new TypeError('At least one allowed restraint-network component type is required.');
  }
  if (value.requireTerminalAnchors !== true
    || value.maximumFiniteGapCount !== 1
    || value.maximumFiniteStiffnessCount !== 1
    || value.allowFriction !== false
    || value.allowBranches !== false
    || value.allowClosedLoops !== false) {
    throw new TypeError(
      'The WP5 qualified domain requires terminal anchors, at most one finite gap, at most one finite stiffness, no friction, no branches and no loops.',
    );
  }
  return deepFreeze({
    allowedComponentTypes,
    requireTerminalAnchors: true,
    maximumFiniteGapCount: 1,
    maximumFiniteStiffnessCount: 1,
    allowFriction: false,
    allowBranches: false,
    allowClosedLoops: false,
  });
}

function requireTolerances(value) {
  exactKeys(value, [
    'pointProjectionM',
    'directionParallelCosine',
    'directionOrthogonalCosine',
    'gapM',
    'reactionN',
    'equilibriumN',
    'maximumScaledResidual',
  ], 'tolerances');
  const directionParallelCosine = bounded(
    value.directionParallelCosine,
    0,
    1,
    'tolerances.directionParallelCosine',
  );
  const directionOrthogonalCosine = bounded(
    value.directionOrthogonalCosine,
    0,
    1,
    'tolerances.directionOrthogonalCosine',
  );
  if (directionOrthogonalCosine >= directionParallelCosine) {
    throw new TypeError('Orthogonal cosine tolerance must be below parallel cosine tolerance.');
  }
  return deepFreeze({
    pointProjectionM: positive(value.pointProjectionM, 'tolerances.pointProjectionM'),
    directionParallelCosine,
    directionOrthogonalCosine,
    gapM: nonnegative(value.gapM, 'tolerances.gapM'),
    reactionN: nonnegative(value.reactionN, 'tolerances.reactionN'),
    equilibriumN: nonnegative(value.equilibriumN, 'tolerances.equilibriumN'),
    maximumScaledResidual: positive(
      value.maximumScaledResidual,
      'tolerances.maximumScaledResidual',
    ),
  });
}

function requireNumericalOptions(value) {
  exactKeys(value, ['pivotMultiplier', 'minimumReciprocalCondition'], 'numericalOptions');
  return deepFreeze({
    pivotMultiplier: positive(value.pivotMultiplier, 'numericalOptions.pivotMultiplier'),
    minimumReciprocalCondition: positive(
      value.minimumReciprocalCondition,
      'numericalOptions.minimumReciprocalCondition',
    ),
  });
}

function exactKeys(value, keys, label) {
  requireRecord(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requireRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer.`);
  return value;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${field} must be positive.`);
  return value;
}

function nonnegative(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be non-negative.`);
  return value;
}

function bounded(value, minimum, maximum, field) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be from ${minimum} to ${maximum}.`);
  }
  return value;
}
