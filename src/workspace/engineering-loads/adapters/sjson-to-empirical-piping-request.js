import {
  deepFreeze,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../../../core/shared-piping-model/index.js';
import { validatePipingPortTopologyGraph } from '../../../core/piping-topology/index.js';
import {
  validateRestraintCapabilityModel,
  validateSupportAttachmentModel,
} from '../../../core/support-restraints/index.js';
import {
  EMPIRICAL_FAILURE_CODES,
  EMPIRICAL_PIPING_SCHEMAS,
} from '../../../core/empirical-piping-mechanics/index.js';
import {
  createSjsonEmpiricalAdapterEvidence,
  requireEmpiricalAnalysisScenario,
} from '../contracts/empirical-sjson-contracts.js';

export const SJSON_EMPIRICAL_REQUEST_ADAPTER_ID = 'SJSON_TO_EMPIRICAL_PIPING_REQUEST_V1';
export const SJSON_EMPIRICAL_REQUEST_ADAPTER_VERSION = 1;

const REQUEST_KEYS = Object.freeze([
  'schema',
  'method',
  'adapter',
  'datasetId',
  'scenarioId',
  'runtimeRegistration',
  'status',
  'coordinateFrame',
  'sourceBindings',
  'profileRef',
  'combinationPolicy',
  'loadCases',
  'components',
  'restraintOccurrences',
  'blockers',
  'adapterEvidence',
  'semanticHash',
]);

/**
 * Builds a format-independent empirical mechanics request from normalized
 * workspace authorities. Raw SJSON is intentionally not accepted here.
 *
 * This WP1 adapter does not execute or register a mechanics method. It binds
 * source identity, coordinate authority, support custody and scenario-only
 * restraint overrides into an immutable request package for later runtime use.
 */
export function buildSjsonEmpiricalPipingRequest(input) {
  requireInput(input);
  const scenario = requireEmpiricalAnalysisScenario(input.scenario);
  requireAdapterMethod(scenario.method);
  assertAuthorities(input, scenario);

  const components = buildComponents(input.sharedModel, input.topologyGraph);
  const sourceGeometryHash = semanticHash(components);
  const blockers = [];
  const restraintOccurrences = buildRestraintOccurrences({
    ...input,
    scenario,
    components,
    blockers,
  });
  addTopologyBlockers(input.topologyGraph, scenario.method, blockers);
  addCurrentMethodScopeBlockers(scenario, restraintOccurrences, blockers);

  const normalizedBlockers = uniqueBlockers(blockers);
  const status = normalizedBlockers.some((row) => row.severity === 'ERROR')
    ? 'BLOCKED'
    : 'READY_FOR_RUNTIME_BRIDGE';
  const requestPayload = {
    schema: EMPIRICAL_PIPING_SCHEMAS.request,
    method: scenario.method,
    adapter: {
      adapterId: SJSON_EMPIRICAL_REQUEST_ADAPTER_ID,
      adapterVersion: SJSON_EMPIRICAL_REQUEST_ADAPTER_VERSION,
    },
    datasetId: input.sharedModel.project.datasetId,
    scenarioId: scenario.scenarioId,
    runtimeRegistration: 'NOT_REGISTERED',
    status,
    coordinateFrame: scenario.coordinateFrame,
    sourceBindings: scenario.sourceBindings,
    profileRef: scenario.profileRef,
    combinationPolicy: scenario.combinationPolicy,
    loadCases: scenario.loadCases,
    components,
    restraintOccurrences,
    blockers: normalizedBlockers,
  };
  const requestHash = semanticHash(requestPayload);
  const supportCrosswalkHash = semanticHash(restraintOccurrences.map((row) => ({
    supportSiteId: row.supportSiteId,
    restraintId: row.restraintId,
    sourceSupportIds: row.sourceSupportIds,
    sourceEntityIds: row.sourceEntityIds,
    hostEntityId: row.hostEntityId,
    overrideId: row.overrideId,
  })));
  const adapterEvidence = createSjsonEmpiricalAdapterEvidence({
    datasetId: requestPayload.datasetId,
    sourceDatasetHash: scenario.sourceBindings.datasetHash,
    sharedModelHash: input.sharedModel.semanticHash,
    topologyHash: input.topologyGraph.semanticHash,
    attachmentHash: input.supportAttachmentModel.semanticHash,
    restraintHash: input.restraintCapabilityModel.semanticHash,
    scenarioHash: scenario.semanticHash,
    coordinateFrameHash: scenario.coordinateFrame.semanticHash,
    sourceGeometryHash,
    effectiveGeometryHash: sourceGeometryHash,
    supportCrosswalkHash,
    requestHash,
    blockers: normalizedBlockers,
  });
  const draft = { ...requestPayload, adapterEvidence };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireSjsonEmpiricalPipingRequest(value) {
  exactKeys(value, REQUEST_KEYS, 'empirical piping request');
  if (value.schema !== EMPIRICAL_PIPING_SCHEMAS.request) {
    throw new TypeError('Unsupported empirical piping request schema.');
  }
  if (value.adapter?.adapterId !== SJSON_EMPIRICAL_REQUEST_ADAPTER_ID
    || value.adapter?.adapterVersion !== SJSON_EMPIRICAL_REQUEST_ADAPTER_VERSION) {
    throw new TypeError('Unsupported SJSON empirical request adapter identity.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Empirical piping request semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function assertAuthorities(input, scenario) {
  assertValidation(
    validateSharedPipingModel(input.sharedModel),
    'shared-piping-model/v1',
  );
  assertValidation(
    validatePipingPortTopologyGraph(input.topologyGraph),
    'piping-port-topology-graph/v1',
  );
  assertValidation(
    validateSupportAttachmentModel(input.supportAttachmentModel),
    'support-attachment-model/v1',
  );
  assertValidation(
    validateRestraintCapabilityModel(input.restraintCapabilityModel),
    'restraint-capability-model/v1',
  );
  const datasetId = requiredString(input.sharedModel.project.datasetId, 'sharedModel.project.datasetId');
  const authorityDatasetIds = [
    input.topologyGraph.datasetId,
    input.supportAttachmentModel.datasetId,
    input.restraintCapabilityModel.datasetId,
    input.dataset?.datasetId,
  ].filter((value) => value !== undefined && value !== null);
  if (authorityDatasetIds.some((value) => value !== datasetId)) {
    throw new TypeError('Empirical adapter authorities do not share one datasetId.');
  }
  if (input.topologyGraph.sharedModelSemanticHash !== input.sharedModel.semanticHash) {
    throw new TypeError('Topology graph is stale for the supplied shared model.');
  }
  if (input.supportAttachmentModel.sharedModelSemanticHash !== input.sharedModel.semanticHash
    || input.supportAttachmentModel.topologySemanticHash !== input.topologyGraph.semanticHash) {
    throw new TypeError('Support attachment model is stale for the supplied model/topology.');
  }
  if (input.restraintCapabilityModel.attachmentModelSemanticHash
    !== input.supportAttachmentModel.semanticHash) {
    throw new TypeError('Restraint capability model is stale for the supplied attachment model.');
  }
  const expectedBindings = {
    datasetHash: datasetHash(input.dataset, input.sharedModel),
    sharedModelHash: input.sharedModel.semanticHash,
    topologyHash: input.topologyGraph.semanticHash,
    attachmentHash: input.supportAttachmentModel.semanticHash,
    restraintHash: input.restraintCapabilityModel.semanticHash,
    profileHash: scenario.profileRef.semanticHash,
  };
  Object.entries(expectedBindings).forEach(([key, expected]) => {
    if (scenario.sourceBindings[key] !== expected) {
      throw new TypeError(`Analysis scenario ${key} binding is stale.`);
    }
  });
}

function buildComponents(sharedModel, topologyGraph) {
  const graphPorts = new Map(topologyGraph.ports.map((port) => [port.portKey, port]));
  return sharedModel.components.map((component) => {
    const ports = (component.geometry?.ports || []).map((port) => {
      const graphPort = graphPorts.get(port.portKey);
      return {
        portId: requiredString(port.portKey, 'component portKey'),
        role: stringValue(port.role || graphPort?.role || 'port'),
        positionMm: graphPort?.positionCanonical || null,
        sourceReference: graphPort?.sourceReference || port.sourceReference || null,
      };
    }).sort(byField('portId'));
    return deepFreeze({
      memberId: component.componentKey,
      componentKey: component.componentKey,
      sourceEntityId: component.sourceEntityId ?? null,
      type: stringValue(component.type || 'UNKNOWN'),
      engineeringIdentity: structuredClone(component.identity || {}),
      ports,
      sourceReferences: structuredClone(component.sourceReferences || {}),
    });
  }).sort(byField('memberId'));
}

function buildRestraintOccurrences(context) {
  const supports = new Map(
    context.supportAttachmentModel.supportProjection.supports.map((row) => [row.supportKey, row]),
  );
  const attachments = groupBy(
    context.supportAttachmentModel.attachments,
    'supportKey',
  );
  const components = new Map(context.components.map((row) => [row.componentKey, row]));
  const overrides = new Map(context.scenario.restraintOverrides.map((row) => [row.restraintId, row]));
  return context.restraintCapabilityModel.restraints.map((restraint) => {
    const support = supports.get(restraint.supportKey);
    const supportAttachments = attachments.get(restraint.supportKey) || [];
    const attachment = supportAttachments.length === 1 ? supportAttachments[0] : null;
    const component = attachment ? components.get(attachment.attachedComponentKey) : null;
    const tangentResolution = resolveHostTangent(component);
    if (supportAttachments.length !== 1) {
      context.blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.BOUNDARY_CONDITION_UNRESOLVED,
        restraint.restraintId,
        'ERROR',
        'A restraint occurrence must resolve to exactly one host attachment for WP1.',
      ));
    }
    if (!tangentResolution.axis) {
      context.blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
        restraint.restraintId,
        'ERROR',
        tangentResolution.message,
      ));
    }
    if (!restraint.solverEligible) {
      context.blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.SUPPORT_CAPABILITY_UNKNOWN,
        restraint.restraintId,
        'ERROR',
        'The governed restraint capability is not solver-eligible.',
      ));
    }
    const override = overrides.get(restraint.restraintId) || null;
    if (override && override.supportSiteId !== restraint.supportKey) {
      throw new TypeError(`Override ${override.overrideId} belongs to a different support site.`);
    }
    if (override && override.effectiveDirection !== sourceCapabilityDirection(restraint)
      && !override.effectiveAxis) {
      context.blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
        restraint.restraintId,
        'ERROR',
        'A direction-changing override requires an explicit effectiveAxis.',
      ));
    }
    const basis = tangentResolution.axis
      ? buildAnchorBasis(
        tangentResolution.axis,
        context.scenario.coordinateFrame.verticalUnitVector,
        context.scenario.coordinateFrame.analysisPlaneBasis.u,
      )
      : null;
    const sourceCapability = sourceCapabilityRecord(restraint, tangentResolution.axis, basis);
    const effectiveCapability = applyOverride(sourceCapability, override);
    return deepFreeze({
      supportSiteId: restraint.supportKey,
      restraintId: restraint.restraintId,
      sourceSupportIds: [restraint.supportKey],
      sourceEntityIds: support?.sourceEntityId === null || support?.sourceEntityId === undefined
        ? []
        : [String(support.sourceEntityId)],
      hostEntityId: attachment?.attachedComponentKey || null,
      hostSourceEntityId: component?.sourceEntityId ?? null,
      attachmentId: attachment?.attachmentId || null,
      attachmentPointMm: attachment?.projectedPointCanonical || support?.positionCanonical || null,
      hostTangent: tangentResolution.axis,
      hostTangentEvidence: tangentResolution.evidence,
      sourceDirection: sourceCapability.direction,
      effectiveDirection: effectiveCapability.direction,
      sourceCapability,
      effectiveCapability,
      anchorBasis: basis,
      overrideId: override?.overrideId || null,
      overrideReason: override?.reason || null,
      geometryChanged: false,
      qualification: restraint.qualification,
    });
  }).sort(byField('restraintId'));
}

