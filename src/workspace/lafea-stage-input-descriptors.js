/**
 * Governed, stage-specific editable-input descriptors for the LAFEA workbench.
 *
 * These descriptors authorize a bounded editable surface. They do not discover
 * fields recursively and they do not create lifecycle, mesh, solve or code
 * authority. Unknown stage fields remain available only through the advanced
 * whole-document import/replacement boundary.
 */
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_INPUT_DESCRIPTOR_SCHEMA = 'StageInputDescriptor/v2';
export const LAFEA_INPUT_DESCRIPTOR_REVISION = '2.0.0';

export const LAFEA_VALUE_STATES = Object.freeze([
  'MISSING',
  'PRESENT_NULL',
  'EMPTY_TEXT',
  'EXPLICIT_ZERO',
  'FINITE_NUMBER',
  'INVALID_NUMBER',
]);

export const LAFEA_INPUT_DOMAIN_TYPES = Object.freeze([
  'NUMBER',
  'STRING',
  'BOOLEAN',
  'ENTITY',
]);

export const LAFEA_INPUT_CONTROLS = Object.freeze([
  'NUMBER',
  'TEXT',
  'CHECKBOX',
  'ENTITY',
]);

export const LAFEA_INVALIDATION_CLASSES = Object.freeze([
  'MATERIAL_PROPERTY',
  'GEOMETRY',
  'LOAD_OR_BC',
  'MODEL_METADATA',
]);

const ALL_ENGINEERING_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL',
  'MESH',
  'EXECUTION',
  'RECOVERY',
  'CONVERGENCE',
  'CODE',
  'REPORT',
]);

const MODEL_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL',
  'EXECUTION',
  'RECOVERY',
  'CONVERGENCE',
  'CODE',
  'REPORT',
]);

