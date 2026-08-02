/**
 * Private strict numeric parser for StageEditCommand/v2 input.
 *
 * No unit inference or silent zero coercion is performed.
 */
import {
  LAFEA_VALUE_STATES,
} from './lafea-stage-input-descriptors.js';
import {
  deepFreeze,
  exactKeys,
} from './lafea-edit-command-support.js';

const INPUT_KEYS = Object.freeze([
  'presence',
  'encoding',
  'rawText',
  'jsonValue',
]);
const DECIMAL_GRAMMAR = /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;

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
