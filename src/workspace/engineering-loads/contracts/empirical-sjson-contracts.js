import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const EMPIRICAL_COORDINATE_FRAME_SCHEMA = 'empirical-coordinate-frame/v1';
export const EMPIRICAL_ANALYSIS_SCENARIO_SCHEMA = 'empirical-analysis-scenario/v1';
export const EMPIRICAL_RESTRAINT_OVERRIDE_SCHEMA = 'empirical-restraint-override/v1';
export const SJSON_EMPIRICAL_ADAPTER_EVIDENCE_SCHEMA = 'sjson-empirical-adapter-evidence/v1';

export const EMPIRICAL_ANALYSIS_METHODS = Object.freeze([
  'CHAINAGE_TRIBUTARY_SPAN_V2',
  'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
  'EMPIRICAL_BEAM_CONTACT_V1',
  'EMPIRICAL_RESTRAINT_NETWORK_V1',
  'EMPIRICAL_RESTRAINT_NETWORK_V2',
]);

export const EMPIRICAL_LOAD_CASE_IDS = Object.freeze([
  'W-COLD',
  'W-HOT',
  'SUSTAINED',
  'OPE-HOT',
  'EXP-THERMAL-ON-HOT-SUPPORT-SET',
]);

export const EMPIRICAL_RESULT_CLASSES = Object.freeze([
  'VERTICAL_SCREENING_RESULT',
  'THERMAL_LINE_STOP_SCREENING_RESULT',
  'COMBINED_OPERATING_REACTION',
]);

export const EMPIRICAL_COMBINATION_POLICIES = Object.freeze([
  'SEPARATE_UNTIL_QUALIFIED',
  'COUPLED_MODEL_QUALIFIED',
  'SUPERPOSITION_RULE_QUALIFIED',
]);

const FORCE_CONVENTIONS = Object.freeze([
  'RESTRAINT_ON_PIPE',
  'PIPE_ON_RESTRAINT',
]);

const PROFILE_QUALIFICATIONS = Object.freeze([
  'QUALIFIED',
  'UNQUALIFIED',
  'EXPERIMENTAL',
]);

const SCENARIO_STATES = Object.freeze([
  'DRAFT',
  'AUTHORIZED',
]);

