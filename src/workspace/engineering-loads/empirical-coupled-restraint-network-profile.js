import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const EMPIRICAL_COUPLED_RESTRAINT_NETWORK_PROFILE_SCHEMA =
  'empirical-coupled-restraint-network-profile/v1';

export const EMPIRICAL_COUPLED_RESTRAINT_NETWORK_FORMULA_IDS = Object.freeze({
  directionalCompliance: 'EMP-LSN2-001',
  projectedThermalMovement: 'EMP-LSN2-002',
  coupledGraphAssembly: 'EMP-LSN2-003',
  branchCompatibility: 'EMP-LSN2-004',
  cycleClosure: 'EMP-LSN2-005',
  rigidRestraintEnforcement: 'EMP-LSN2-006',
  reactionRecovery: 'EMP-LSN2-007',
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
  'componentComplianceMultipliers',
  'compliance',
  'domain',
  'tolerances',
  'numericalOptions',
  'semanticHash',
]);

export function createEmpiricalCoupledRestraintNetworkProfile(input) {
  requireRecord(input, 'empirical coupled restraint-network profile input');
  const lineProperties = Object.fromEntries(Object.entries(input.lineProperties || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lineId, value]) => [requiredString(lineId, 'lineId'), requireLine(value, lineId)]));
  if (Object.keys(lineProperties).length === 0) {
    throw new TypeError('At least one coupled-network line-property record is required.');
  }
  const componentComplianceMultipliers = Object.fromEntries(
    Object.entries(input.componentComplianceMultipliers || {})
      .map(([type, multiplier]) => [normalizedType(type), positive(
        multiplier,
        `componentComplianceMultipliers.${type}`,
      )])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  if (Object.keys(componentComplianceMultipliers).length === 0) {
    throw new TypeError('At least one component compliance multiplier is required.');
  }
  const base = {
    schema: EMPIRICAL_COUPLED_RESTRAINT_NETWORK_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    qualification: oneOf(input.qualification, QUALIFICATIONS, 'qualification'),
    locked: booleanValue(input.locked, 'locked'),
    lineProperties,
    componentComplianceMultipliers,
    compliance: requireCompliance(input.compliance),
    domain: requireDomain(input.domain),
    tolerances: requireTolerances(input.tolerances),
    numericalOptions: requireNumericalOptions(input.numericalOptions),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalCoupledRestraintNetworkProfile(value) {
  exactKeys(value, PROFILE_KEYS, 'empirical coupled restraint-network profile');
  if (value.schema !== EMPIRICAL_COUPLED_RESTRAINT_NETWORK_PROFILE_SCHEMA) {
    throw new TypeError('Unsupported empirical coupled restraint-network profile schema.');
  }
  const normalized = createEmpiricalCoupledRestraintNetworkProfile(value);
  if (normalized.semanticHash !== value.semanticHash) {
    throw new TypeError('Empirical coupled restraint-network profile semantic hash mismatch.');
  }
  return normalized;
}

export function cloneEmpiricalCoupledRestraintNetworkProfile(profile, value = {}) {
  const source = requireEmpiricalCoupledRestraintNetworkProfile(profile);
  return createEmpiricalCoupledRestraintNetworkProfile({
    profileId: requiredString(value.profileId || `${source.profileId}-CLONE`, 'profileId'),
    profileVersion: Number.isInteger(value.profileVersion)
      ? value.profileVersion
      : source.profileVersion + 1,
    qualification: 'UNQUALIFIED',
    locked: false,
    lineProperties: structuredClone(source.lineProperties),
    componentComplianceMultipliers: structuredClone(source.componentComplianceMultipliers),
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
    elasticModulus: requiredString(value.elasticModulus, `${lineId}.authority.elasticModulus`),
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
    'requireAtLeastOneAnchor',
    'requireTwoPortComponents',
    'maximumNodeDegree',
    'maximumCycleCount',
    'allowFriction',
    'allowFiniteGaps',
    'allowFiniteStiffness',
    'allowBranches',
    'allowClosedLoops',
  ], 'domain');
  const allowedComponentTypes = [...new Set((value.allowedComponentTypes || [])
    .map((item) => normalizedType(requiredString(item, 'domain.allowedComponentTypes'))))].sort();
  if (allowedComponentTypes.length === 0) {
    throw new TypeError('At least one allowed coupled-network component type is required.');
  }
  if (value.requireAtLeastOneAnchor !== true
    || value.requireTwoPortComponents !== true
    || value.allowFriction !== false
    || value.allowFiniteGaps !== false
    || value.allowFiniteStiffness !== false
    || value.allowBranches !== true
    || value.allowClosedLoops !== true) {
    throw new TypeError(
      'The WP6 qualified domain requires rigid anchors/restraints, two-port components, branches and loops, with no friction, finite gaps or finite stiffness.',
    );
  }
  return deepFreeze({
    allowedComponentTypes,
    requireAtLeastOneAnchor: true,
    requireTwoPortComponents: true,
    maximumNodeDegree: positiveInteger(value.maximumNodeDegree, 'domain.maximumNodeDegree'),
    maximumCycleCount: nonnegativeInteger(value.maximumCycleCount, 'domain.maximumCycleCount'),
    allowFriction: false,
    allowFiniteGaps: false,
    allowFiniteStiffness: false,
    allowBranches: true,
    allowClosedLoops: true,
  });
}

function requireTolerances(value) {
  exactKeys(value, [
    'pointProjectionM',
    'directionParallelCosine',
    'directionOrthogonalCosine',
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

function normalizedType(value) {
  return stringValue(value).toUpperCase().replace(/[ -]+/g, '_') || 'UNKNOWN';
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

function nonnegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer.`);
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
