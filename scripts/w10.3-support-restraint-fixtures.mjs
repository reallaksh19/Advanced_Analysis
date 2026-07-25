import { createSharedPipingModel } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';

export function evidence(value, unit = '', sourcePath = 'sourceAttributes.VALUE') {
  return { value, unit, sourceKind: sourcePath.split('.')[0], sourcePath };
}

export function point(x, y = 0, z = 0) {
  return { x, y, z };
}

export function pipeComponent(key, start, end, options = {}) {
  const identity = options.identity || {};
  const sourcePath = options.sourcePath || `/model/pipes/${key}`;
  return {
    componentKey: key,
    sourceEntityId: options.sourceEntityId || key,
    name: key,
    type: options.type || 'PIPE',
    identity: normalizedIdentity(identity),
    geometry: {
      start,
      end,
      center: options.center || null,
      points: [],
      branchPoints: [],
      sources: {},
      sourcePath,
      ports: [
        componentPort(key, 'start', start, options.startReference),
        componentPort(key, 'end', end, options.endReference),
      ],
    },
    engineeringProperties: {},
    compatibilityEvidence: {},
    sourceReferences: sourceReferences(key, sourcePath, options),
    diagnostics: [],
  };
}

export function multiPortComponent(key, positions, options = {}) {
  const sourcePath = options.sourcePath || `/model/fittings/${key}`;
  return {
    componentKey: key,
    sourceEntityId: options.sourceEntityId || key,
    name: key,
    type: options.type || 'TEE',
    identity: normalizedIdentity(options.identity || {}),
    geometry: {
      start: null,
      end: null,
      center: options.center || null,
      points: [],
      branchPoints: positions,
      sources: {},
      sourcePath,
      ports: positions.map((position, index) => (
        componentPort(key, `branch-${index + 1}`, position, options.references?.[index])
      )),
    },
    engineeringProperties: {},
    compatibilityEvidence: {},
    sourceReferences: sourceReferences(key, sourcePath, options),
    diagnostics: [],
  };
}

export function supportRecord(key, position, options = {}) {
  const sourcePath = options.sourcePath || `/model/supports/${key}`;
  return {
    supportKey: key,
    sourceEntityId: options.sourceEntityId || key,
    name: key,
    type: options.sourceType || 'SUPPORT',
    identity: normalizedIdentity(options.identity || {}),
    position,
    engineeringProperties: {},
    compatibilityEvidence: {},
    supportEvidence: options.supportEvidence || {},
    sourceReferences: sourceReferences(key, sourcePath, options),
    diagnostics: [],
  };
}

export function supportEvidence(input = {}) {
  return {
    attachedPortReferences: listEvidence(input.portReferences),
    attachedComponentReferences: listEvidence(input.componentReferences),
    supportedSourceEntityReferences: listEvidence(input.entityReferences),
    supportTypes: listEvidence(input.supportTypes),
    verticalCapabilities: listEvidence(input.vertical),
    lateralCapabilities: listEvidence(input.lateral),
    longitudinalCapabilities: listEvidence(input.longitudinal),
    rotationalCapabilities: listEvidence(input.rotational),
    verticalGaps: numericEvidence(input.verticalGaps, 'mm', 'sourceAttributes.VERTICAL_GAP_MM'),
    lateralGaps: numericEvidence(input.lateralGaps, 'mm', 'sourceAttributes.LATERAL_GAP_MM'),
    longitudinalGaps: numericEvidence(input.longitudinalGaps, 'mm', 'sourceAttributes.LONGITUDINAL_GAP_MM'),
    stiffnessValues: numericEvidence(input.stiffness, 'N/mm', 'sourceAttributes.STIFFNESS_N_PER_MM'),
    springRateValues: numericEvidence(input.springRate, 'N/mm', 'sourceAttributes.SPRING_RATE_N_PER_MM'),
    frictionValues: numericEvidence(input.friction, '', 'sourceAttributes.FRICTION_COEFFICIENT'),
    multiAttachmentFlags: listEvidence(input.multiAttachment),
  };
}

export function sharedFixture(options = {}) {
  const datasetId = options.datasetId || 'W10.3-FIXTURE';
  return createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: 'w10.3-fixture.json' },
    units: { length: options.unit || 'mm', force: 'unknown', mass: 'unknown' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId,
      sourceSchema: 'w10.3-fixture/v1',
      sourceSemanticHash: 'fnv1a64:0000000000000003',
      sourceByteHash: null,
    },
    components: options.components || [],
    supports: options.supports || [],
    sourceReferences: { nodes: options.nodes || [] },
    diagnostics: [],
  });
}

export function exactTopology(sharedModel) {
  return buildPipingPortTopologyGraph(sharedModel);
}

export function sourceNode(key, parentSourceNodeKey = null, sourcePath = '') {
  return {
    sourceNodeKey: key,
    sourceEntityId: key,
    jsonPointer: `/${key}`,
    parentSourceNodeKey,
    childSourceNodeKeys: [],
    childIndex: 0,
    depth: parentSourceNodeKey ? 1 : 0,
    type: 'OBJECT',
    name: key,
    sourcePath,
    lineId: '',
    branchId: '',
    systemId: '',
    zoneId: '',
  };
}

function componentPort(componentKey, role, position, reference = {}) {
  return {
    portKey: `${componentKey}:port:${role}`,
    role,
    position,
    sourceReference: {
      sourceNodeId: reference.sourceNodeId || `${componentKey}:${role}`,
      ...reference,
    },
  };
}

function sourceReferences(key, sourcePath, options) {
  return {
    sourceNodeKey: options.sourceNodeKey || `node:${key}`,
    sourceEntityId: options.sourceEntityId || key,
    jsonPointer: options.jsonPointer || `/${key}`,
    sourcePath,
  };
}

function normalizedIdentity(identity) {
  return {
    lineId: identity.lineId || '',
    branchId: identity.branchId || '',
    systemId: identity.systemId || '',
    zoneId: identity.zoneId || '',
  };
}

function listEvidence(values) {
  const rows = Array.isArray(values) ? values : values === undefined ? [] : [values];
  return rows.map((value, index) => evidence(
    value,
    '',
    `sourceAttributes.VALUE_${index}`,
  ));
}

function numericEvidence(values, unit, sourcePath) {
  const rows = Array.isArray(values) ? values : values === undefined ? [] : [values];
  return rows.map((value, index) => evidence(value, unit, `${sourcePath}_${index}`));
}
