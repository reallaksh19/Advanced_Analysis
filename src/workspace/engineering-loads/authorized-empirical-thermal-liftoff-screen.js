import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  THERMAL_LIFTOFF_METHOD_ID,
} from './empirical-thermal-liftoff-authority.js';
import {
  THERMAL_LIFTOFF_LOCAL_SCREEN_REQUEST_SCHEMA,
  calculateEmpiricalThermalLiftoffLocalScreen,
  requireEmpiricalThermalLiftoffLocalScreenResult,
} from './empirical-thermal-liftoff-local-screen.js';

export const AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_REQUEST_SCHEMA =
  'authorized-empirical-thermal-liftoff-screen-request/v1';
export const AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_SCHEMA =
  'authorized-empirical-thermal-liftoff-screen/v1';

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'coldGravityExecution',
  'supportContactAuthorities',
  'displacements',
  'stiffnessRegistry',
  'applicabilityBindings',
  'reactionToleranceAuthority',
]);
const RESULT_KEYS = Object.freeze([
  'schema', 'method', 'executionId', 'executedAt', 'coreResult', 'semanticHash',
]);

export function calculateAuthorizedEmpiricalThermalLiftoffScreen(value) {
  exactKeys(value, REQUEST_KEYS, 'authorized thermal lift-off screen request');
  if (value.schema !== AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_REQUEST_SCHEMA) {
    throw new TypeError('Unsupported authorized thermal lift-off screen request schema.');
  }
  const coreResult = calculateEmpiricalThermalLiftoffLocalScreen({
    schema: THERMAL_LIFTOFF_LOCAL_SCREEN_REQUEST_SCHEMA,
    executionId: value.executionId,
    executedAt: value.executedAt,
    coldGravityExecution: value.coldGravityExecution,
    supportContactAuthorities: value.supportContactAuthorities,
    displacements: value.displacements,
    stiffnessRegistry: value.stiffnessRegistry,
    applicabilityBindings: value.applicabilityBindings,
    reactionToleranceAuthority: value.reactionToleranceAuthority,
  });
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_SCHEMA,
    method: coreResult.method,
    executionId: coreResult.executionId,
    executedAt: coreResult.executedAt,
    coreResult,
  };
  return requireAuthorizedEmpiricalThermalLiftoffScreen({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireAuthorizedEmpiricalThermalLiftoffScreen(value) {
  exactKeys(value, RESULT_KEYS, 'authorized thermal lift-off screen');
  if (value.schema !== AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_SCHEMA) {
    throw new TypeError('Unsupported authorized thermal lift-off screen schema.');
  }
  const coreResult = requireEmpiricalThermalLiftoffLocalScreenResult(value.coreResult);
  if (value.method !== THERMAL_LIFTOFF_METHOD_ID
    || value.method !== coreResult.method
    || value.executionId !== coreResult.executionId
    || value.executedAt !== coreResult.executedAt) {
    throw new TypeError('Authorized thermal lift-off screen identity mismatch.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Authorized thermal lift-off screen semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