export function createEmpiricalCoordinateFrame(input) {
  requireRecord(input, 'coordinateFrame input');
  const base = {
    schema: EMPIRICAL_COORDINATE_FRAME_SCHEMA,
    sourceBasis: requiredString(input.sourceBasis, 'sourceBasis'),
    sourceLengthUnit: requiredString(input.sourceLengthUnit, 'sourceLengthUnit'),
    verticalUnitVector: unitVector(input.verticalUnitVector, 'verticalUnitVector'),
    analysisPlaneBasis: requirePlaneBasis(input.analysisPlaneBasis),
    forceOutputConvention: oneOf(
      input.forceOutputConvention,
      FORCE_CONVENTIONS,
      'forceOutputConvention',
    ),
    momentOutputConvention: oneOf(
      input.momentOutputConvention,
      FORCE_CONVENTIONS,
      'momentOutputConvention',
    ),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalCoordinateFrame(value) {
  exactKeys(value, [
    'schema',
    'sourceBasis',
    'sourceLengthUnit',
    'verticalUnitVector',
    'analysisPlaneBasis',
    'forceOutputConvention',
    'momentOutputConvention',
    'semanticHash',
  ], 'coordinateFrame');
  if (value.schema !== EMPIRICAL_COORDINATE_FRAME_SCHEMA) {
    throw new TypeError('Unsupported empirical coordinate-frame schema.');
  }
  const normalized = createEmpiricalCoordinateFrame(value);
  requireHash(value.semanticHash, normalized.semanticHash, 'coordinateFrame');
  return normalized;
}

export function createEmpiricalRestraintOverride(input) {
  requireRecord(input, 'restraint override input');
  if (input.geometryMutation !== false) {
    throw new TypeError('A calculation restraint override must set geometryMutation=false.');
  }
  const base = {
    schema: EMPIRICAL_RESTRAINT_OVERRIDE_SCHEMA,
    overrideId: requiredString(input.overrideId, 'overrideId'),
    supportSiteId: requiredString(input.supportSiteId, 'supportSiteId'),
    restraintId: requiredString(input.restraintId, 'restraintId'),
    sourceType: nullableString(input.sourceType),
    effectiveType: requiredString(input.effectiveType, 'effectiveType'),
    sourceDirection: nullableString(input.sourceDirection),
    effectiveDirection: requiredString(input.effectiveDirection, 'effectiveDirection'),
    sourceAxis: nullableUnitVector(input.sourceAxis, 'sourceAxis'),
    effectiveAxis: nullableUnitVector(input.effectiveAxis, 'effectiveAxis'),
    sourceGapMm: nullableNonNegative(input.sourceGapMm, 'sourceGapMm'),
    effectiveGapMm: nullableNonNegative(input.effectiveGapMm, 'effectiveGapMm'),
    sourceStiffnessNPerM: nullablePositive(input.sourceStiffnessNPerM, 'sourceStiffnessNPerM'),
    effectiveStiffnessNPerM: nullablePositive(
      input.effectiveStiffnessNPerM,
      'effectiveStiffnessNPerM',
    ),
    sourceFriction: nullableNonNegative(input.sourceFriction, 'sourceFriction'),
    effectiveFriction: nullableNonNegative(input.effectiveFriction, 'effectiveFriction'),
    reason: requiredString(input.reason, 'reason'),
    geometryMutation: false,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalRestraintOverride(value) {
  exactKeys(value, [
    'schema',
    'overrideId',
    'supportSiteId',
    'restraintId',
    'sourceType',
    'effectiveType',
    'sourceDirection',
    'effectiveDirection',
    'sourceAxis',
    'effectiveAxis',
    'sourceGapMm',
    'effectiveGapMm',
    'sourceStiffnessNPerM',
    'effectiveStiffnessNPerM',
    'sourceFriction',
    'effectiveFriction',
    'reason',
    'geometryMutation',
    'semanticHash',
  ], 'restraintOverride');
  if (value.schema !== EMPIRICAL_RESTRAINT_OVERRIDE_SCHEMA) {
    throw new TypeError('Unsupported empirical restraint-override schema.');
  }
  const normalized = createEmpiricalRestraintOverride(value);
  requireHash(value.semanticHash, normalized.semanticHash, 'restraintOverride');
  return normalized;
}

export function createEmpiricalAnalysisScenario(input) {
  requireRecord(input, 'analysis scenario input');
  const coordinateFrame = input.coordinateFrame?.schema
    ? requireEmpiricalCoordinateFrame(input.coordinateFrame)
    : createEmpiricalCoordinateFrame(input.coordinateFrame);
  const restraintOverrides = (input.restraintOverrides || []).map((row) => (
    row?.schema ? requireEmpiricalRestraintOverride(row) : createEmpiricalRestraintOverride(row)
  )).sort(byField('overrideId'));
  requireUnique(restraintOverrides, 'overrideId', 'restraint override IDs');
  requireUnique(restraintOverrides, 'restraintId', 'overridden restraint IDs');
  const loadCases = (input.loadCases || []).map(requireLoadCase).sort(byField('loadCaseId'));
  requireUnique(loadCases, 'loadCaseId', 'load-case IDs');
  if (!loadCases.length) throw new TypeError('At least one empirical load case is required.');
  const base = {
    schema: EMPIRICAL_ANALYSIS_SCENARIO_SCHEMA,
    scenarioId: requiredString(input.scenarioId, 'scenarioId'),
    name: requiredString(input.name, 'name'),
    method: oneOf(input.method, EMPIRICAL_ANALYSIS_METHODS, 'method'),
    state: oneOf(input.state || 'DRAFT', SCENARIO_STATES, 'state'),
    coordinateFrame,
    loadCases,
    restraintOverrides,
    profileRef: requireProfileRef(input.profileRef),
    sourceBindings: requireSourceBindings(input.sourceBindings),
    combinationPolicy: oneOf(
      input.combinationPolicy || 'SEPARATE_UNTIL_QUALIFIED',
      EMPIRICAL_COMBINATION_POLICIES,
      'combinationPolicy',
    ),
  };
  validateMethodResultOwnership(base);
  validateCombinationPolicy(base);
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalAnalysisScenario(value) {
  exactKeys(value, [
    'schema',
    'scenarioId',
    'name',
    'method',
    'state',
    'coordinateFrame',
    'loadCases',
    'restraintOverrides',
    'profileRef',
    'sourceBindings',
    'combinationPolicy',
    'semanticHash',
  ], 'analysisScenario');
  if (value.schema !== EMPIRICAL_ANALYSIS_SCENARIO_SCHEMA) {
    throw new TypeError('Unsupported empirical analysis-scenario schema.');
  }
  const normalized = createEmpiricalAnalysisScenario(value);
  requireHash(value.semanticHash, normalized.semanticHash, 'analysisScenario');
  return normalized;
}

export function createSjsonEmpiricalAdapterEvidence(input) {
  requireRecord(input, 'adapter evidence input');
  const base = {
    schema: SJSON_EMPIRICAL_ADAPTER_EVIDENCE_SCHEMA,
    datasetId: requiredString(input.datasetId, 'datasetId'),
    sourceDatasetHash: requiredHash(input.sourceDatasetHash, 'sourceDatasetHash'),
    sharedModelHash: requiredHash(input.sharedModelHash, 'sharedModelHash'),
    topologyHash: requiredHash(input.topologyHash, 'topologyHash'),
    attachmentHash: requiredHash(input.attachmentHash, 'attachmentHash'),
    restraintHash: requiredHash(input.restraintHash, 'restraintHash'),
    scenarioHash: requiredHash(input.scenarioHash, 'scenarioHash'),
    coordinateFrameHash: requiredHash(input.coordinateFrameHash, 'coordinateFrameHash'),
    sourceGeometryHash: requiredHash(input.sourceGeometryHash, 'sourceGeometryHash'),
    effectiveGeometryHash: requiredHash(input.effectiveGeometryHash, 'effectiveGeometryHash'),
    supportCrosswalkHash: requiredHash(input.supportCrosswalkHash, 'supportCrosswalkHash'),
    requestHash: requiredHash(input.requestHash, 'requestHash'),
    blockers: (input.blockers || []).map(requireBlocker).sort(blockerOrder),
  };
  if (base.sourceGeometryHash !== base.effectiveGeometryHash) {
    throw new TypeError('Scenario adaptation changed canonical geometry.');
  }
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireSjsonEmpiricalAdapterEvidence(value) {
  exactKeys(value, [
    'schema',
    'datasetId',
    'sourceDatasetHash',
    'sharedModelHash',
    'topologyHash',
    'attachmentHash',
    'restraintHash',
    'scenarioHash',
    'coordinateFrameHash',
    'sourceGeometryHash',
    'effectiveGeometryHash',
    'supportCrosswalkHash',
    'requestHash',
    'blockers',
    'semanticHash',
  ], 'adapterEvidence');
  if (value.schema !== SJSON_EMPIRICAL_ADAPTER_EVIDENCE_SCHEMA) {
    throw new TypeError('Unsupported SJSON empirical adapter-evidence schema.');
  }
  const normalized = createSjsonEmpiricalAdapterEvidence(value);
  requireHash(value.semanticHash, normalized.semanticHash, 'adapterEvidence');
  return normalized;
}

function requireLoadCase(value) {
  exactKeys(value, [
    'loadCaseId',
    'label',
    'resultClass',
    'effects',
  ], 'loadCase');
  const result = {
    loadCaseId: oneOf(value.loadCaseId, EMPIRICAL_LOAD_CASE_IDS, 'loadCaseId'),
    label: requiredString(value.label, 'loadCase.label'),
    resultClass: oneOf(value.resultClass, EMPIRICAL_RESULT_CLASSES, 'resultClass'),
    effects: requireEffects(value.effects),
  };
  if (result.resultClass === 'COMBINED_OPERATING_REACTION'
    && result.loadCaseId !== 'OPE-HOT') {
    throw new TypeError('Combined operating reaction is valid only for OPE-HOT.');
  }
  return deepFreeze(result);
}

function requireEffects(value) {
  exactKeys(value, [
    'weight',
    'thermalStrain',
    'pressureCompatibility',
    'pressureStress',
  ], 'loadCase.effects');
  return deepFreeze({
    weight: booleanValue(value.weight, 'effects.weight'),
    thermalStrain: booleanValue(value.thermalStrain, 'effects.thermalStrain'),
    pressureCompatibility: booleanValue(
      value.pressureCompatibility,
      'effects.pressureCompatibility',
    ),
    pressureStress: booleanValue(value.pressureStress, 'effects.pressureStress'),
  });
}

function requireProfileRef(value) {
  exactKeys(value, [
    'profileId',
    'profileVersion',
    'qualification',
    'locked',
    'semanticHash',
  ], 'profileRef');
  return deepFreeze({
    profileId: requiredString(value.profileId, 'profileRef.profileId'),
    profileVersion: positiveInteger(value.profileVersion, 'profileRef.profileVersion'),
    qualification: oneOf(
      value.qualification,
      PROFILE_QUALIFICATIONS,
      'profileRef.qualification',
    ),
    locked: booleanValue(value.locked, 'profileRef.locked'),
    semanticHash: requiredHash(value.semanticHash, 'profileRef.semanticHash'),
  });
}

function requireSourceBindings(value) {
  exactKeys(value, [
    'datasetHash',
    'sharedModelHash',
    'topologyHash',
    'attachmentHash',
    'restraintHash',
    'profileHash',
  ], 'sourceBindings');
  return deepFreeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    requiredHash(item, `sourceBindings.${key}`),
  ])));
}

function validateMethodResultOwnership(scenario) {
  const lineStop = scenario.loadCases.filter((row) => (
    row.resultClass === 'THERMAL_LINE_STOP_SCREENING_RESULT'
  ));
  if (['EMPIRICAL_RESTRAINT_NETWORK_V1', 'EMPIRICAL_RESTRAINT_NETWORK_V2'].includes(scenario.method)) {
    if (lineStop.length !== scenario.loadCases.length) {
      throw new TypeError(
        'Empirical restraint-network methods may emit thermal line-stop screening results only.',
      );
    }
    scenario.loadCases.forEach((row) => {
      if (!row.effects.thermalStrain || row.effects.weight
        || row.effects.pressureCompatibility || row.effects.pressureStress) {
        throw new TypeError(
          'Empirical restraint-network methods require thermal-strain-only load ownership.',
        );
      }
    });
  }
  if (scenario.method === 'EMPIRICAL_BEAM_CONTACT_V1' && lineStop.length > 0) {
    throw new TypeError(
      'EMPIRICAL_BEAM_CONTACT_V1 cannot publish a line-stop screening result.',
    );
  }
  if (scenario.method.startsWith('CHAINAGE_') && scenario.loadCases.some((row) => (
    row.resultClass !== 'VERTICAL_SCREENING_RESULT'
  ))) {
    throw new TypeError('Chainage methods may publish vertical screening results only.');
  }
}

function validateCombinationPolicy(scenario) {
  const combined = scenario.loadCases.some((row) => (
    row.resultClass === 'COMBINED_OPERATING_REACTION'
  ));
  if (combined && scenario.combinationPolicy === 'SEPARATE_UNTIL_QUALIFIED') {
    throw new TypeError(
      'A combined operating reaction requires a qualified coupled model or superposition rule.',
    );
  }
}

function requirePlaneBasis(value) {
  exactKeys(value, ['u', 'v', 'normal'], 'analysisPlaneBasis');
  const u = unitVector(value.u, 'analysisPlaneBasis.u');
  const v = unitVector(value.v, 'analysisPlaneBasis.v');
  const normal = unitVector(value.normal, 'analysisPlaneBasis.normal');
  requireOrthogonal(u, v, 'analysisPlaneBasis.u/v');
  requireOrthogonal(u, normal, 'analysisPlaneBasis.u/normal');
  requireOrthogonal(v, normal, 'analysisPlaneBasis.v/normal');
  const handedness = dot(cross(u, v), normal);
  if (handedness < 1 - 1e-8) {
    throw new TypeError('analysisPlaneBasis must be right-handed.');
  }
  return deepFreeze({ u, v, normal });
}

function requireBlocker(value) {
  exactKeys(value, ['code', 'severity', 'scope', 'message'], 'blocker');
  return deepFreeze({
    code: requiredString(value.code, 'blocker.code'),
    severity: oneOf(value.severity, ['ERROR', 'WARNING'], 'blocker.severity'),
    scope: requiredString(value.scope, 'blocker.scope'),
    message: requiredString(value.message, 'blocker.message'),
  });
}

function unitVector(value, field) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError(`${field} must contain three finite numbers.`);
  }
  const magnitude = Math.hypot(...value);
  if (Math.abs(magnitude - 1) > 1e-8) {
    throw new TypeError(`${field} must be a unit vector.`);
  }
  return deepFreeze(value.map((item) => Object.is(item, -0) ? 0 : item));
}

