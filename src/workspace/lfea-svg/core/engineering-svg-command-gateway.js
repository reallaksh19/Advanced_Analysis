/**
 * Engineering SVG Command Gateway (Ported & Hardened for LFEA SVG)
 * Replaces localeCompare with locale-invariant ASCII sort.
 */
import { asciiSort } from '../lfea-svg-contracts.js';

export const ENGINEERING_SVG_COMMAND_GATEWAY_SCHEMA = 'EngineeringSvgCommandGateway.v1';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = asciiSort(Object.keys(value));
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function engineeringRevisionTokensEqual(left, right) {
  if (!left || !right) return false;
  return canonicalJson(left) === canonicalJson(right);
}

function rejected(intent, code, message, data = {}) {
  return Object.freeze({
    schema: 'EngineeringCommandResult.v1',
    operationId: intent.operationId,
    status: 'rejected',
    code,
    message,
    data,
  });
}

export function createEngineeringSvgCommandGateway(options = {}) {
  if (typeof options.getCurrentRevision !== 'function' || typeof options.execute !== 'function') {
    throw new TypeError('Engineering SVG command gateway requires getCurrentRevision and execute functions.');
  }
  const inFlight = new Set();

  async function execute(intentValue) {
    if (!intentValue || typeof intentValue !== 'object') {
      throw new TypeError('Command gateway execute requires edit intent object.');
    }
    const intent = intentValue;
    const currentRevision = await options.getCurrentRevision();

    if (!engineeringRevisionTokensEqual(intent.baseRevision, currentRevision)) {
      return rejected(intent, 'STALE_BASE_REVISION', 'The authoritative revision changed before the edit committed.', { currentRevision });
    }
    if (inFlight.has(intent.operationId)) {
      return rejected(intent, 'DUPLICATE_OPERATION_ID', 'The edit operation is already in progress.');
    }
    inFlight.add(intent.operationId);
    try {
      const result = await options.execute(intent);
      if (result.operationId !== intent.operationId) {
        throw new Error('Command result operationId does not match its intent.');
      }
      return result;
    } finally {
      inFlight.delete(intent.operationId);
    }
  }

  return Object.freeze({
    schema: ENGINEERING_SVG_COMMAND_GATEWAY_SCHEMA,
    execute,
    inFlightCount: () => inFlight.size,
  });
}
