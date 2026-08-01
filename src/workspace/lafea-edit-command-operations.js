import { resolveDescriptorEntity } from './lafea-stage-input-descriptors.js';
import {
  assertJsonSafe,
  classifyStoredValue,
  containsExactString,
  contractError,
  descriptorPath,
  entityError,
  getAtPath,
  isRecord,
  requireParent,
} from './lafea-edit-command-support.js';
import {
  allocateLafeaEntityIdentity,
  assertUniqueStageIdentities,
  classifyLafeaNumericInput,
} from './lafea-edit-command-values.js';

export function applyLafeaEditOperation(currentDocument, command, descriptor) {
  if (command.operation === 'REPLACE_DOCUMENT') {
    return replaceDocument(currentDocument, command);
  }
  if (command.operation === 'SET_SCALAR'
    || command.operation === 'DELETE_FIELD') {
    return applyScalar(currentDocument, command, descriptor);
  }
  if (command.operation === 'ADD_ENTITY') {
    return applyAddEntity(currentDocument, command, descriptor);
  }
  if (command.operation === 'DELETE_ENTITY') {
    return applyDeleteEntity(currentDocument, command, descriptor);
  }
  throw contractError(
    'LAFEA_EDIT_OPERATION_UNSUPPORTED',
    `Unsupported edit operation: ${command.operation}.`,
  );
}

function replaceDocument(currentDocument, command) {
  if (!isRecord(command.input.jsonValue)) {
    throw contractError(
      'LAFEA_DOCUMENT_OBJECT_REQUIRED',
      'Whole-document replacement requires a JSON object.',
    );
  }
  assertJsonSafe(command.input.jsonValue);
  assertUniqueStageIdentities(command.stageId, command.input.jsonValue);
  return {
    document: structuredClone(command.input.jsonValue),
    change: {
      operation: command.operation,
      entityId: null,
      resolvedPath: 'document',
      previousState: 'PRESENT',
      currentState: 'PRESENT',
      previousValue: currentDocument,
      currentValue: command.input.jsonValue,
    },
  };
}

function applyScalar(currentDocument, command, descriptor) {
  requireDomain(descriptor, 'NUMBER', 'LAFEA_NUMERIC_DESCRIPTOR_REQUIRED');
  const parsedValue = classifyLafeaNumericInput(command.input, descriptor);
  if (!descriptor.valueContract.allowedStates.includes(parsedValue.state)) {
    throw contractError(
      parsedValue.diagnostic ?? 'LAFEA_VALUE_STATE_NOT_ALLOWED',
      `${descriptor.descriptorId} does not allow ${parsedValue.state}.`,
    );
  }
  const document = structuredClone(currentDocument);
  const entity = resolveDescriptorEntity(
    document,
    descriptor,
    command.target.entityId,
  );
  return updateScalar(document, entity, command, descriptor, parsedValue);
}

function updateScalar(document, entity, command, descriptor, parsedValue) {
  const parent = descriptor.target.propertyPath.length
    ? requireParent(entity, descriptor.target.propertyPath)
    : entity;
  const finalKey = descriptor.target.propertyPath.at(-1);
  const entityId = command.target.entityId;
  const updated = descriptor.target.scalarWrapperKey
    ? updateWrappedScalar(
      parent,
      entity,
      finalKey,
      descriptor,
      entityId,
      parsedValue,
    )
    : updateDirectScalar(parent, finalKey, descriptor, entityId, parsedValue);
  return {
    document,
    change: {
      operation: command.operation,
      entityId,
      resolvedPath: updated.resolvedPath,
      previousState: classifyStoredValue(updated.previousValue),
      currentState: parsedValue.state,
      previousValue: updated.previousValue,
      currentValue: parsedValue.value,
    },
  };
}

function updateWrappedScalar(
  parent,
  entity,
  finalKey,
  descriptor,
  entityId,
  parsedValue,
) {
  const wrapper = descriptor.target.propertyPath.length ? parent[finalKey] : entity;
  if (!isRecord(wrapper)) {
    throw contractError(
      'LAFEA_SCALAR_WRAPPER_REQUIRED',
      `${descriptor.descriptorId} requires a scalar wrapper.`,
    );
  }
  const key = descriptor.target.scalarWrapperKey;
  const previousValue = wrapper[key];
  if (parsedValue.state === 'MISSING') delete wrapper[key];
  else wrapper[key] = parsedValue.value;
  return {
    previousValue,
    resolvedPath: `${descriptorPath(descriptor, entityId)}.${key}`,
  };
}