function sourceCapabilityRecord(restraint, tangent, basis) {
  const type = stringValue(restraint.supportType || 'SUPPORT');
  const anchor = /(^|_)ANC(HOR)?($|_)/.test(type) || /ANCHOR/.test(type);
  return deepFreeze({
    type,
    direction: sourceCapabilityDirection(restraint),
    axis: anchor ? tangent : inferredAxis(restraint, tangent, basis),
    gapMm: firstEvidenceNumber(restraint.gapEvidence),
    stiffnessNPerM: firstEvidenceNumber(restraint.stiffnessEvidence),
    friction: firstEvidenceNumber(restraint.frictionEvidence),
    translationalStates: {
      vertical: restraint.vertical.state,
      lateral: restraint.lateral.state,
      longitudinal: restraint.longitudinal.state,
    },
  });
}

function applyOverride(source, override) {
  if (!override) return source;
  return deepFreeze({
    ...source,
    type: override.effectiveType,
    direction: override.effectiveDirection,
    axis: override.effectiveAxis || source.axis,
    gapMm: override.effectiveGapMm,
    stiffnessNPerM: override.effectiveStiffnessNPerM,
    friction: override.effectiveFriction,
  });
}

function sourceCapabilityDirection(restraint) {
  const type = stringValue(restraint.supportType || 'SUPPORT');
  return /(^|_)ANC(HOR)?($|_)/.test(type) || /ANCHOR/.test(type)
    ? 'ANC'
    : inferredDirection(restraint);
}

