import {
  deepFreeze,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import { validatePipingPortTopologyGraph } from '../piping-topology/index.js';

export const NON_FEA_THERMAL_ASSIGNMENT_AUTHORITY_SCHEMA =
  'non-fea-thermal-assignment-authority/v1';
export const NON_FEA_OPERATING_TEMPERATURE_ASSIGNMENT_SET_SCHEMA =
  'non-fea-operating-temperature-assignment-set/v1';
export const NON_FEA_THERMAL_EXPANSION_ASSIGNMENT_SET_SCHEMA =
  'non-fea-thermal-expansion-assignment-set/v1';
export const NON_FEA_THERMAL_FREE_MOVEMENT_BASIS_SCHEMA =
  'thermal-free-movement-basis/v1';

/**
 * Converts Project Data thermal policy into exact per-entity assignment
 * authority. Free-form legacy maps are never guessed: they remain explicit
 * blockers until migrated to the schema-bearing assignment sets below.
 */
export function createNonFeaThermalAssignmentAuthority(input = {}) {
  const profile = input.projectDataProfile;
  if (!isRecord(profile)) throw new TypeError('Thermal assignment authority requires Project Data.');
  const blockers = [];
  const installation = profile?.thermoMechanicalBasis?.installationTemperatureC;
  const temperatures = profile?.thermoMechanicalBasis?.operatingTemperaturesC;
  const properties = profile?.thermoMechanicalBasis?.materialElasticProperties;

  const installationTemperatureC = approvedFiniteEntry(
    installation,
    'thermoMechanicalBasis.installationTemperatureC',
    blockers,
  );
  const temperatureAssignments = assignmentSet(
    temperatures,
    NON_FEA_OPERATING_TEMPERATURE_ASSIGNMENT_SET_SCHEMA,
    'temperature',
    blockers,
  );
  const expansionAssignments = assignmentSet(
    properties,
    NON_FEA_THERMAL_EXPANSION_ASSIGNMENT_SET_SCHEMA,
    'expansion',
    blockers,
  );
  const normalizedBlockers = uniqueIssues(blockers);
  const base = {
    schema: NON_FEA_THERMAL_ASSIGNMENT_AUTHORITY_SCHEMA,
    projectDataRevision: Number.isInteger(profile.revision) ? profile.revision : null,
    state: normalizedBlockers.length ? 'BLOCKED' : 'READY',
    installationTemperatureC,
    temperatureAssignments,
    expansionAssignments,
    sourceEvidence: {
      installation: cloneEvidence(installation?.evidence),
      temperatures: cloneEvidence(temperatures?.evidence),
      expansion: cloneEvidence(properties?.evidence),
    },
    blockers: normalizedBlockers,
    policy: {
      selectorKind: 'ENTITY',
      fuzzySelectorPermitted: false,
      implicitDefaultPermitted: false,
      missingToZeroPermitted: false,
      materialAliasInferencePermitted: false,
      calculationAuthorizationAuthority: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaThermalAssignmentAuthority(value) {
  const errors = [];
  if (!isRecord(value)) return deepFreeze({ ok: false, errors: ['Thermal assignment authority must be an object.'] });
  if (value.schema !== NON_FEA_THERMAL_ASSIGNMENT_AUTHORITY_SCHEMA) {
    errors.push(`Expected ${NON_FEA_THERMAL_ASSIGNMENT_AUTHORITY_SCHEMA}.`);
  }
  if (!['READY', 'BLOCKED'].includes(value.state)) errors.push('Thermal assignment authority state is invalid.');
  if (!Array.isArray(value.temperatureAssignments)) errors.push('Temperature assignments must be an array.');
  if (!Array.isArray(value.expansionAssignments)) errors.push('Expansion assignments must be an array.');
  if (value.policy?.fuzzySelectorPermitted !== false || value.policy?.implicitDefaultPermitted !== false) {
    errors.push('Thermal assignment authority cannot permit fuzzy/default inference.');
  }
  if (value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Thermal assignment semantic hash is invalid.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

/**
 * Computes thermal-only free movement for exact two-port oriented components.
 * Branch/multi-port path decomposition is intentionally blocked rather than
 * collapsed into one fictitious vector. Cold spring/equipment motion remain
 * separate future authorities and are not silently included here.
 */
export function createNonFeaThermalFreeMovementBasis(input = {}) {
  const sharedModel = requireSharedModel(input.sharedModel);
  const topologyGraph = requireTopology(input.topologyGraph, sharedModel);
  const authority = requireThermalAuthority(input.thermalAssignmentAuthority);
  const requestedLoadCaseIds = uniqueText(input.requestedLoadCaseIds || [], 'requestedLoadCaseIds');
  if (requestedLoadCaseIds.length === 0) throw new TypeError('At least one thermal load case is required.');
  const blockers = authority.blockers.map((row) => ({ ...row }));
  if (authority.state !== 'READY') blockers.push(issue(
    'THERMAL_ASSIGNMENT_AUTHORITY_BLOCKED',
    'thermalAssignmentAuthority',
    'Thermal free movement cannot be compiled from blocked assignment authority.',
  ));

  const temperatureByKey = new Map(authority.temperatureAssignments.map((row) => [
    `${row.loadCaseId}|${row.entityId}`,
    row,
  ]));
  const expansionByEntity = new Map(authority.expansionAssignments.map((row) => [row.entityId, row]));
  const componentRows = [];
  const portsByComponent = groupBy(topologyGraph.ports, (row) => row.componentKey);
  const componentByKey = new Map(sharedModel.components.map((row) => [row.componentKey, row]));

  requestedLoadCaseIds.forEach((loadCaseId) => {
    [...topologyGraph.components].sort(byField('componentKey')).forEach((componentRef) => {
      const component = componentByKey.get(componentRef.componentKey);
      const ports = (portsByComponent.get(componentRef.componentKey) || []).filter((row) => row.positionCanonical);
      if (ports.length !== 2) {
        blockers.push(issue(
          'THERMAL_BRANCH_PATH_DECOMPOSITION_REQUIRED',
          `${loadCaseId}:${componentRef.componentKey}`,
          `Component ${componentRef.componentKey} requires explicit path/leg thermal decomposition because it does not have exactly two positioned ports.`,
        ));
        return;
      }
      const oriented = orientTwoPorts(ports);
      if (!oriented) {
        blockers.push(issue(
          'THERMAL_COMPONENT_DIRECTION_UNRESOLVED',
          `${loadCaseId}:${componentRef.componentKey}`,
          `Component ${componentRef.componentKey} has no source-authoritative start/end orientation.`,
        ));
        return;
      }
      const temperature = temperatureByKey.get(`${loadCaseId}|${componentRef.componentKey}`);
      const expansion = expansionByEntity.get(componentRef.componentKey);
      if (!temperature) {
        blockers.push(issue(
          'THERMAL_TEMPERATURE_ASSIGNMENT_MISSING',
          `${loadCaseId}:${componentRef.componentKey}`,
          'Exact entity/load-case operating temperature assignment is required.',
        ));
        return;
      }
      if (!expansion) {
        blockers.push(issue(
          'THERMAL_EXPANSION_ASSIGNMENT_MISSING',
          `${loadCaseId}:${componentRef.componentKey}`,
          'Exact entity thermal-expansion assignment is required.',
        ));
        return;
      }
      const start = oriented[0].positionCanonical;
      const end = oriented[1].positionCanonical;
      const centerlineVectorM = [
        (end.x - start.x) / 1000,
        (end.y - start.y) / 1000,
        (end.z - start.z) / 1000,
      ];
      const deltaTemperatureC = temperature.temperatureC - authority.installationTemperatureC;
      const strain = expansion.thermalExpansionPerC * deltaTemperatureC;
      const freeMovementM = centerlineVectorM.map((value) => value * strain);
      componentRows.push(deepFreeze({
        loadCaseId,
        componentKey: componentRef.componentKey,
        componentType: component?.type || componentRef.type || 'UNKNOWN',
        startPortKey: oriented[0].portKey,
        endPortKey: oriented[1].portKey,
        centerlineVectorM,
        installationTemperatureC: authority.installationTemperatureC,
        operatingTemperatureC: temperature.temperatureC,
        deltaTemperatureC,
        thermalExpansionPerC: expansion.thermalExpansionPerC,
        freeThermalStrain: strain,
        freeMovementM,
        temperatureAssignmentId: temperature.assignmentId,
        expansionAssignmentId: expansion.assignmentId,
      }));
    });
  });

  const normalizedBlockers = uniqueIssues(blockers);
  const caseRows = requestedLoadCaseIds.map((loadCaseId) => {
    const rows = componentRows.filter((row) => row.loadCaseId === loadCaseId);
    const caseBlockers = normalizedBlockers.filter((row) => row.scope === 'thermalAssignmentAuthority'
      || row.scope === 'temperature' || row.scope === 'expansion'
      || row.scope.startsWith(`${loadCaseId}:`));
    return deepFreeze({
      loadCaseId,
      state: caseBlockers.length ? 'BLOCKED' : 'READY',
      componentCount: rows.length,
      vectorSumM: sumVectors(rows.map((row) => row.freeMovementM)),
      blockers: caseBlockers,
    });
  });
  const base = {
    schema: NON_FEA_THERMAL_FREE_MOVEMENT_BASIS_SCHEMA,
    datasetId: topologyGraph.datasetId,
    state: normalizedBlockers.length ? (componentRows.length ? 'PARTIALLY_READY' : 'BLOCKED') : 'READY',
    sharedModelSemanticHash: sharedModel.semanticHash,
    topologyGraphSemanticHash: topologyGraph.semanticHash,
    thermalAssignmentAuthoritySemanticHash: authority.semanticHash,
    requestedLoadCaseIds,
    components: componentRows.sort((left, right) => ascii(`${left.loadCaseId}|${left.componentKey}`, `${right.loadCaseId}|${right.componentKey}`)),
    loadCases: caseRows,
    blockers: normalizedBlockers,
    limitations: [
      'THERMAL_ONLY_FREE_MOVEMENT',
      'COLD_SPRING_NOT_INCLUDED',
      'EQUIPMENT_BOUNDARY_MOTION_NOT_INCLUDED',
      'MULTIPORT_BRANCH_DECOMPOSITION_REQUIRES_EXPLICIT_PATH_AUTHORITY',
    ],
    policy: {
      exactEntityAssignmentRequired: true,
      implicitTemperatureInheritancePermitted: false,
      implicitMaterialAliasPermitted: false,
      topologyMutationPermitted: false,
      calculationAuthorizationAuthority: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaThermalFreeMovementBasis(value) {
  const errors = [];
  if (!isRecord(value)) return deepFreeze({ ok: false, errors: ['Thermal free-movement basis must be an object.'] });
  if (value.schema !== NON_FEA_THERMAL_FREE_MOVEMENT_BASIS_SCHEMA) errors.push(`Expected ${NON_FEA_THERMAL_FREE_MOVEMENT_BASIS_SCHEMA}.`);
  if (!['READY', 'PARTIALLY_READY', 'BLOCKED'].includes(value.state)) errors.push('Thermal free-movement basis state is invalid.');
  if (!Array.isArray(value.components) || !Array.isArray(value.loadCases) || !Array.isArray(value.blockers)) {
    errors.push('Thermal free-movement basis arrays are invalid.');
  }
  if (value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Thermal free-movement semantic hash is invalid.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function assignmentSet(entry, expectedSchema, kind, blockers) {
  if (!isApprovedEvidenceEntry(entry)) {
    blockers.push(issue(
      kind === 'temperature' ? 'THERMAL_TEMPERATURE_ASSIGNMENT_AUTHORITY_REQUIRED' : 'THERMAL_EXPANSION_ASSIGNMENT_AUTHORITY_REQUIRED',
      kind,
      `Approved source-evidenced ${kind} assignment authority is required.`,
    ));
    return [];
  }
  const set = entry.value;
  if (!isRecord(set) || set.schema !== expectedSchema || !Array.isArray(set.assignments)) {
    blockers.push(issue(
      kind === 'temperature' ? 'THERMAL_TEMPERATURE_ASSIGNMENT_SCHEMA_REQUIRED' : 'THERMAL_EXPANSION_ASSIGNMENT_SCHEMA_REQUIRED',
      kind,
      `Expected ${expectedSchema}; free-form maps are not interpreted as entity assignment precedence.`,
    ));
    return [];
  }
  try {
    return kind === 'temperature'
      ? normalizeTemperatureAssignments(set.assignments)
      : normalizeExpansionAssignments(set.assignments);
  } catch (error) {
    blockers.push(issue(
      kind === 'temperature' ? 'THERMAL_TEMPERATURE_ASSIGNMENT_INVALID' : 'THERMAL_EXPANSION_ASSIGNMENT_INVALID',
      kind,
      error.message,
    ));
    return [];
  }
}

function normalizeTemperatureAssignments(rows) {
  const normalized = rows.map((row) => {
    if (!isRecord(row) || row.selectorKind !== 'ENTITY') throw new TypeError('Temperature assignment selectorKind must be ENTITY.');
    return deepFreeze({
      assignmentId: requiredText(row.assignmentId, 'temperature assignmentId'),
      selectorKind: 'ENTITY',
      entityId: requiredText(row.entityId || row.selectorKey, 'temperature entityId'),
      loadCaseId: requiredText(row.loadCaseId, 'temperature loadCaseId'),
      temperatureC: finite(row.temperatureC, 'temperatureC'),
      basis: requiredText(row.basis, 'temperature basis'),
    });
  }).sort((left, right) => ascii(`${left.loadCaseId}|${left.entityId}|${left.assignmentId}`, `${right.loadCaseId}|${right.entityId}|${right.assignmentId}`));
  assertUnique(normalized.map((row) => row.assignmentId), 'Temperature assignment IDs');
  assertUnique(normalized.map((row) => `${row.loadCaseId}|${row.entityId}`), 'Temperature entity/load-case assignments');
  return deepFreeze(normalized);
}

function normalizeExpansionAssignments(rows) {
  const normalized = rows.map((row) => {
    if (!isRecord(row) || row.selectorKind !== 'ENTITY') throw new TypeError('Expansion assignment selectorKind must be ENTITY.');
    return deepFreeze({
      assignmentId: requiredText(row.assignmentId, 'expansion assignmentId'),
      selectorKind: 'ENTITY',
      entityId: requiredText(row.entityId || row.selectorKey, 'expansion entityId'),
      thermalExpansionPerC: positive(row.thermalExpansionPerC, 'thermalExpansionPerC'),
      basis: requiredText(row.basis, 'expansion basis'),
    });
  }).sort((left, right) => ascii(`${left.entityId}|${left.assignmentId}`, `${right.entityId}|${right.assignmentId}`));
  assertUnique(normalized.map((row) => row.assignmentId), 'Expansion assignment IDs');
  assertUnique(normalized.map((row) => row.entityId), 'Expansion entity assignments');
  return deepFreeze(normalized);
}

function approvedFiniteEntry(entry, scope, blockers) {
  if (!isApprovedEvidenceEntry(entry) || !Number.isFinite(entry.value)) {
    blockers.push(issue('THERMAL_INSTALLATION_TEMPERATURE_AUTHORITY_REQUIRED', scope, 'Approved finite installation temperature is required.'));
    return null;
  }
  return entry.value;
}
function isApprovedEvidenceEntry(entry) {
  return isRecord(entry) && entry.approved === true && isRecord(entry.evidence)
    && Boolean(stringValue(entry.evidence.source));
}
function cloneEvidence(value) { return isRecord(value) ? deepFreeze(structuredClone(value)) : null; }
function requireThermalAuthority(value) {
  const validation = validateNonFeaThermalAssignmentAuthority(value);
  if (!validation.ok) throw new TypeError(`Invalid thermal assignment authority: ${validation.errors.join(' ')}`);
  return value;
}
function requireSharedModel(value) {
  const validation = validateSharedPipingModel(value);
  if (!validation.ok) throw new TypeError(`Invalid shared model for thermal movement: ${validation.errors.join(' ')}`);
  return value;
}
function requireTopology(value, sharedModel) {
  const validation = validatePipingPortTopologyGraph(value);
  if (!validation.ok) throw new TypeError(`Invalid topology for thermal movement: ${validation.errors.join(' ')}`);
  if (value.sharedModelSemanticHash !== sharedModel.semanticHash) throw new TypeError('Thermal topology is stale for the shared model.');
  return value;
}
function orientTwoPorts(ports) {
  const starts = ports.filter((row) => roleClass(row.role) === 'START');
  const ends = ports.filter((row) => roleClass(row.role) === 'END');
  return starts.length === 1 && ends.length === 1 ? [starts[0], ends[0]] : null;
}
function roleClass(value) {
  const role = stringValue(value).toUpperCase().replace(/[ -]+/g, '_');
  if (['START', 'FROM', 'INLET', 'BEGIN', 'PORT_A', 'A'].includes(role)) return 'START';
  if (['END', 'TO', 'OUTLET', 'FINISH', 'PORT_B', 'B'].includes(role)) return 'END';
  return 'UNKNOWN';
}
function groupBy(rows, keyOf) {
  const map = new Map();
  rows.forEach((row) => { const key = keyOf(row); const list = map.get(key) || []; list.push(row); map.set(key, list); });
  return map;
}
function sumVectors(rows) {
  return rows.reduce((sum, row) => row.map((value, index) => sum[index] + value), [0, 0, 0]);
}
function uniqueText(rows, field) {
  if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string' || !row.trim())) throw new TypeError(`${field} must be a non-empty string array.`);
  const result = [...new Set(rows)].sort(ascii);
  if (result.length !== rows.length) throw new TypeError(`${field} cannot contain duplicates.`);
  return result;
}
function assertUnique(values, field) { if (new Set(values).size !== values.length) throw new TypeError(`${field} must be unique.`); }
function finite(value, field) { if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite.`); return value; }
function positive(value, field) { if (!Number.isFinite(value) || !(value > 0)) throw new TypeError(`${field} must be greater than zero.`); return value; }
function requiredText(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} is required.`); return normalized; }
function issue(code, scope, message) { return deepFreeze({ code, severity: 'ERROR', scope, message }); }
function uniqueIssues(rows) { return [...new Map(rows.map((row) => [`${row.code}|${row.scope}|${row.message}`, row])).values()].sort((left, right) => ascii(`${left.code}|${left.scope}`, `${right.code}|${right.scope}`)); }
function byField(field) { return (left, right) => ascii(String(left[field]), String(right[field])); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function withoutHash(value) { const copy = structuredClone(value); delete copy.semanticHash; return copy; }
