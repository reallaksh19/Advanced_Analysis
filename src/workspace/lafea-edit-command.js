/**
 * Immutable command gateway for governed LAFEA source edits.
 *
 * This module owns strict lexical parsing, stale-document conflict detection,
 * exact identity resolution and whole-document replacement. It does not own the
 * U3 lifecycle state machine; dependencyImpact is an invalidation declaration
 * for later lifecycle consumption.
 */
import { normalizeLafeaStageEdit } from './lafea-workbench-model.js';
import {
  LAFEA_INPUT_DESCRIPTOR_REVISION,
  LAFEA_VALUE_STATES,
  lafeaCollectionIdentityKeys,
  requireLafeaInputDescriptor,
  resolveDescriptorEntity,
} from './lafea-stage-input-descriptors.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_EDIT_COMMAND_SCHEMA = 'StageEditCommand/v2';
export const LAFEA_EDIT_RESULT_SCHEMA = 'StageEditResult/v2';

export const LAFEA_EDIT_OPERATIONS = Object.freeze([
  'SET_SCALAR',
  'DELETE_FIELD',
  'ADD_ENTITY',
  'DELETE_ENTITY',
  'REPLACE_DOCUMENT',
]);

export const LAFEA_EDIT_STATUSES = Object.freeze([
  'APPLIED',
  'REJECTED',
  'CONFLICT',
  'NO_CHANGE',
]);

const COMMAND_KEYS = Object.freeze([
  'schema', 'commandId', 'stageId', 'descriptorId', 'descriptorRevision',
  'operation', 'expectedDocumentDigest', 'target', 'input', 'origin',
]);
const TARGET_KEYS = Object.freeze(['entityId']);
const INPUT_KEYS = Object.freeze(['presence', 'encoding', 'rawText', 'jsonValue']);
const ORIGIN_KEYS = Object.freeze(['surface', 'sessionId', 'sequence']);
const DECIMAL_GRAMMAR = /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;
const REPLACE_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL', 'MESH', 'EXECUTION', 'RECOVERY',
  'CONVERGENCE', 'CODE', 'REPORT',
]);

/** Apply one exact command against the current frozen stage document. */
export function applyLafeaStageEditCommand(currentDocument, command) {
  const previousDocumentDigest = safeDigest(currentDocument);
  try {
    validateCommand(command);
    requireLafeaStageRegistryEntry(command.stageId);
    if (previousDocumentDigest !== command.expectedDocumentDigest) {
      return result({
        command,
        status: 'CONFLICT',
        previousDocumentDigest,
        currentDocumentDigest: previousDocumentDigest,
        document: currentDocument,
        change: emptyChange(command.operation, command.target.entityId),
        dependencyImpact: [],
        diagnostics: [diagnostic(
          'ERROR', 'LAFEA_STALE_DOCUMENT_DIGEST', 'document', command.target.entityId,
          'The editable document changed after this command was created.',
        )],
        descriptor: null,
      });
    }

    assertUniqueStageIdentities(command.stageId, currentDocument);
    const descriptor = command.operation === 'REPLACE_DOCUMENT'
      ? null
      : requireCommandDescriptor(command);
    const applied = applyOperation(currentDocument, command, descriptor);
    const normalized = normalizeLafeaStageEdit(command.stageId, applied.document);
    assertUniqueStageIdentities(command.stageId, normalized);
    const currentDocumentDigest = lafeaDocumentDigest(normalized);
    const status = currentDocumentDigest === previousDocumentDigest ? 'NO_CHANGE' : 'APPLIED';
    return result({
      command,
      status,
      previousDocumentDigest,
      currentDocumentDigest,
      document: normalized,
      change: applied.change,
      dependencyImpact: descriptor?.invalidation.descendants ?? REPLACE_DESCENDANTS,
      diagnostics: [],
      descriptor,
    });
  } catch (error) {
    return result({
      command: sanitizeCommand(command),
      status: 'REJECTED',
      previousDocumentDigest,
      currentDocumentDigest: previousDocumentDigest,
      document: currentDocument,
      change: emptyChange(command?.operation ?? null, command?.target?.entityId ?? null),
      dependencyImpact: [],
      diagnostics: [diagnostic(
        'ERROR',
        typeof error?.code === 'string' ? error.code : 'LAFEA_EDIT_COMMAND_REJECTED',
        typeof error?.path === 'string' ? error.path : 'document',
        typeof error?.entityId === 'string' ? error.entityId : command?.target?.entityId ?? null,
        error instanceof Error ? error.message : 'Unknown LAFEA edit-command failure.',
      )],
      descriptor: null,
    });
  }
}