function inferredDirection(restraint) {
  const active = [
    ['VERTICAL', restraint.vertical.state],
    ['LATERAL', restraint.lateral.state],
    ['LONGITUDINAL', restraint.longitudinal.state],
  ].filter(([, state]) => ['RESTRAINED', 'GAP', 'SPRING'].includes(state));
  return active.length === 1 ? active[0][0] : active.length > 1 ? 'MULTI' : 'UNRESOLVED';
}

function inferredAxis(restraint, tangent, basis) {
  const direction = inferredDirection(restraint);
  if (direction === 'LONGITUDINAL') return tangent;
  if (direction === 'VERTICAL') return basis?.vertical || null;
  if (direction === 'LATERAL') return basis?.guide || null;
  return null;
}

function buildAnchorBasis(tangent, vertical, deterministicTransverse) {
  const ls = normalize(tangent);
  const projectedVertical = subtract(vertical, scale(ls, dot(vertical, ls)));
  if (magnitude(projectedVertical) > 1e-8) {
    const rest = normalize(projectedVertical);
    return deepFreeze({
      labels: ['LS', 'R', 'G'],
      lineStop: ls,
      rest,
      guide: normalize(cross(ls, rest)),
      vertical,
    });
  }
  const projected = subtract(deterministicTransverse, scale(ls, dot(deterministicTransverse, ls)));
  if (magnitude(projected) <= 1e-8) {
    return null;
  }
  const t1 = normalize(projected);
  return deepFreeze({
    labels: ['LS', 'T1', 'T2'],
    lineStop: ls,
    rest: t1,
    guide: normalize(cross(ls, t1)),
    vertical,
  });
}