function nullableUnitVector(value, field) {
  return value === null || value === undefined ? null : unitVector(value, field);
}

function requireOrthogonal(left, right, field) {
  if (Math.abs(dot(left, right)) > 1e-8) {
    throw new TypeError(`${field} vectors must be orthogonal.`);
  }
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a.reduce((sum, item, index) => sum + item * b[index], 0);
}

function nullableString(value) {
  const normalized = stringValue(value);
  return normalized || null;
}

function nullableNonNegative(value, field) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be non-negative.`);
  return value;
}

function nullablePositive(value, field) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${field} must be positive.`);
  return value;
}

function requiredHash(value, field) {
  const normalized = requiredString(value, field);
  if (!normalized.includes(':')) throw new TypeError(`${field} must be a namespaced hash.`);
  return normalized;
}

function requireHash(actual, expected, field) {
  if (actual !== expected) throw new TypeError(`${field} semantic hash mismatch.`);
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer.`);
  return value;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
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
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
}

function requireUnique(rows, field, label) {
  const values = rows.map((row) => row[field]);
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique.`);
}

function byField(field) {
  return (left, right) => String(left[field]).localeCompare(String(right[field]));
}

function blockerOrder(left, right) {
  return `${left.severity}|${left.code}|${left.scope}`
    .localeCompare(`${right.severity}|${right.code}|${right.scope}`);
}
