export const LAFEA_INPUT_DESCRIPTOR_SCHEMA = 'StageInputDescriptor/v2';
export const LAFEA_INPUT_DESCRIPTOR_REVISION = '2.0.0';

export const LAFEA_VALUE_STATES = Object.freeze([
  'MISSING', 'PRESENT_NULL', 'EMPTY_TEXT', 'EXPLICIT_ZERO',
  'FINITE_NUMBER', 'INVALID_NUMBER',
]);
export const LAFEA_INPUT_DOMAIN_TYPES = Object.freeze([
  'NUMBER', 'STRING', 'BOOLEAN', 'ENTITY',
]);
export const LAFEA_INPUT_CONTROLS = Object.freeze([
  'NUMBER', 'TEXT', 'CHECKBOX', 'ENTITY',
]);
export const LAFEA_INVALIDATION_CLASSES = Object.freeze([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
]);

export const ALL_ENGINEERING_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL', 'MESH', 'EXECUTION', 'RECOVERY',
  'CONVERGENCE', 'CODE', 'REPORT',
]);
export const MODEL_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL', 'EXECUTION', 'RECOVERY',
  'CONVERGENCE', 'CODE', 'REPORT',
]);

export function scalar(descriptorId, stageId, options) {
  return createDescriptor(descriptorId, stageId, {
    ...options,
    collectionPath: null,
    identityKey: null,
  });
}

export function collectionScalar(descriptorId, stageId, options) {
  return createDescriptor(descriptorId, stageId, options);
}

