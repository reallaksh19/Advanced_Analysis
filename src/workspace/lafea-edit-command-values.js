import {
  LAFEA_VALUE_STATES,
  lafeaCollectionIdentityKeys,
} from './lafea-stage-input-descriptors.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  contractError,
  deepFreeze,
  exactKeys,
  getAtPath,
  isRecord,
  lafeaDocumentDigest,
  pathError,
} from './lafea-edit-command-support.js';

const INPUT_KEYS = Object.freeze([
  'presence', 'encoding', 'rawText', 'jsonValue',
]);
const DECIMAL_GRAMMAR = /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;

export { lafeaDocumentDigest };

export function classifyLafeaNumericInput(input, descriptor) {
  exactKeys(input, INPUT_KEYS, 'StageEditCommand/v2.input');
  if (input.presence === 'DELETE') return parsed('MISSING', null, null, null);
  if (input.presence !== 'PRESENT') {
    return parsed('INVALID_NUMBER', null, null, 'INVALID_PRESENCE');
  }
  if (input.encoding === 'JSON') return classifyJsonInput(input, descriptor);
  if (input.encoding !== 'TEXT' || typeof input.rawText !== 'string') {
    return parsed('INVALID_NUMBER', null, null, 'TEXT_INPUT_REQUIRED');
  }
  return classifyTextInput(input.rawText, descriptor);
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
  return allocateIdentity(stageId, documentValue, descriptor, recordValue, rows);
}

export function assertUniqueStageIdentities(stageId, documentValue) {
  const contracts = lafeaCollectionIdentityKeys(stageId);
  for (const [path, identityKey] of Object.entries(contracts)) {
    assertCollectionIdentities(documentValue, path, identityKey);
  }
  return true;
}

function classifyJsonInput(input, descriptor) {
  if (input.jsonValue === null) return parsed('PRESENT_NULL', null, 'null', null);
  if (typeof input.jsonValue !== 'number' || !Number.isFinite(input.jsonValue)) {
    return parsed('INVALID_NUMBER', null, null, 'JSON_VALUE_NOT_FINITE_NUMBER');
  }
  return boundedNumeric(input.jsonValue, JSON.stringify(input.jsonValue), descriptor);
}

function classifyTextInput(rawText, descriptor) {
  const trimmed = rawText.trim();
  if (!trimmed) return parsed('EMPTY_TEXT', null, rawText, null);
  if (!DECIMAL_GRAMMAR.test(trimmed)) {
    return parsed('INVALID_NUMBER', null, rawText, 'INVALID_DECIMAL_LEXEME');
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return parsed('INVALID_NUMBER', null, rawText, 'NUMBER_OUT_OF_RANGE');
  }
  return boundedNumeric(value, rawText, descriptor);
}

function boundedNumeric(value, rawLexeme, descriptor) {
  const normalized = Object.is(value, -0) ? 0 : value;
  const contract = descriptor.valueContract;
  if (contract.minimum !== null) {
    const invalid = contract.minimumExclusive
      ? normalized <= contract.minimum
      : normalized < contract.minimum;
    if (invalid) {
      return parsed('INVALID_NUMBER', null, rawLexeme, 'NUMBER_BELOW_MINIMUM');
    }
  }
  if (contract.maximum !== null) {
    const invalid = contract.maximumExclusive
      ? normalized >= contract.maximum
      : normalized > contract.maximum;
    if (invalid) {
      return parsed('INVALID_NUMBER', null, rawLexeme, 'NUMBER_ABOVE_MAXIMUM');
    }
  }
  return parsed(
    normalized === 0 ? 'EXPLICIT_ZERO' : 'FINITE_NUMBER',
    normalized,
    rawLexeme,
    null,
  );
}

function parsed(state, value, rawLexeme, diagnosticCode) {
  if (!LAFEA_VALUE_STATES.includes(state)) {
    throw new TypeError(`Unknown value state: ${state}.`);
  }
  return deepFreeze({ state, value, rawLexeme, diagnostic: diagnosticCode });
}

function allocateIdentity(stageId, documentValue, descriptor, recordValue, rows) {
  const key = descriptor.target.identityKey;
  const prefix = descriptor.valueContract.identityPrefix;
  const existing = new Set(
    rows.map((row) => row?.[key]).filter((value) => typeof value === 'string'),
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
    const suffix = lafeaDocumentDigest(seed).split(':')[1]
      .slice(0, 12).toUpperCase();
    const identity = `${prefix}-${suffix}`;
    if (!existing.has(identity)) return identity;
  }
  throw contractError(
    'LAFEA_IDENTITY_ALLOCATION_EXHAUSTED',
    `Could not allocate an identity for ${descriptor.target.collectionPath}.`,
  );
}

function assertCollectionIdentities(documentValue, path, identityKey) {
  const rows = getAtPath(documentValue, path);
  if (rows === undefined) return;
  if (!Array.isArray(rows)) {
    throw pathError('LAFEA_COLLECTION_NOT_ARRAY', path, `${path} must be an array.`);
  }
  const seen = new Set();
  rows.forEach((row, index) => {
    const identity = requireEntityIdentity(row, path, identityKey, index);
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

function requireEntityIdentity(row, path, identityKey, index) {
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
  return identity;
}