function resolveHostTangent(component) {
  if (!component) {
    return { axis: null, evidence: 'NO_HOST_COMPONENT', message: 'Host component is unresolved.' };
  }
  const explicit = component.sourceReferences?.analysisTangent
    || component.sourceReferences?.routeTangent
    || null;
  if (Array.isArray(explicit)) {
    const axis = normalizeOrNull(explicit);
    if (axis) return { axis, evidence: 'EXPLICIT_SOURCE_TANGENT', message: '' };
  }
  const validPorts = component.ports.filter((port) => port.positionMm);
  if (validPorts.length !== 2) {
    return {
      axis: null,
      evidence: 'PORT_COUNT_AMBIGUOUS',
      message: 'A deterministic tangent requires an explicit tangent or exactly two positioned host ports.',
    };
  }
  const ordered = orientPorts(validPorts);
  if (!ordered) {
    return {
      axis: null,
      evidence: 'PORT_ORIENTATION_AMBIGUOUS',
      message: 'The host axis is known but its positive direction is not source-authoritative.',
    };
  }
  const axis = normalizeOrNull(subtract(point(ordered[1].positionMm), point(ordered[0].positionMm)));
  return axis
    ? { axis, evidence: 'ORIENTED_TWO_PORT_CENTERLINE', message: '' }
    : {
      axis: null,
      evidence: 'ZERO_LENGTH_HOST',
      message: 'The host component ports do not define a nonzero tangent.',
    };
}