/** Strictly classify and parse a numeric command input. */
export function classifyLafeaNumericInput(input, descriptor) {
  exactKeys(input, INPUT_KEYS, 'StageEditCommand/v2.input');
  if (input.presence === 'DELETE') return parsed('MISSING', null, null, null);
  if (input.presence !== 'PRESENT') return parsed('INVALID_NUMBER', null, null, 'INVALID_PRESENCE');

  if (input.encoding === 'JSON') {
    if (input.jsonValue === null) return parsed('PRESENT_NULL', null, 'null', null);
    if (typeof input.jsonValue !== 'number' || !Number.isFinite(input.jsonValue)) {
      return parsed('INVALID_NUMBER', null, null, 'JSON_VALUE_NOT_FINITE_NUMBER');
    }
    return boundedNumeric(input.jsonValue, JSON.stringify(input.jsonValue), descriptor);
  }

  if (input.encoding !== 'TEXT' || typeof input.rawText !== 'string') {
    return parsed('INVALID_NUMBER', null, null, 'TEXT_INPUT_REQUIRED');
  }
  const trimmed = input.rawText.trim();
  if (!trimmed) return parsed('EMPTY_TEXT', null, input.rawText, null);
  if (!DECIMAL_GRAMMAR.test(trimmed)) {
    return parsed('INVALID_NUMBER', null, input.rawText, 'INVALID_DECIMAL_LEXEME');
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return parsed('INVALID_NUMBER', null, input.rawText, 'NUMBER_OUT_OF_RANGE');
  }
  return boundedNumeric(value, input.rawText, descriptor);
}

/** Deterministic, array-index-independent identity allocation. */
export function allocateLafeaEntityIdentity(stageId, documentValue, descriptor, recordValue) {
  requireLafeaStageRegistryEntry(stageId);
  if (descriptor.stageId !== stageId || descriptor.valueContract.domainType !== 'ENTITY') {
    throw contractError('LAFEA_ENTITY_DESCRIPTOR_REQUIRED', 'Entity allocation requires a matching ENTITY descriptor.');
  }
  const rows = getAtPath(documentValue, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) throw contractError('LAFEA_COLLECTION_NOT_FOUND', `Missing collection ${descriptor.target.collectionPath}.`);
  const key = descriptor.target.identityKey;
  const prefix = descriptor.valueContract.identityPrefix;
  const existing = new Set(rows.map((row) => row?.[key]).filter((value) => typeof value === 'string'));
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
    const suffix = lafeaDocumentDigest(seed).split(':')[1].slice(0, 12).toUpperCase();
    const identity = `${prefix}-${suffix}`;
    if (!existing.has(identity)) return identity;
  }
  throw contractError('LAFEA_IDENTITY_ALLOCATION_EXHAUSTED', `Could not allocate an identity for ${descriptor.target.collectionPath}.`);
}

/** Verify exact engineering identity uniqueness in every governed collection. */
export function assertUniqueStageIdentities(stageId, documentValue) {
  const contracts = lafeaCollectionIdentityKeys(stageId);
  for (const [path, identityKey] of Object.entries(contracts)) {
    const rows = getAtPath(documentValue, path);
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw pathError('LAFEA_COLLECTION_NOT_ARRAY', path, `${path} must be an array.`);
    const seen = new Set();
    rows.forEach((row, index) => {
      if (!isRecord(row)) throw pathError('LAFEA_ENTITY_NOT_OBJECT', `${path}[${index}]`, `${path}[${index}] must be an object.`);
      const identity = row[identityKey];
      if (typeof identity !== 'string' || !identity) {
        throw pathError('LAFEA_ENTITY_ID_REQUIRED', `${path}[${index}].${identityKey}`, `${path}[${index}] requires ${identityKey}.`);
      }
      if (seen.has(identity)) {
        const error = pathError('LAFEA_IDENTITY_COLLISION', `${path}[${index}].${identityKey}`, `Duplicate ${identityKey}: ${identity}.`);
        error.entityId = identity;
        throw error;
      }
      seen.add(identity);
    });
  }
  return true;
}

