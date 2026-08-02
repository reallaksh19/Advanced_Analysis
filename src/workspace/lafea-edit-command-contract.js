/**
 * Private StageEditCommand/v2 and StageEditResult/v2 contract implementation.
 *
 * This module owns exact keys, command construction and numeric lexical
 * classification. It does not apply edits to a stage document.
 */
import {
  LAFEA_INPUT_DESCRIPTOR_REVISION,
  LAFEA_VALUE_STATES,
} from './lafea-stage-input-descriptors.js';
import {
  deepFreeze,
  exactKeys,
  frozenClone,
  isRecord,
  lafeaDocumentDigest,
  safeDigest,
} from './lafea-edit-command-support.js';

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

export const LAFEA_REPLACE_DEPENDENCY_DESCENDANTS = Object.freeze([
  'CANONICAL_MODEL',
  'MESH',
  'EXECUTION',
  'RECOVERY',
  'CONVERGENCE',
  'CODE',
  'REPORT',
]);

const COMMAND_KEYS = Object.freeze([
  'schema',
  'commandId',
  'stageId',
  'descriptorId',
  'descriptorRevision',
  'operation',
  'expectedDocumentDigest',
  'target',
  'input',
  'origin',
]);
const TARGET_KEYS = Object.freeze(['entityId']);
const INPUT_KEYS = Object.freeze([
  'presence',
  'encoding',
  'rawText',
  'jsonValue',
]);
const ORIGIN_KEYS = Object.freeze(['surface', 'sessionId', 'sequence']);
const DECIMAL_GRAMMAR = /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;

export function createLafeaSetScalarCommand(options) {
  return command({
    ...options,
    operation: 'SET_SCALAR',
    descriptorRevision: options.descriptorRevision
      ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    input: {
      presence: 'PRESENT',
      encoding: 'TEXT',
      rawText: options.rawText,
      jsonValue: null,
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
      presence: 'PRESENT',
      encoding: 'JSON',
      rawText: null,
      jsonValue: structuredClone(options.documentValue),
    },
  });
}

export function createLafeaAddEntityCommand(options) {
  return command({
    ...options,
    operation: 'ADD_ENTITY',
    descriptorRevision: options.descriptorRevision
      ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    entityId: null,
    input: {
      presence: 'PRESENT',
      encoding: 'JSON',
      rawText: null,
      jsonValue: structuredClone(options.recordValue),
    },
  });
}

export function createLafeaDeleteFieldCommand(options) {
  return command({
    ...options,
    operation: 'DELETE_FIELD',
    descriptorRevision: options.descriptorRevision
      ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    input: {
      presence: 'DELETE',
      encoding: 'JSON',
      rawText: null,
      jsonValue: null,
    },
  });
}

export function createLafeaDeleteEntityCommand(options) {
  return command({
    ...options,
    operation: 'DELETE_ENTITY',
    descriptorRevision: options.descriptorRevision
      ?? LAFEA_INPUT_DESCRIPTOR_REVISION,
    input: {
      presence: 'DELETE',
      encoding: 'JSON',
      rawText: null,
      jsonValue: null,
    },
  });
}

export function classifyLafeaNumericInput(input, descriptor) {
  exactKeys(input, INPUT_KEYS, 'StageEditCommand/v2.input');
  if (input.presence === 'DELETE') {
    return parsed('MISSING', null, null, null);
  }
  if (input.presence !== 'PRESENT') {
    return parsed('INVALID_NUMBER', null, null, 'INVALID_PRESENCE');
  }

  if (input.encoding === 'JSON') {
    if (input.jsonValue === null) {
      return parsed('PRESENT_NULL', null, 'null', null);
    }
    if (typeof input.jsonValue !== 'number'
      || !Number.isFinite(input.jsonValue)) {
      return parsed(
        'INVALID_NUMBER',
        null,
        null,
        'JSON_VALUE_NOT_FINITE_NUMBER',
      );
    }
    return boundedNumeric(
      input.jsonValue,
      JSON.stringify(input.jsonValue),
      descriptor,
    );
  }

  if (input.encoding !== 'TEXT' || typeof input.rawText !== 'string') {
    return parsed('INVALID_NUMBER', null, null, 'TEXT_INPUT_REQUIRED');
  }
  const trimmed = input.rawText.trim();
  if (!trimmed) return parsed('EMPTY_TEXT', null, input.rawText, null);
  if (!DECIMAL_GRAMMAR.test(trimmed)) {
    return parsed(
      'INVALID_NUMBER',
      null,
      input.rawText,
      'INVALID_DECIMAL_LEXEME',
    );
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return parsed(
      'INVALID_NUMBER',
      null,
      input.rawText,
      'NUMBER_OUT_OF_RANGE',
    );
  }
  return boundedNumeric(value, input.rawText, descriptor);
}