function orientPorts(ports) {
  const starts = ports.filter((port) => roleClass(port.role) === 'START');
  const ends = ports.filter((port) => roleClass(port.role) === 'END');
  if (starts.length === 1 && ends.length === 1) return [starts[0], ends[0]];
  return null;
}

function roleClass(value) {
  const role = stringValue(value).toUpperCase().replace(/[ -]+/g, '_');
  if (['START', 'FROM', 'INLET', 'BEGIN', 'PORT_A', 'A'].includes(role)) return 'START';
  if (['END', 'TO', 'OUTLET', 'FINISH', 'PORT_B', 'B'].includes(role)) return 'END';
  return 'UNKNOWN';
}

function addTopologyBlockers(topologyGraph, method, blockers) {
  if (method !== 'EMPIRICAL_RESTRAINT_NETWORK_V1') return;
  if (topologyGraph.summary.cycleCount > 0) {
    blockers.push(blocker(
      EMPIRICAL_FAILURE_CODES.TOPOLOGY_LOOP_PROFILE_REQUIRED,
      'topology',
      'ERROR',
      'Closed-loop topology is outside the restricted line-stop network domain.',
    ));
  }
  const branchComponents = topologyGraph.components.filter((row) => row.portKeys.length > 2);
  if (branchComponents.length > 0) {
    blockers.push(blocker(
      EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED,
      branchComponents.map((row) => row.componentKey).join(','),
      'ERROR',
      'Branch components require a qualified coupled branch profile.',
    ));
  }
}

function addCurrentMethodScopeBlockers(scenario, restraints, blockers) {
  if (scenario.profileRef.qualification !== 'QUALIFIED') {
    blockers.push(blocker(
      EMPIRICAL_FAILURE_CODES.EMPIRICAL_PROFILE_UNQUALIFIED,
      scenario.profileRef.profileId,
      'ERROR',
      'The selected empirical profile is not qualified.',
    ));
  }
  if (scenario.method !== 'EMPIRICAL_BEAM_CONTACT_V1') return;
  const vertical = scenario.coordinateFrame.verticalUnitVector;
  restraints.forEach((row) => {
    const capability = row.effectiveCapability;
    const anchor = /ANCHOR|(^|_)ANC(HOR)?($|_)/.test(capability.type);
    if (!anchor) {
      const alignment = capability.axis ? dot(capability.axis, vertical) : 0;
      if (capability.direction !== 'VERTICAL' || alignment < 1 - 1e-8) {
        blockers.push(blocker(
          EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
          row.restraintId,
          'ERROR',
          'EMPIRICAL_BEAM_CONTACT_V1 currently qualifies positive-vertical planar rests only.',
        ));
      }
    }
    if ((capability.gapMm || 0) > 0) {
      blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.CONTACT_RECONTACT_RULE_UNQUALIFIED,
        row.restraintId,
        'ERROR',
        'EMPIRICAL_BEAM_CONTACT_V1 currently qualifies zero initial gap only.',
      ));
    }
    if (capability.stiffnessNPerM !== null) {
      blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        row.restraintId,
        'ERROR',
        'EMPIRICAL_BEAM_CONTACT_V1 runtime bridge has not qualified finite support stiffness.',
      ));
    }
    if ((capability.friction || 0) > 0) {
      blockers.push(blocker(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        row.restraintId,
        'ERROR',
        'EMPIRICAL_BEAM_CONTACT_V1 currently qualifies frictionless contact only.',
      ));
    }
  });
}