/** Stable document-revision digest for edit conflicts; not a U3 lifecycle hash. */
export function lafeaDocumentDigest(value) {
  const text = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function createLafeaSetScalarCommand(options) {
  return command({
    ...options,
    operation: 'SET_SCALAR',
    descriptorRevision: options.descriptorRevision ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    input: {
      presence: 'PRESENT', encoding: 'TEXT', rawText: options.rawText, jsonValue: null,
    },
  });
}

export function createLafeaReplaceDocumentCommand(options) {
  return command({
    ...options,
    descriptorId: null,
    descriptorRevision: null,
    operation: 'REPLACE_DOCUMENT',
    entityId: null,
    input: {
      presence: 'PRESENT', encoding: 'JSON', rawText: null,
      jsonValue: structuredClone(options.documentValue),
    },
  });
}

export function createLafeaAddEntityCommand(options) {
  return command({
    ...options,
    operation: 'ADD_ENTITY',
    descriptorRevision: options.descriptorRevision ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    entityId: null,
    input: {
      presence: 'PRESENT', encoding: 'JSON', rawText: null,
      jsonValue: structuredClone(options.recordValue),
    },
  });
}

export function createLafeaDeleteEntityCommand(options) {
  return command({
    ...options,
    operation: 'DELETE_ENTITY',
    descriptorRevision: options.descriptorRevision ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    input: { presence: 'DELETE', encoding: 'JSON', rawText: null, jsonValue: null },
  });
}

function command(options) {
  const value = {
    schema: LAFEA_EDIT_COMMAND_SCHEMA,
    commandId: options.commandId,
    stageId: options.stageId,
    descriptorId: options.descriptorId,
    descriptorRevision: options.descriptorRevision,
    operation: options.operation,
    expectedDocumentDigest: options.expectedDocumentDigest,
    target: { entityId: options.entityId ?? null },
    input: options.input,
    origin: {
      surface: options.origin?.surface ?? 'PROGRAMMATIC',
      sessionId: options.origin?.sessionId ?? 'UNSPECIFIED_SESSION',
      sequence: options.origin?.sequence ?? 0,
    },
  };
  validateCommand(value);
  return deepFreeze(value);
}

function applyOperation(currentDocument, command, descriptor) {
  if (command.operation === 'REPLACE_DOCUMENT') {
    if (!isRecord(command.input.jsonValue)) throw contractError('LAFEA_DOCUMENT_OBJECT_REQUIRED', 'Whole-document replacement requires a JSON object.');
    assertJsonSafe(command.input.jsonValue);
    assertUniqueStageIdentities(command.stageId, command.input.jsonValue);
    return {
      document: structuredClone(command.input.jsonValue),
      change: {
        operation: command.operation, entityId: null, resolvedPath: 'document',
        previousState: 'PRESENT', currentState: 'PRESENT',
        previousValue: currentDocument, currentValue: command.input.jsonValue,
      },
    };
  }
  if (command.operation === 'SET_SCALAR' || command.operation === 'DELETE_FIELD') {
    return applyScalar(currentDocument, command, descriptor);
  }
  if (command.operation === 'ADD_ENTITY') return applyAddEntity(currentDocument, command, descriptor);
  if (command.operation === 'DELETE_ENTITY') return applyDeleteEntity(currentDocument, command, descriptor);
  throw contractError('LAFEA_EDIT_OPERATION_UNSUPPORTED', `Unsupported edit operation: ${command.operation}.`);
}

function applyScalar(currentDocument, command, descriptor) {
  if (descriptor.valueContract.domainType !== 'NUMBER') {
    throw contractError('LAFEA_NUMERIC_DESCRIPTOR_REQUIRED', `${descriptor.descriptorId} is not a numeric descriptor.`);
  }
  const parsedValue = classifyLafeaNumericInput(command.input, descriptor);
  if (!descriptor.valueContract.allowedStates.includes(parsedValue.state)) {
    throw contractError(
      parsedValue.diagnostic ?? 'LAFEA_VALUE_STATE_NOT_ALLOWED',
      `${descriptor.descriptorId} does not allow ${parsedValue.state}.`,
    );
  }
  const document = structuredClone(currentDocument);
  const entity = resolveDescriptorEntity(document, descriptor, command.target.entityId);
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
    if (!isRecord(wrapper)) throw contractError('LAFEA_SCALAR_WRAPPER_REQUIRED', `${descriptor.descriptorId} requires a scalar wrapper.`);
    previousValue = wrapper[descriptor.target.scalarWrapperKey];
    if (parsedValue.state === 'MISSING') delete wrapper[descriptor.target.scalarWrapperKey];
    else wrapper[descriptor.target.scalarWrapperKey] = parsedValue.value;
    resolvedPath += `.${descriptor.target.scalarWrapperKey}`;
  } else {
    if (finalKey === undefined) throw contractError('LAFEA_SCALAR_PATH_REQUIRED', `${descriptor.descriptorId} has no scalar property path.`);
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
  if (descriptor.valueContract.domainType !== 'ENTITY') {
    throw contractError('LAFEA_ENTITY_DESCRIPTOR_REQUIRED', `${descriptor.descriptorId} is not an entity descriptor.`);
  }
  if (!isRecord(command.input.jsonValue)) throw contractError('LAFEA_ENTITY_OBJECT_REQUIRED', 'ADD_ENTITY requires a JSON object record.');
  assertJsonSafe(command.input.jsonValue);
  const document = structuredClone(currentDocument);
  const rows = getAtPath(document, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) throw contractError('LAFEA_COLLECTION_NOT_FOUND', `Missing collection ${descriptor.target.collectionPath}.`);
  const record = structuredClone(command.input.jsonValue);
  const identityKey = descriptor.target.identityKey;
  const suppliedIdentity = record[identityKey];
  const identity = typeof suppliedIdentity === 'string' && suppliedIdentity
    ? suppliedIdentity
    : allocateLafeaEntityIdentity(command.stageId, document, descriptor, record);
  if (rows.some((row) => row?.[identityKey] === identity)) {
    throw entityError('LAFEA_IDENTITY_COLLISION', identity, `Duplicate ${identityKey}: ${identity}.`);
  }
  record[identityKey] = identity;
  rows.push(record);
  return {
    document,
    change: {
      operation: command.operation,
      entityId: identity,
      resolvedPath: `${descriptor.target.collectionPath}[${identityKey}=${identity}]`,
      previousState: 'MISSING', currentState: 'PRESENT',
      previousValue: null, currentValue: record,
    },
  };
}

function applyDeleteEntity(currentDocument, command, descriptor) {
  if (descriptor.valueContract.domainType !== 'ENTITY') {
    throw contractError('LAFEA_ENTITY_DESCRIPTOR_REQUIRED', `${descriptor.descriptorId} is not an entity descriptor.`);
  }
  const entityId = command.target.entityId;
  if (typeof entityId !== 'string' || !entityId) throw contractError('LAFEA_ENTITY_ID_REQUIRED', 'DELETE_ENTITY requires an exact entity ID.');
  const document = structuredClone(currentDocument);
  const rows = getAtPath(document, descriptor.target.collectionPath);
  if (!Array.isArray(rows)) throw contractError('LAFEA_COLLECTION_NOT_FOUND', `Missing collection ${descriptor.target.collectionPath}.`);
  const identityKey = descriptor.target.identityKey;
  const matches = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row?.[identityKey] === entityId);
  if (matches.length !== 1) {
    throw entityError(matches.length ? 'LAFEA_IDENTITY_COLLISION' : 'LAFEA_ENTITY_NOT_FOUND', entityId, `Expected exactly one ${identityKey}=${entityId}.`);
  }
  const [match] = matches;
  rows.splice(match.index, 1);
  if (containsExactString(document, entityId)) {
    throw entityError('LAFEA_REFERENTIAL_INTEGRITY', entityId, `${entityId} is still referenced after proposed deletion.`);
  }
  return {
    document,
    change: {
      operation: command.operation,
      entityId,
      resolvedPath: `${descriptor.target.collectionPath}[${identityKey}=${entityId}]`,
      previousState: 'PRESENT', currentState: 'MISSING',
      previousValue: match.row, currentValue: null,
    },
  };
}