export function validateLafeaEditCommand(commandValue) {
  if (!isRecord(commandValue)) {
    throw new TypeError('StageEditCommand/v2 must be an object.');
  }
  exactKeys(commandValue, COMMAND_KEYS, 'StageEditCommand/v2');
  exactKeys(commandValue.target, TARGET_KEYS, 'StageEditCommand/v2.target');
  exactKeys(commandValue.input, INPUT_KEYS, 'StageEditCommand/v2.input');
  exactKeys(commandValue.origin, ORIGIN_KEYS, 'StageEditCommand/v2.origin');
  if (commandValue.schema !== LAFEA_EDIT_COMMAND_SCHEMA) {
    throw new TypeError('StageEditCommand/v2 schema is invalid.');
  }
  if (!LAFEA_EDIT_OPERATIONS.includes(commandValue.operation)) {
    throw new TypeError(`Unsupported edit operation: ${commandValue.operation}.`);
  }
  if (typeof commandValue.commandId !== 'string' || !commandValue.commandId) {
    throw new TypeError('commandId is required.');
  }
  if (typeof commandValue.stageId !== 'string') {
    throw new TypeError('stageId is required.');
  }
  if (typeof commandValue.expectedDocumentDigest !== 'string') {
    throw new TypeError('expectedDocumentDigest is required.');
  }
  if (!['PRESENT', 'DELETE'].includes(commandValue.input.presence)) {
    throw new TypeError('input.presence is invalid.');
  }
  if (!['TEXT', 'JSON'].includes(commandValue.input.encoding)) {
    throw new TypeError('input.encoding is invalid.');
  }
  if (!Number.isInteger(commandValue.origin.sequence)
    || commandValue.origin.sequence < 0) {
    throw new TypeError('origin.sequence must be a non-negative integer.');
  }
  validateOperationInput(commandValue);
  if (commandValue.operation === 'REPLACE_DOCUMENT') {
    if (commandValue.descriptorId !== null
      || commandValue.descriptorRevision !== null) {
      throw new TypeError(
        'REPLACE_DOCUMENT must not claim a field descriptor.',
      );
    }
  } else if (typeof commandValue.descriptorId !== 'string'
    || typeof commandValue.descriptorRevision !== 'string') {
    throw new TypeError(
      `${commandValue.operation} requires descriptor identity and revision.`,
    );
  }
  return commandValue;
}

export function createLafeaEditResult(options) {
  const value = {
    schema: LAFEA_EDIT_RESULT_SCHEMA,
    commandId: options.command.commandId ?? 'INVALID_COMMAND',
    stageId: options.command.stageId ?? null,
    status: options.status,
    previousDocumentDigest: options.previousDocumentDigest,
    currentDocumentDigest: options.currentDocumentDigest,
    document: frozenClone(options.document),
    change: options.change,
    dependencyImpact: Object.freeze([...options.dependencyImpact]),
    diagnostics: Object.freeze(
      options.diagnostics.map((row) => deepFreeze(row)),
    ),
    audit: {
      descriptorDigest: options.descriptor
        ? lafeaDocumentDigest(options.descriptor)
        : null,
      commandDigest: safeDigest(options.command),
      rawInputDigest: safeDigest(options.command.input),
    },
  };
  exactKeys(value, [
    'schema',
    'commandId',
    'stageId',
    'status',
    'previousDocumentDigest',
    'currentDocumentDigest',
    'document',
    'change',
    'dependencyImpact',
    'diagnostics',
    'audit',
  ], 'StageEditResult/v2');
  if (!LAFEA_EDIT_STATUSES.includes(value.status)) {
    throw new TypeError(`Invalid edit result status: ${value.status}.`);
  }
  return deepFreeze(value);
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
  validateLafeaEditCommand(value);
  return deepFreeze(value);
}

function validateOperationInput(commandValue) {
  const { operation, input, target } = commandValue;
  if (operation === 'SET_SCALAR'
    && (input.presence !== 'PRESENT' || input.encoding !== 'TEXT')) {
    throw new TypeError('SET_SCALAR requires PRESENT text input.');
  }
  if (operation === 'DELETE_FIELD' && input.presence !== 'DELETE') {
    throw new TypeError('DELETE_FIELD requires DELETE input.');
  }
  if (operation === 'ADD_ENTITY'
    && (input.presence !== 'PRESENT' || input.encoding !== 'JSON')) {
    throw new TypeError('ADD_ENTITY requires PRESENT JSON input.');
  }
  if (operation === 'DELETE_ENTITY'
    && (input.presence !== 'DELETE'
      || typeof target.entityId !== 'string'
      || !target.entityId)) {
    throw new TypeError(
      'DELETE_ENTITY requires DELETE input and an exact entity ID.',
    );
  }
  if (operation === 'REPLACE_DOCUMENT'
    && (input.presence !== 'PRESENT' || input.encoding !== 'JSON')) {
    throw new TypeError('REPLACE_DOCUMENT requires PRESENT JSON input.');
  }
}

function boundedNumeric(value, rawLexeme, descriptor) {
  const normalized = Object.is(value, -0) ? 0 : value;
  const contract = descriptor.valueContract;
  if (contract.minimum !== null) {
    const invalid = contract.minimumExclusive
      ? normalized <= contract.minimum
      : normalized < contract.minimum;
    if (invalid) {
      return parsed(
        'INVALID_NUMBER',
        null,
        rawLexeme,
        'NUMBER_BELOW_MINIMUM',
      );
    }
  }
  if (contract.maximum !== null) {
    const invalid = contract.maximumExclusive
      ? normalized >= contract.maximum
      : normalized > contract.maximum;
    if (invalid) {
      return parsed(
        'INVALID_NUMBER',
        null,
        rawLexeme,
        'NUMBER_ABOVE_MAXIMUM',
      );
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
  return deepFreeze({
    state,
    value,
    rawLexeme,
    diagnostic: diagnosticCode,
  });
}
