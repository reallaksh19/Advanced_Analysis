/**
 * Private immutable edit-operation implementation.
 *
 * Operations work on cloned stage documents and preserve descriptor and exact
 * engineering-identity authority. They do not own lifecycle or execution state.
 */
import {
  lafeaCollectionIdentityKeys,
  requireLafeaInputDescriptor,
  resolveDescriptorEntity,
} from './lafea-stage-input-descriptors.js';
import {
  classifyLafeaNumericInput,
} from './lafea-edit-command-numeric.js';
import {
  assertJsonSafe,
  classifyStoredValue,
  containsExactString,
  contractError,
  descriptorPath,
  entityError,
  getAtPath,
  isRecord,
  lafeaDocumentDigest,
  pathError,
  requireParent,
} from './lafea-edit-command-support.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export function applyLafeaEditOperation(
  currentDocument,
  command,
  descriptor,
) {
  if (command.operation === 'REPLACE_DOCUMENT') {
    return applyReplaceDocument(currentDocument, command);
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

export function requireLafeaCommandDescriptor(command) {
  const descriptor = requireLafeaInputDescriptor(
    command.stageId,
    command.descriptorId,
  );
  if (command.descriptorRevision !== descriptor.descriptorRevision) {
    throw contractError(
      'LAFEA_STALE_DESCRIPTOR_REVISION',
      `${command.descriptorId} revision is stale.`,
    );
  }
  return descriptor;
}

export function allocateLafeaEntityIdentity(
  stageId,
  documentValue,
  descriptor,
  recordValue,
) {
  requireLafeaStageRegistryEntry(stageId);
  if (descriptor.stageId !== stageId
    || descriptor.valueContract.domainType !== 'ENTITY') {
    throw contractError(
      'LAFEA_ENTITY_DESCRIPTOR_REQUIRED',
      'Entity allocation requires a matching ENTITY descriptor.',
    );
  }
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) {
    throw contractError(
      'LAFEA_COLLECTION_NOT_FOUND',
      `Missing collection ${descriptor.target.collectionPath}.`,
    );
  }
  const key = descriptor.target.identityKey;
  const prefix = descriptor.valueContract.identityPrefix;
  const existing = new Set(
    rows
      .map((row) => row?.[key])
      .filter((value) => typeof value === 'string'),
  );
  const withoutIdentity = isRecord(recordValue) ? { ...recordValue } : {};
  delete withoutIdentity[key];
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const seed = {
      stageId,
      collectionPath: descriptor.target.collectionPath,
      prefix,
      documentDigest: lafeaDocumentDigest(documentValue),
      record: withoutIdentity,
      attempt,
    };
    const suffix = lafeaDocumentDigest(seed)
      .split(':')[1]
      .slice(0, 12)
      .toUpperCase();
    const identity = `${prefix}-${suffix}`;
    if (!existing.has(identity)) return identity;
  }
  throw contractError(
    'LAFEA_IDENTITY_ALLOCATION_EXHAUSTED',
    `Could not allocate an identity for ${descriptor.target.collectionPath}.`,
  );
}

export function assertUniqueStageIdentities(stageId, documentValue) {
  const contracts = lafeaCollectionIdentityKeys(stageId);
  for (const [path, identityKey] of Object.entries(contracts)) {
    const rows = getAtPath(documentValue, path);
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      throw pathError(
        'LAFEA_COLLECTION_NOT_ARRAY',
        path,
        `${path} must be an array.`,
      );
    }
    const seen = new Set();
    rows.forEach((row, index) => {
      if (!isRecord(row)) {
        throw pathError(
          'LAFEA_ENTITY_NOT_OBJECT',
          `${path}[${index}]`,
          `${path}[${index}] must be an object.`,
        );
      }
      const identity = row[identityKey];
      if (typeof identity !== 'string' || !identity) {
        throw pathError(
          'LAFEA_ENTITY_ID_REQUIRED',
          `${path}[${index}].${identityKey}`,
          `${path}[${index}] requires ${identityKey}.`,
        );
      }
      if (seen.has(identity)) {
        const error = pathError(
          'LAFEA_IDENTITY_COLLISION',
          `${path}[${index}].${identityKey}`,
          `Duplicate ${identityKey}: ${identity}.`,
        );
        error.entityId = identity;
        throw error;
      }
      seen.add(identity);
    });
  }
  return true;
}