function requireCommandDescriptor(command) {
  const descriptor = requireLafeaInputDescriptor(command.stageId, command.descriptorId);
  if (command.descriptorRevision !== descriptor.descriptorRevision) {
    throw contractError('LAFEA_STALE_DESCRIPTOR_REVISION', `${command.descriptorId} revision is stale.`);
  }
  return descriptor;
}

function validateCommand(commandValue) {
  if (!isRecord(commandValue)) throw new TypeError('StageEditCommand/v2 must be an object.');
  exactKeys(commandValue, COMMAND_KEYS, 'StageEditCommand/v2');
  exactKeys(commandValue.target, TARGET_KEYS, 'StageEditCommand/v2.target');
  exactKeys(commandValue.input, INPUT_KEYS, 'StageEditCommand/v2.input');
  exactKeys(commandValue.origin, ORIGIN_KEYS, 'StageEditCommand/v2.origin');
  if (commandValue.schema !== LAFEA_EDIT_COMMAND_SCHEMA) throw new TypeError('StageEditCommand/v2 schema is invalid.');
  if (!LAFEA_EDIT_OPERATIONS.includes(commandValue.operation)) throw new TypeError(`Unsupported edit operation: ${commandValue.operation}.`);
  if (typeof commandValue.commandId !== 'string' || !commandValue.commandId) throw new TypeError('commandId is required.');
  if (typeof commandValue.stageId !== 'string') throw new TypeError('stageId is required.');
  if (typeof commandValue.expectedDocumentDigest !== 'string') throw new TypeError('expectedDocumentDigest is required.');
  if (!['PRESENT', 'DELETE'].includes(commandValue.input.presence)) throw new TypeError('input.presence is invalid.');
  if (!['TEXT', 'JSON'].includes(commandValue.input.encoding)) throw new TypeError('input.encoding is invalid.');
  if (!Number.isInteger(commandValue.origin.sequence) || commandValue.origin.sequence < 0) throw new TypeError('origin.sequence must be a non-negative integer.');
  if (commandValue.operation === 'REPLACE_DOCUMENT') {
    if (commandValue.descriptorId !== null || commandValue.descriptorRevision !== null) {
      throw new TypeError('REPLACE_DOCUMENT must not claim a field descriptor.');
    }
  } else if (typeof commandValue.descriptorId !== 'string' || typeof commandValue.descriptorRevision !== 'string') {
    throw new TypeError(`${commandValue.operation} requires descriptor identity and revision.`);
  }
  return commandValue;
}

