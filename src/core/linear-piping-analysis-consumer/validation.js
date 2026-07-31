/**
 * Closed-record and identity validation shared by the T0 consumer contracts.
 *
 * Every failure is explicit and carries a stable application-consumer code.
 */

import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { isPlainRecord } from '../shared-piping-model/immutable.js';

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class LinearPipingAnalysisConsumerError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'LinearPipingAnalysisConsumerError';
  }
}

export function failLinearPipingAnalysis(message, code, evidence) {
  const error = new LinearPipingAnalysisConsumerError(message, code);
  error.evidence = evidence;
  throw error;
}

export function requireExactKeys(value, expected, field) {
  if (!isPlainRecord(value)) {
    failLinearPipingAnalysis(`${field} must be a record.`, 'PIPING_ANALYSIS_RECORD_REQUIRED');
  }
  const actual = Object.keys(value).sort(compareAscii);
  const orderedExpected = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(orderedExpected)) {
    failLinearPipingAnalysis(`${field} keys are not exact.`, 'PIPING_ANALYSIS_KEYS_INVALID', {
      field,
      actual,
      expected: orderedExpected,
    });
  }
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failLinearPipingAnalysis(`${field} must be an array.`, 'PIPING_ANALYSIS_ARRAY_REQUIRED');
  }
  return value;
}

export function requireIdentity(value, field) {
  if (typeof value !== 'string' || !/^[\x20-\x7e]+$/u.test(value) || !value.trim()) {
    failLinearPipingAnalysis(`${field} must be a non-empty ASCII identity.`, 'PIPING_ANALYSIS_IDENTITY_INVALID');
  }
  return value;
}

export function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    failLinearPipingAnalysis(`${field} must be a semantic hash.`, 'PIPING_ANALYSIS_HASH_INVALID');
  }
}

export function requireRevision(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    failLinearPipingAnalysis(`${field} must be a positive integer.`, 'PIPING_ANALYSIS_REVISION_INVALID');
  }
}

export function byIdentity(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