function applyReplaceDocument(currentDocument, command) {
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
  if (descriptor.valueContract.domainType !== 'NUMBER') {
    throw contractError(
      'LAFEA_NUMERIC_DESCRIPTOR_REQUIRED',
      `${descriptor.descriptorId} is not a numeric descriptor.`,
    );
  }
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
  const propertyParent = descriptor.target.propertyPath.length
    ? requireParent(entity, descriptor.target.propertyPath)
    : entity;
  const finalKey = descriptor.target.propertyPath.at(-1);
  let previousValue;
  let resolvedPath = descriptorPath(descriptor, command.target.entityId);

  if (descriptor.target.scalarWrapperKey) {
    const wrapper = descriptor.target.propertyPath.length
      ? propertyParent[finalKey]
      : entity;
    if (!isRecord(wrapper)) {
      throw contractError(
        'LAFEA_SCALAR_WRAPPER_REQUIRED',
        `${descriptor.descriptorId} requires a scalar wrapper.`,
      );
    }
    previousValue = wrapper[descriptor.target.scalarWrapperKey];
    if (parsedValue.state === 'MISSING') {
      delete wrapper[descriptor.target.scalarWrapperKey];
    } else {
      wrapper[descriptor.target.scalarWrapperKey] = parsedValue.value;
    }
    resolvedPath += `.${descriptor.target.scalarWrapperKey}`;
  } else {
    if (finalKey === undefined) {
      throw contractError(
        'LAFEA_SCALAR_PATH_REQUIRED',
        `${descriptor.descriptorId} has no scalar property path.`,
      );
    }
    previousValue = propertyParent[finalKey];
    if (parsedValue.state === 'MISSING') delete propertyParent[finalKey];
    else propertyParent[finalKey] = parsedValue.value;
  }

  return {
    document,
    change: {
      operation: command.operation,
      entityId: command.target.entityId,
      resolvedPath,
      previousState: classifyStoredValue(previousValue),
      currentState: parsedValue.state,
      previousValue,
      currentValue: parsedValue.value,
    },
  };
}

function applyAddEntity(currentDocument, command, descriptor) {
  requireEntityDescriptor(descriptor);
  if (!isRecord(command.input.jsonValue)) {
    throw contractError(
      'LAFEA_ENTITY_OBJECT_REQUIRED',
      'ADD_ENTITY requires a JSON object record.',
    );
  }
  assertJsonSafe(command.input.jsonValue);
  const document = structuredClone(currentDocument);
  const rows = getAtPath(document, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) {
    throw contractError(
      'LAFEA_COLLECTION_NOT_FOUND',
      `Missing collection ${descriptor.target.collectionPath}.`,
    );
  }
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
  return {
    document,
    change: {
      operation: command.operation,
      entityId: identity,
      resolvedPath: `${descriptor.target.collectionPath}[${identityKey}=${identity}]`,
      previousState: 'MISSING',
      currentState: 'PRESENT',
      previousValue: null,
      currentValue: record,
    },
  };
}

function applyDeleteEntity(currentDocument, command, descriptor) {
  requireEntityDescriptor(descriptor);
  const entityId = command.target.entityId;
  if (typeof entityId !== 'string' || !entityId) {
    throw contractError(
      'LAFEA_ENTITY_ID_REQUIRED',
      'DELETE_ENTITY requires an exact entity ID.',
    );
  }
  const document = structuredClone(currentDocument);
  const rows = getAtPath(document, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) {
    throw contractError(
      'LAFEA_COLLECTION_NOT_FOUND',
      `Missing collection ${descriptor.target.collectionPath}.`,
    );
  }
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
  return {
    document,
    change: {
      operation: command.operation,
      entityId,
      resolvedPath: `${descriptor.target.collectionPath}[${identityKey}=${entityId}]`,
      previousState: 'PRESENT',
      currentState: 'MISSING',
      previousValue: match.row,
      currentValue: null,
    },
  };
}

function requireEntityDescriptor(descriptor) {
  if (descriptor.valueContract.domainType !== 'ENTITY') {
    throw contractError(
      'LAFEA_ENTITY_DESCRIPTOR_REQUIRED',
      `${descriptor.descriptorId} is not an entity descriptor.`,
    );
  }
}