function result(options) {
  const value = {
    schema: LAFEA_EDIT_RESULT_SCHEMA,
    commandId: options.command.commandId ?? 'INVALID_COMMAND',
    stageId: options.command.stageId ?? null,
    status: options.status,
    previousDocumentDigest: options.previousDocumentDigest,
    currentDocumentDigest: options.currentDocumentDigest,
    document: options.document,
    change: options.change,
    dependencyImpact: Object.freeze([...options.dependencyImpact]),
    diagnostics: Object.freeze(options.diagnostics.map((row) => deepFreeze(row))),
    audit: {
      descriptorDigest: options.descriptor ? lafeaDocumentDigest(options.descriptor) : null,
      commandDigest: safeDigest(options.command),
      rawInputDigest: safeDigest(options.command.input),
    },
  };
  exactKeys(value, [
    'schema', 'commandId', 'stageId', 'status', 'previousDocumentDigest',
    'currentDocumentDigest', 'document', 'change', 'dependencyImpact',
    'diagnostics', 'audit',
  ], 'StageEditResult/v2');
  if (!LAFEA_EDIT_STATUSES.includes(value.status)) throw new TypeError(`Invalid edit result status: ${value.status}.`);
  return deepFreeze(value);
}

function boundedNumeric(value, rawLexeme, descriptor) {
  const normalized = Object.is(value, -0) ? 0 : value;
  const contract = descriptor.valueContract;
  if (contract.minimum !== null) {
    const invalid = contract.minimumExclusive ? normalized <= contract.minimum : normalized < contract.minimum;
    if (invalid) return parsed('INVALID_NUMBER', null, rawLexeme, 'NUMBER_BELOW_MINIMUM');
  }
  if (contract.maximum !== null) {
    const invalid = contract.maximumExclusive ? normalized >= contract.maximum : normalized > contract.maximum;
    if (invalid) return parsed('INVALID_NUMBER', null, rawLexeme, 'NUMBER_ABOVE_MAXIMUM');
  }
  return parsed(normalized === 0 ? 'EXPLICIT_ZERO' : 'FINITE_NUMBER', normalized, rawLexeme, null);
}