const DEFINITIONS = Object.freeze({
  'LAFEA.1': Object.freeze([
    scalar('LAFEA.1.pipe.outsideDiameter', 'LAFEA.1', {
      propertyPath: ['pipeGeometry', 'outsideDiameter'], scalarWrapperKey: 'value',
      label: 'Pipe outside diameter', groupId: 'PIPE_GEOMETRY', order: 10,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['pipeGeometry', 'outsideDiameter', 'sourceRef'],
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
      minimum: 0, minimumExclusive: true,
    }),
    scalar('LAFEA.1.thickness.nominal', 'LAFEA.1', {
      propertyPath: ['thicknessBasis', 'nominalPipeThickness'], scalarWrapperKey: 'value',
      label: 'Nominal pipe thickness', groupId: 'THICKNESS', order: 20,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['thicknessBasis', 'nominalPipeThickness', 'sourceRef'],
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
      minimum: 0, minimumExclusive: true,
    }),
    scalar('LAFEA.1.thickness.corrosionAllowance', 'LAFEA.1', {
      propertyPath: ['thicknessBasis', 'corrosionAllowance'], scalarWrapperKey: 'value',
      label: 'Corrosion allowance', groupId: 'THICKNESS', order: 30,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['thicknessBasis', 'corrosionAllowance', 'sourceRef'],
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
      minimum: 0,
    }),
    collectionScalar('LAFEA.1.pressure.internal', 'LAFEA.1', {
      collectionPath: 'pressureDefinitions', identityKey: 'identity',
      propertyPath: ['internalPressure'], scalarWrapperKey: 'value',
      label: 'Internal pressure', groupId: 'PRESSURE', order: 40,
      dimension: 'PRESSURE', unitSourcePath: ['units', 'pressure'],
      sourceRefPath: ['internalPressure', 'sourceRef'],
      invalidationClass: 'LOAD_OR_BC', descendants: MODEL_DESCENDANTS,
      minimum: 0,
    }),
    collectionScalar('LAFEA.1.pressure.external', 'LAFEA.1', {
      collectionPath: 'pressureDefinitions', identityKey: 'identity',
      propertyPath: ['externalPressure'], scalarWrapperKey: 'value',
      label: 'External pressure', groupId: 'PRESSURE', order: 50,
      dimension: 'PRESSURE', unitSourcePath: ['units', 'pressure'],
      sourceRefPath: ['externalPressure', 'sourceRef'],
      invalidationClass: 'LOAD_OR_BC', descendants: MODEL_DESCENDANTS,
      minimum: 0,
    }),
    ...vectorDescriptors({
      descriptorPrefix: 'LAFEA.1.referencePoint', stageId: 'LAFEA.1',
      collectionPath: 'loadReferencePoints', identityKey: 'identity',
      propertyPrefix: ['point', 'value'], sourceRefPath: ['point', 'sourceRef'],
      labelPrefix: 'Reference point', groupId: 'REFERENCE_POINTS', order: 100,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
  ]),

  'LAFEA.2': Object.freeze([
    collectionScalar('LAFEA.2.case.pressureFactor', 'LAFEA.2', {
      collectionPath: 'screeningCases', identityKey: 'screeningCaseId',
      propertyPath: ['pressureFactor'], label: 'Pressure factor',
      groupId: 'SCREENING_CASES', order: 10,
      dimension: 'DIMENSIONLESS', invalidationClass: 'LOAD_OR_BC',
      descendants: MODEL_DESCENDANTS,
    }),
    collectionScalar('LAFEA.2.location.angle', 'LAFEA.2', {
      collectionPath: 'evaluationLocations', identityKey: 'evaluationLocationId',
      propertyPath: ['angle'], label: 'Evaluation angle',
      groupId: 'EVALUATION_LOCATIONS', order: 20,
      dimension: 'ANGLE', canonicalUnit: 'rad',
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.2.location.explicitRadius', 'LAFEA.2', {
      collectionPath: 'evaluationLocations', identityKey: 'evaluationLocationId',
      propertyPath: ['explicitRadius'], label: 'Explicit evaluation radius',
      groupId: 'EVALUATION_LOCATIONS', order: 30,
      dimension: 'LENGTH', unitSourcePath: ['sourceEvidence', 'foundationModel', 'units', 'length'],
      allowedStates: ['PRESENT_NULL', 'EXPLICIT_ZERO', 'FINITE_NUMBER'],
      required: false, minimum: 0,
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
  ]),

  'LAFEA.3': Object.freeze([
    entityDescriptor('LAFEA.3.nodes.entity', 'LAFEA.3', {
      collectionPath: 'nodes', identityKey: 'nodeId', identityPrefix: 'N',
      label: 'Continuum node', groupId: 'NODES', order: 1,
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.3.material.elasticModulus', 'LAFEA.3', {
      collectionPath: 'materials', identityKey: 'materialId',
      propertyPath: ['elasticModulus'], label: 'Elastic modulus',
      groupId: 'MATERIALS', order: 10,
      dimension: 'MODULUS', unitSourcePath: ['units', 'modulus'],
      sourceRefPath: ['sourceReference'],
      invalidationClass: 'MATERIAL_PROPERTY', descendants: MODEL_DESCENDANTS,
      minimum: 0, minimumExclusive: true,
    }),
    collectionScalar('LAFEA.3.material.poissonRatio', 'LAFEA.3', {
      collectionPath: 'materials', identityKey: 'materialId',
      propertyPath: ['poissonRatio'], label: 'Poisson ratio',
      groupId: 'MATERIALS', order: 20,
      dimension: 'DIMENSIONLESS', sourceRefPath: ['sourceReference'],
      invalidationClass: 'MATERIAL_PROPERTY', descendants: MODEL_DESCENDANTS,
      minimum: -1, maximum: 0.5, minimumExclusive: true, maximumExclusive: true,
    }),
    collectionScalar('LAFEA.3.node.x', 'LAFEA.3', {
      collectionPath: 'nodes', identityKey: 'nodeId', propertyPath: ['x'],
      label: 'Node X', groupId: 'NODES', order: 30,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.3.node.y', 'LAFEA.3', {
      collectionPath: 'nodes', identityKey: 'nodeId', propertyPath: ['y'],
      label: 'Node Y', groupId: 'NODES', order: 40,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.3.element.thickness', 'LAFEA.3', {
      collectionPath: 'elements', identityKey: 'elementId', propertyPath: ['thickness'],
      label: 'Element thickness', groupId: 'ELEMENTS', order: 50,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS, minimum: 0, minimumExclusive: true,
    }),
    collectionScalar('LAFEA.3.constraint.value', 'LAFEA.3', {
      collectionPath: 'constraints', identityKey: 'constraintId', propertyPath: ['value'],
      label: 'Prescribed constraint value', groupId: 'BOUNDARY_CONDITIONS', order: 60,
      dimension: 'DOF_DEPENDENT', sourceRefPath: ['sourceReference'],
      invalidationClass: 'LOAD_OR_BC', descendants: MODEL_DESCENDANTS,
    }),
  ]),

  'LAFEA.4': Object.freeze([
    entityDescriptor('LAFEA.4.nodes.entity', 'LAFEA.4', {
      collectionPath: 'nodes', identityKey: 'nodeId', identityPrefix: 'N',
      label: 'Shell node', groupId: 'NODES', order: 1,
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.4.material.elasticModulus', 'LAFEA.4', {
      collectionPath: 'materials', identityKey: 'materialId',
      propertyPath: ['elasticModulus'], label: 'Elastic modulus',
      groupId: 'MATERIALS', order: 10,
      dimension: 'MODULUS', unitSourcePath: ['units', 'modulus'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'MATERIAL_PROPERTY',
      descendants: MODEL_DESCENDANTS, minimum: 0, minimumExclusive: true,
    }),
    collectionScalar('LAFEA.4.material.poissonRatio', 'LAFEA.4', {
      collectionPath: 'materials', identityKey: 'materialId',
      propertyPath: ['poissonRatio'], label: 'Poisson ratio',
      groupId: 'MATERIALS', order: 20,
      dimension: 'DIMENSIONLESS', sourceRefPath: ['sourceReference'],
      invalidationClass: 'MATERIAL_PROPERTY', descendants: MODEL_DESCENDANTS,
      minimum: -1, maximum: 0.5, minimumExclusive: true, maximumExclusive: true,
    }),
    ...vectorDescriptors({
      descriptorPrefix: 'LAFEA.4.node.position', stageId: 'LAFEA.4',
      collectionPath: 'nodes', identityKey: 'nodeId', propertyPrefix: ['position'],
      sourceRefPath: ['sourceReference'], labelPrefix: 'Node position',
      groupId: 'NODES', order: 30, dimension: 'LENGTH',
      unitSourcePath: ['units', 'length'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.4.element.thickness', 'LAFEA.4', {
      collectionPath: 'elements', identityKey: 'elementId', propertyPath: ['thickness'],
      label: 'Element thickness', groupId: 'ELEMENTS', order: 60,
      dimension: 'LENGTH', unitSourcePath: ['units', 'length'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS, minimum: 0, minimumExclusive: true,
    }),
    collectionScalar('LAFEA.4.constraint.value', 'LAFEA.4', {
      collectionPath: 'constraints', identityKey: 'constraintId', propertyPath: ['value'],
      label: 'Prescribed constraint value', groupId: 'BOUNDARY_CONDITIONS', order: 70,
      dimension: 'DOF_DEPENDENT', sourceRefPath: ['sourceReference'],
      invalidationClass: 'LOAD_OR_BC', descendants: MODEL_DESCENDANTS,
    }),
  ]),

  'LAFEA.5': Object.freeze([
    entityDescriptor('LAFEA.5.shell.nodes.entity', 'LAFEA.5', {
      collectionPath: 'shellTemplate.nodes', identityKey: 'nodeId', identityPrefix: 'N',
      label: 'Host-shell node', groupId: 'SHELL_NODES', order: 1,
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.5.shell.material.elasticModulus', 'LAFEA.5', {
      collectionPath: 'shellTemplate.materials', identityKey: 'materialId',
      propertyPath: ['elasticModulus'], label: 'Host-shell elastic modulus',
      groupId: 'SHELL_MATERIALS', order: 10,
      dimension: 'MODULUS', unitSourcePath: ['shellTemplate', 'units', 'modulus'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'MATERIAL_PROPERTY',
      descendants: MODEL_DESCENDANTS, minimum: 0, minimumExclusive: true,
    }),
    ...vectorDescriptors({
      descriptorPrefix: 'LAFEA.5.shell.node.position', stageId: 'LAFEA.5',
      collectionPath: 'shellTemplate.nodes', identityKey: 'nodeId',
      propertyPrefix: ['position'], sourceRefPath: ['sourceReference'],
      labelPrefix: 'Host-shell node position', groupId: 'SHELL_NODES', order: 20,
      dimension: 'LENGTH', unitSourcePath: ['shellTemplate', 'units', 'length'],
      invalidationClass: 'GEOMETRY', descendants: ALL_ENGINEERING_DESCENDANTS,
    }),
    collectionScalar('LAFEA.5.shell.element.thickness', 'LAFEA.5', {
      collectionPath: 'shellTemplate.elements', identityKey: 'elementId',
      propertyPath: ['thickness'], label: 'Host-shell element thickness',
      groupId: 'SHELL_ELEMENTS', order: 50,
      dimension: 'LENGTH', unitSourcePath: ['shellTemplate', 'units', 'length'],
      sourceRefPath: ['sourceReference'], invalidationClass: 'GEOMETRY',
      descendants: ALL_ENGINEERING_DESCENDANTS, minimum: 0, minimumExclusive: true,
    }),
    collectionScalar('LAFEA.5.mapping.mechanicalScaleFactor', 'LAFEA.5', {
      collectionPath: 'loadCaseMappings', identityKey: 'workflowLoadCaseId',
      propertyPath: ['mechanicalScaleFactor'], label: 'Mechanical scale factor',
      groupId: 'LOAD_CASE_MAPPINGS', order: 60,
      dimension: 'DIMENSIONLESS', sourceRefPath: ['sourceReference'],
      invalidationClass: 'LOAD_OR_BC', descendants: MODEL_DESCENDANTS,
    }),
  ]),

  'LAFEA.6': Object.freeze([]),
});

export const LAFEA_COLLECTION_IDENTITY_KEYS = deepFreeze({
  'LAFEA.1': {
    materials: 'identity',
    pressureDefinitions: 'identity',
    loadReferencePoints: 'identity',
    loadCases: 'identity',
  },
  'LAFEA.2': {
    screeningCases: 'screeningCaseId',
    evaluationLocations: 'evaluationLocationId',
  },
  'LAFEA.3': {
    materials: 'materialId',
    nodes: 'nodeId',
    elements: 'elementId',
    constraints: 'constraintId',
    loadCases: 'loadCaseId',
  },
  'LAFEA.4': {
    materials: 'materialId',
    nodes: 'nodeId',
    elements: 'elementId',
    constraints: 'constraintId',
    loadCases: 'loadCaseId',
  },
  'LAFEA.5': {
    'shellTemplate.materials': 'materialId',
    'shellTemplate.nodes': 'nodeId',
    'shellTemplate.elements': 'elementId',
    'shellTemplate.constraints': 'constraintId',
    loadCaseMappings: 'workflowLoadCaseId',
    assessmentRegions: 'regionId',
  },
  'LAFEA.6': {
    materials: 'materialId',
    nodes: 'nodeId',
    elements: 'elementId',
    loadCases: 'loadCaseId',
  },
});

for (const stageId of Object.keys(DEFINITIONS)) {
  requireLafeaStageRegistryEntry(stageId);
  DEFINITIONS[stageId].forEach(validateDescriptor);
}

/** Return the immutable descriptor catalog for one exact stage. */
export function lafeaStageInputDescriptors(stageId) {
  requireLafeaStageRegistryEntry(stageId);
  return DEFINITIONS[stageId];
}

/** Resolve one exact descriptor by stable ID. */
export function requireLafeaInputDescriptor(stageId, descriptorId) {
  const result = lafeaStageInputDescriptors(stageId)
    .find((descriptor) => descriptor.descriptorId === descriptorId);
  if (!result) throw contractError('LAFEA_INPUT_DESCRIPTOR_NOT_FOUND', `No input descriptor ${descriptorId} is registered for ${stageId}.`);
  return result;
}

/** Resolve the display unit without changing the stored engineering value. */
export function resolveLafeaDescriptorUnit(documentValue, descriptor) {
  if (descriptor.unitContract.canonicalUnit) return descriptor.unitContract.canonicalUnit;
  const value = getAtSegments(documentValue, descriptor.unitContract.unitSourcePath);
  return typeof value === 'string' ? value : null;
}

/** Resolve the retained source reference associated with the target field. */
export function resolveLafeaDescriptorSourceRef(documentValue, descriptor, entityId = null) {
  const root = resolveDescriptorEntity(documentValue, descriptor, entityId);
  const value = getAtSegments(root, descriptor.metadataPolicy.sourceRefPath);
  return typeof value === 'string' ? value : null;
}

/** Resolve the exact collection identity contract for a stage. */
export function lafeaCollectionIdentityKeys(stageId) {
  requireLafeaStageRegistryEntry(stageId);
  return LAFEA_COLLECTION_IDENTITY_KEYS[stageId];
}

/** Resolve an entity strictly by engineering identity; no array-index fallback. */
export function resolveDescriptorEntity(documentValue, descriptor, entityId = null) {
  if (!descriptor.target.collectionPath) return documentValue;
  if (typeof entityId !== 'string' || !entityId) {
    throw contractError('LAFEA_ENTITY_ID_REQUIRED', `${descriptor.descriptorId} requires an exact entity ID.`);
  }
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) throw contractError('LAFEA_COLLECTION_NOT_FOUND', `Missing collection ${descriptor.target.collectionPath}.`);
  const matches = rows.filter((row) => isRecord(row) && row[descriptor.target.identityKey] === entityId);
  if (matches.length !== 1) {
    throw contractError(
      matches.length ? 'LAFEA_IDENTITY_COLLISION' : 'LAFEA_ENTITY_NOT_FOUND',
      `${descriptor.target.collectionPath} must contain exactly one ${descriptor.target.identityKey}=${entityId}.`,
    );
  }
  return matches[0];
}

function scalar(descriptorId, stageId, options) {
  return createDescriptor(descriptorId, stageId, { ...options, collectionPath: null, identityKey: null });
}

function collectionScalar(descriptorId, stageId, options) {
  return createDescriptor(descriptorId, stageId, options);
}

function entityDescriptor(descriptorId, stageId, options) {
  return createDescriptor(descriptorId, stageId, {
    ...options,
    propertyPath: [],
    scalarWrapperKey: null,
    domainType: 'ENTITY',
    control: 'ENTITY',
    allowedStates: [],
    required: true,
  });
}

function vectorDescriptors(options) {
  return ['X', 'Y', 'Z'].map((axis, index) => collectionScalar(
    `${options.descriptorPrefix}.${axis.toLowerCase()}`,
    options.stageId,
    {
      ...options,
      propertyPath: [...options.propertyPrefix, index],
      label: `${options.labelPrefix} ${axis}`,
      order: options.order + index,
    },
  ));
}

function createDescriptor(descriptorId, stageId, options) {
  const domainType = options.domainType ?? 'NUMBER';
  const result = {
    schema: LAFEA_INPUT_DESCRIPTOR_SCHEMA,
    descriptorId,
    descriptorRevision: LAFEA_INPUT_DESCRIPTOR_REVISION,
    stageId,
    target: {
      collectionPath: options.collectionPath ?? null,
      identityKey: options.identityKey ?? null,
      propertyPath: Object.freeze([...(options.propertyPath ?? [])]),
      scalarWrapperKey: options.scalarWrapperKey ?? null,
    },
    valueContract: {
      domainType,
      allowedStates: Object.freeze([...(options.allowedStates ?? defaultStates(domainType))]),
      minimum: options.minimum ?? null,
      maximum: options.maximum ?? null,
      minimumExclusive: options.minimumExclusive === true,
      maximumExclusive: options.maximumExclusive === true,
      required: options.required !== false,
      identityPrefix: options.identityPrefix ?? null,
    },
    unitContract: {
      dimension: options.dimension ?? null,
      unitSourcePath: Object.freeze([...(options.unitSourcePath ?? [])]),
      canonicalUnit: options.canonicalUnit ?? null,
    },
    metadataPolicy: {
      preservedSiblingKeys: Object.freeze([...(options.preservedSiblingKeys ?? ['unit', 'sourceRef', 'sourceReference', 'geometryAncestry'])]),
      sourceRefPath: Object.freeze([...(options.sourceRefPath ?? [])]),
      geometryAncestryPath: Object.freeze([...(options.geometryAncestryPath ?? [])]),
    },
    authority: {
      editableLayer: 'EDITABLE_SOURCE',
      sourceStatus: 'RETAINED_SOURCE',
    },
    invalidation: {
      invalidationClass: options.invalidationClass,
      descendants: Object.freeze([...(options.descendants ?? ALL_ENGINEERING_DESCENDANTS)]),
    },
    presentation: {
      label: options.label,
      helpText: options.helpText ?? '',
      groupId: options.groupId,
      control: options.control ?? controlForDomain(domainType),
      order: options.order,
    },
  };
  return deepFreeze(result);
}

function defaultStates(domainType) {
  if (domainType === 'NUMBER') return ['EXPLICIT_ZERO', 'FINITE_NUMBER'];
  return [];
}

function controlForDomain(domainType) {
  if (domainType === 'NUMBER') return 'NUMBER';
  if (domainType === 'BOOLEAN') return 'CHECKBOX';
  if (domainType === 'ENTITY') return 'ENTITY';
  return 'TEXT';
}

function validateDescriptor(descriptor) {
  exactKeys(descriptor, [
    'schema', 'descriptorId', 'descriptorRevision', 'stageId', 'target',
    'valueContract', 'unitContract', 'metadataPolicy', 'authority',
    'invalidation', 'presentation',
  ], descriptor.descriptorId);
  exactKeys(descriptor.target, ['collectionPath', 'identityKey', 'propertyPath', 'scalarWrapperKey'], `${descriptor.descriptorId}.target`);
  exactKeys(descriptor.valueContract, [
    'domainType', 'allowedStates', 'minimum', 'maximum', 'minimumExclusive',
    'maximumExclusive', 'required', 'identityPrefix',
  ], `${descriptor.descriptorId}.valueContract`);
  exactKeys(descriptor.unitContract, ['dimension', 'unitSourcePath', 'canonicalUnit'], `${descriptor.descriptorId}.unitContract`);
  exactKeys(descriptor.metadataPolicy, ['preservedSiblingKeys', 'sourceRefPath', 'geometryAncestryPath'], `${descriptor.descriptorId}.metadataPolicy`);
  exactKeys(descriptor.authority, ['editableLayer', 'sourceStatus'], `${descriptor.descriptorId}.authority`);
  exactKeys(descriptor.invalidation, ['invalidationClass', 'descendants'], `${descriptor.descriptorId}.invalidation`);
  exactKeys(descriptor.presentation, ['label', 'helpText', 'groupId', 'control', 'order'], `${descriptor.descriptorId}.presentation`);
  if (descriptor.schema !== LAFEA_INPUT_DESCRIPTOR_SCHEMA) throw new TypeError(`${descriptor.descriptorId} schema is invalid.`);
  if (!LAFEA_INPUT_DOMAIN_TYPES.includes(descriptor.valueContract.domainType)) throw new TypeError(`${descriptor.descriptorId} domain type is invalid.`);
  if (!LAFEA_INPUT_CONTROLS.includes(descriptor.presentation.control)) throw new TypeError(`${descriptor.descriptorId} control is invalid.`);
  if (!LAFEA_INVALIDATION_CLASSES.includes(descriptor.invalidation.invalidationClass)) throw new TypeError(`${descriptor.descriptorId} invalidation class is invalid.`);
  descriptor.valueContract.allowedStates.forEach((state) => {
    if (!LAFEA_VALUE_STATES.includes(state)) throw new TypeError(`${descriptor.descriptorId} value state ${state} is invalid.`);
  });
  if (descriptor.target.collectionPath && !descriptor.target.identityKey) throw new TypeError(`${descriptor.descriptorId} collection target requires identityKey.`);
  if (descriptor.valueContract.domainType === 'ENTITY' && !descriptor.valueContract.identityPrefix) {
    throw new TypeError(`${descriptor.descriptorId} entity descriptor requires identityPrefix.`);
  }
  return descriptor;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function getAtPath(value, path) {
  return getAtSegments(value, String(path).split('.'));
}

function getAtSegments(value, segments) {
  return segments.reduce((current, segment) => current?.[segment], value);
}

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