export function entityDescriptor(descriptorId, stageId, options) {
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

export function vectorDescriptors(options) {
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

export function createDescriptor(descriptorId, stageId, options) {
  const domainType = options.domainType ?? 'NUMBER';
  return deepFreeze({
    schema: LAFEA_INPUT_DESCRIPTOR_SCHEMA,
    descriptorId,
    descriptorRevision: LAFEA_INPUT_DESCRIPTOR_REVISION,
    stageId,
    target: descriptorTarget(options),
    valueContract: descriptorValueContract(options, domainType),
    unitContract: descriptorUnitContract(options),
    metadataPolicy: descriptorMetadataPolicy(options),
    authority: {
      editableLayer: 'EDITABLE_SOURCE',
      sourceStatus: 'RETAINED_SOURCE',
    },
    invalidation: {
      invalidationClass: options.invalidationClass,
      descendants: Object.freeze([
        ...(options.descendants ?? ALL_ENGINEERING_DESCENDANTS),
      ]),
    },
    presentation: descriptorPresentation(options, domainType),
  });
}

export function validateDescriptor(descriptor) {
  exactKeys(descriptor, [
    'schema', 'descriptorId', 'descriptorRevision', 'stageId', 'target',
    'valueContract', 'unitContract', 'metadataPolicy', 'authority',
    'invalidation', 'presentation',
  ], descriptor.descriptorId);
  validateDescriptorRecords(descriptor);
  validateDescriptorEnums(descriptor);
  if (descriptor.target.collectionPath && !descriptor.target.identityKey) {
    throw new TypeError(`${descriptor.descriptorId} collection target requires identityKey.`);
  }
  if (descriptor.valueContract.domainType === 'ENTITY'
    && !descriptor.valueContract.identityPrefix) {
    throw new TypeError(`${descriptor.descriptorId} entity descriptor requires identityPrefix.`);
  }
  return descriptor;
}

export function getAtPath(value, path) {
  return getAtSegments(value, String(path).split('.'));
}

export function getAtSegments(value, segments) {
  return segments.reduce((current, segment) => current?.[segment], value);
}

export function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function descriptorTarget(options) {
  return {
    collectionPath: options.collectionPath ?? null,
    identityKey: options.identityKey ?? null,
    propertyPath: Object.freeze([...(options.propertyPath ?? [])]),
    scalarWrapperKey: options.scalarWrapperKey ?? null,
  };
}

function descriptorValueContract(options, domainType) {
  return {
    domainType,
    allowedStates: Object.freeze([
      ...(options.allowedStates ?? defaultStates(domainType)),
    ]),
    minimum: options.minimum ?? null,
    maximum: options.maximum ?? null,
    minimumExclusive: options.minimumExclusive === true,
    maximumExclusive: options.maximumExclusive === true,
    required: options.required !== false,
    identityPrefix: options.identityPrefix ?? null,
  };
}

function descriptorUnitContract(options) {
  return {
    dimension: options.dimension ?? null,
    unitSourcePath: Object.freeze([...(options.unitSourcePath ?? [])]),
    canonicalUnit: options.canonicalUnit ?? null,
  };
}

function descriptorMetadataPolicy(options) {
  return {
    preservedSiblingKeys: Object.freeze([
      ...(options.preservedSiblingKeys ?? [
        'unit', 'sourceRef', 'sourceReference', 'geometryAncestry',
      ]),
    ]),
    sourceRefPath: Object.freeze([...(options.sourceRefPath ?? [])]),
    geometryAncestryPath: Object.freeze([
      ...(options.geometryAncestryPath ?? []),
    ]),
  };
}

function descriptorPresentation(options, domainType) {
  return {
    label: options.label,
    helpText: options.helpText ?? '',
    groupId: options.groupId,
    control: options.control ?? controlForDomain(domainType),
    order: options.order,
  };
}

function defaultStates(domainType) {
  return domainType === 'NUMBER' ? ['EXPLICIT_ZERO', 'FINITE_NUMBER'] : [];
}

function controlForDomain(domainType) {
  if (domainType === 'NUMBER') return 'NUMBER';
  if (domainType === 'BOOLEAN') return 'CHECKBOX';
  if (domainType === 'ENTITY') return 'ENTITY';
  return 'TEXT';
}

function validateDescriptorRecords(descriptor) {
  exactKeys(descriptor.target, [
    'collectionPath', 'identityKey', 'propertyPath', 'scalarWrapperKey',
  ], `${descriptor.descriptorId}.target`);
  exactKeys(descriptor.valueContract, [
    'domainType', 'allowedStates', 'minimum', 'maximum', 'minimumExclusive',
    'maximumExclusive', 'required', 'identityPrefix',
  ], `${descriptor.descriptorId}.valueContract`);
  exactKeys(descriptor.unitContract, [
    'dimension', 'unitSourcePath', 'canonicalUnit',
  ], `${descriptor.descriptorId}.unitContract`);
  exactKeys(descriptor.metadataPolicy, [
    'preservedSiblingKeys', 'sourceRefPath', 'geometryAncestryPath',
  ], `${descriptor.descriptorId}.metadataPolicy`);
  exactKeys(descriptor.authority, [
    'editableLayer', 'sourceStatus',
  ], `${descriptor.descriptorId}.authority`);
  exactKeys(descriptor.invalidation, [
    'invalidationClass', 'descendants',
  ], `${descriptor.descriptorId}.invalidation`);
  exactKeys(descriptor.presentation, [
    'label', 'helpText', 'groupId', 'control', 'order',
  ], `${descriptor.descriptorId}.presentation`);
}

function validateDescriptorEnums(descriptor) {
  if (descriptor.schema !== LAFEA_INPUT_DESCRIPTOR_SCHEMA) {
    throw new TypeError(`${descriptor.descriptorId} schema is invalid.`);
  }
  if (!LAFEA_INPUT_DOMAIN_TYPES.includes(descriptor.valueContract.domainType)) {
    throw new TypeError(`${descriptor.descriptorId} domain type is invalid.`);
  }
  if (!LAFEA_INPUT_CONTROLS.includes(descriptor.presentation.control)) {
    throw new TypeError(`${descriptor.descriptorId} control is invalid.`);
  }
  if (!LAFEA_INVALIDATION_CLASSES.includes(
    descriptor.invalidation.invalidationClass,
  )) throw new TypeError(`${descriptor.descriptorId} invalidation class is invalid.`);
  descriptor.valueContract.allowedStates.forEach((state) => {
    if (!LAFEA_VALUE_STATES.includes(state)) {
      throw new TypeError(`${descriptor.descriptorId} value state ${state} is invalid.`);
    }
  });
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}