function parsed(state, value, rawLexeme, diagnosticCode) {
  if (!LAFEA_VALUE_STATES.includes(state)) throw new TypeError(`Unknown value state: ${state}.`);
  return deepFreeze({ state, value, rawLexeme, diagnostic: diagnosticCode });
}

function classifyStoredValue(value) {
  if (value === undefined) return 'MISSING';
  if (value === null) return 'PRESENT_NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'INVALID_NUMBER';
    return value === 0 ? 'EXPLICIT_ZERO' : 'FINITE_NUMBER';
  }
  return 'PRESENT';
}

function requireParent(root, path) {
  let current = root;
  for (const segment of path.slice(0, -1)) {
    if ((typeof segment !== 'string' && typeof segment !== 'number') || current?.[segment] === undefined) {
      throw pathError('LAFEA_EDIT_PATH_NOT_FOUND', path.join('.'), `Missing edit path ${path.join('.')}.`);
    }
    current = current[segment];
  }
  return current;
}

function descriptorPath(descriptor, entityId) {
  const prefix = descriptor.target.collectionPath
    ? `${descriptor.target.collectionPath}[${descriptor.target.identityKey}=${entityId}]`
    : 'document';
  return descriptor.target.propertyPath.length
    ? `${prefix}.${descriptor.target.propertyPath.join('.')}`
    : prefix;
}

function containsExactString(value, expected) {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((entry) => containsExactString(entry, expected));
  if (isRecord(value)) return Object.values(value).some((entry) => containsExactString(entry, expected));
  return false;
}

function assertJsonSafe(value, path = 'document', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw pathError('LAFEA_NON_FINITE_NUMBER', path, `${path} must be finite.`);
    return;
  }
  if (!value || typeof value !== 'object') throw pathError('LAFEA_NON_JSON_VALUE', path, `${path} must contain JSON-safe data.`);
  if (seen.has(value)) throw pathError('LAFEA_JSON_CYCLE', path, `${path} must not contain a cycle.`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`, seen));
  else {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw pathError('LAFEA_NON_PLAIN_OBJECT', path, `${path} must use plain JSON objects.`);
    Object.entries(value).forEach(([key, entry]) => assertJsonSafe(entry, `${path}.${key}`, seen));
  }
  seen.delete(value);
}

function canonicalStringify(value) {
  assertJsonSafe(value);
  return stringifyValue(value);
}

function stringifyValue(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stringifyValue(value[key])}`).join(',')}}`;
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) throw new TypeError(`${label} exact-key contract mismatch.`);
}

function getAtPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

function diagnostic(severity, code, path, entityId, message) {
  return { severity, code, path, entityId, message };
}

function emptyChange(operation, entityId) {
  return {
    operation, entityId, resolvedPath: null,
    previousState: null, currentState: null,
    previousValue: null, currentValue: null,
  };
}

function sanitizeCommand(value) {
  if (isRecord(value)) return value;
  return {
    commandId: 'INVALID_COMMAND', stageId: null, operation: null,
    target: { entityId: null }, input: null,
  };
}

function safeDigest(value) {
  try { return lafeaDocumentDigest(value); } catch { return 'UNAVAILABLE'; }
}

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pathError(code, path, message) {
  const error = contractError(code, message);
  error.path = path;
  return error;
}

function entityError(code, entityId, message) {
  const error = contractError(code, message);
  error.entityId = entityId;
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