function requireAdapterMethod(value) {
  if (!['EMPIRICAL_BEAM_CONTACT_V1', 'EMPIRICAL_RESTRAINT_NETWORK_V1'].includes(value)) {
    throw new TypeError(
      'The SJSON empirical piping adapter accepts beam/contact or restraint-network methods only.',
    );
  }
}

function datasetHash(dataset, sharedModel) {
  const value = dataset?.sourceSha256
    || dataset?.sourceHash
    || sharedModel.sourceSnapshotRef?.sourceByteHash
    || sharedModel.sourceSnapshotRef?.sourceSemanticHash;
  const normalized = requiredString(value, 'dataset source hash');
  return normalized.includes(':') ? normalized : `sha256:${normalized}`;
}

function firstEvidenceNumber(value) {
  const rows = Array.isArray(value)
    ? value
    : Object.values(value || {}).flatMap((row) => Array.isArray(row) ? row : []);
  for (const row of rows) {
    const number = Number(row?.value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function point(value) {
  return [value.x, value.y, value.z];
}

function normalizeOrNull(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    return null;
  }
  const length = magnitude(value);
  return length > 1e-12 ? deepFreeze(value.map((item) => item / length)) : null;
}

function normalize(value) {
  const result = normalizeOrNull(value);
  if (!result) throw new TypeError('Cannot normalize a zero vector.');
  return result;
}

function subtract(a, b) {
  return a.map((item, index) => item - b[index]);
}

function scale(vector, factor) {
  return vector.map((item) => item * factor);
}

function dot(a, b) {
  return a.reduce((sum, item, index) => sum + item * b[index], 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function magnitude(value) {
  return Math.hypot(...value);
}

function blocker(code, scope, severity, message) {
  return deepFreeze({ code, severity, scope: scope || 'request', message });
}

function uniqueBlockers(rows) {
  return [...new Map(rows.map((row) => [
    `${row.code}|${row.scope}|${row.message}`,
    row,
  ])).values()].sort((left, right) => (
    `${left.severity}|${left.code}|${left.scope}`
      .localeCompare(`${right.severity}|${right.code}|${right.scope}`)
  ));
}

function groupBy(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const bucket = map.get(row[field]) || [];
    bucket.push(row);
    bucket.sort(byField('attachmentId'));
    map.set(row[field], bucket);
  });
  return map;
}

function assertValidation(validation, label) {
  if (!validation.ok) throw new TypeError(`${label} is invalid: ${validation.errors.join(' ')}`);
}

function requireInput(value) {
  const required = [
    'dataset',
    'sharedModel',
    'topologyGraph',
    'supportAttachmentModel',
    'restraintCapabilityModel',
    'scenario',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('SJSON empirical adapter input must be an object.');
  }
  required.forEach((field) => {
    if (value[field] === undefined || value[field] === null) {
      throw new TypeError(`SJSON empirical adapter input.${field} is required.`);
    }
  });
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function byField(field) {
  return (left, right) => String(left[field]).localeCompare(String(right[field]));
}