function updateDirectScalar(parent, finalKey, descriptor, entityId, parsedValue) {
  if (finalKey === undefined) {
    throw contractError(
      'LAFEA_SCALAR_PATH_REQUIRED',
      `${descriptor.descriptorId} has no scalar property path.`,
    );
  }
  const previousValue = parent[finalKey];
  if (parsedValue.state === 'MISSING') delete parent[finalKey];
  else parent[finalKey] = parsedValue.value;
  return {
    previousValue,
    resolvedPath: descriptorPath(descriptor, entityId),
  };
}

function applyAddEntity(currentDocument, command, descriptor) {
  requireDomain(descriptor, 'ENTITY', 'LAFEA_ENTITY_DESCRIPTOR_REQUIRED');
  if (!isRecord(command.input.jsonValue)) {
    throw contractError(
      'LAFEA_ENTITY_OBJECT_REQUIRED',
      'ADD_ENTITY requires a JSON object record.',
    );
  }
  assertJsonSafe(command.input.jsonValue);
  const document = structuredClone(currentDocument);
  const rows = requireCollection(document, descriptor);
  const record = structuredClone(command.input.jsonValue);
  const identityKey = descriptor.target.identityKey;
  if (Object.hasOwn(record, identityKey)) {
    throw contractError(
      'LAFEA_ADD_ENTITY_ID_FORBIDDEN',
      `ADD_ENTITY allocates ${identityKey}; imported identities require whole-document replacement.`,
    );
  }
  const identity = allocateLafeaEntityIdentity(
    command.stageId,
    document,
    descriptor,
    record,
  );
  if (rows.some((row) => row?.[identityKey] === identity)) {
    throw entityError(
      'LAFEA_IDENTITY_COLLISION',
      identity,
      `Duplicate ${identityKey}: ${identity}.`,
    );
  }
  record[identityKey] = identity;
  rows.push(record);
  return entityChange(document, command.operation, descriptor, identity, null, record);
}

function applyDeleteEntity(currentDocument, command, descriptor) {
  requireDomain(descriptor, 'ENTITY', 'LAFEA_ENTITY_DESCRIPTOR_REQUIRED');
  const entityId = command.target.entityId;
  if (typeof entityId !== 'string' || !entityId) {
    throw contractError(
      'LAFEA_ENTITY_ID_REQUIRED',
      'DELETE_ENTITY requires an exact entity ID.',
    );
  }
  const document = structuredClone(currentDocument);
  const rows = requireCollection(document, descriptor);
  const identityKey = descriptor.target.identityKey;
  const matches = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row?.[identityKey] === entityId);
  if (matches.length !== 1) {
    throw entityError(
      matches.length ? 'LAFEA_IDENTITY_COLLISION' : 'LAFEA_ENTITY_NOT_FOUND',
      entityId,
      `Expected exactly one ${identityKey}=${entityId}.`,
    );
  }
  const [match] = matches;
  rows.splice(match.index, 1);
  if (containsExactString(document, entityId)) {
    throw entityError(
      'LAFEA_REFERENTIAL_INTEGRITY',
      entityId,
      `${entityId} is still referenced after proposed deletion.`,
    );
  }
  return entityChange(
    document,
    command.operation,
    descriptor,
    entityId,
    match.row,
    null,
  );
}

function entityChange(document, operation, descriptor, entityId, previousValue, currentValue) {
  const identityKey = descriptor.target.identityKey;
  return {
    document,
    change: {
      operation,
      entityId,
      resolvedPath: `${descriptor.target.collectionPath}[${identityKey}=${entityId}]`,
      previousState: previousValue === null ? 'MISSING' : 'PRESENT',
      currentState: currentValue === null ? 'MISSING' : 'PRESENT',
      previousValue,
      currentValue,
    },
  };
}

function requireCollection(document, descriptor) {
  const rows = getAtPath(document, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) {
    throw contractError(
      'LAFEA_COLLECTION_NOT_FOUND',
      `Missing collection ${descriptor.target.collectionPath}.`,
    );
  }
  return rows;
}

function requireDomain(descriptor, expected, code) {
  if (descriptor.valueContract.domainType === expected) return;
  const kind = expected === 'NUMBER' ? 'numeric' : 'entity';
  throw contractError(code, `${descriptor.descriptorId} is not a ${kind} descriptor.`);
}
