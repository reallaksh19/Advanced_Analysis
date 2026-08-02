/**
 * Private exact-identity operations for StageEditCommand/v2.
 *
 * Identity is allocated and resolved from governed descriptor contracts, never
 * from array position.
 */
import {
  lafeaCollectionIdentityKeys,
} from './lafea-stage-input-descriptors.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  assertJsonSafe,
  containsExactString,
  contractError,
  entityError,
  getAtPath,
  isRecord,
  lafeaDocumentDigest,
  pathError,
} from './lafea-edit-command-support.js';

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

export function applyLafeaAddEntity(currentDocument, command, descriptor) {
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

export function applyLafeaDeleteEntity(currentDocument, command, descriptor) {
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
