/**
 * Immutable state transitions and collection access for the LFEA store.
 *
 * Inputs are never mutated. Every committed document is already validated and
 * resealed by the model boundary before entering these transitions.
 */
import {
  LFEA_COLLECTION_PATHS,
  LFEA_RESULT_MODES,
  LFEA_WORKBENCH_DOCUMENT_SCHEMA,
  normalizeLfeaMeshPackage,
} from './lfea-workbench-model.js';

export function importedState(state, value, historyLimit) {
  const envelope = isRecord(value)
    && value.schema === LFEA_WORKBENCH_DOCUMENT_SCHEMA;
  const packageValue = normalizeLfeaMeshPackage(
    envelope ? value.packageValue : value,
  );
  return committedState(state, packageValue, historyLimit);
}

export function committedState(state, packageValue, historyLimit) {
  return {
    ...state,
    status: 'READY',
    packageValue,
    execution: null,
    progress: null,
    nodeDraft: null,
    past: [...state.past, state.packageValue]
      .filter(Boolean)
      .slice(-historyLimit),
    future: [],
    diagnostics: [],
  };
}

export function failedState(state, error, fallbackCode) {
  return {
    ...state,
    status: 'FAILED',
    diagnostics: [{
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : fallbackCode,
      message: error instanceof Error
        ? error.message
        : 'Unknown LFEA workbench failure.',
    }],
  };
}

export function requirePackage(state) {
  if (!state.packageValue) {
    throw new TypeError(
      'Import a valid lfea-mesh-package/v1 before editing or solving.',
    );
  }
  return state.packageValue;
}

export function collectionAt(packageValue, path) {
  assertCollectionPath(path);
  const value = path
    .split('.')
    .reduce((current, key) => current?.[key], packageValue);
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} is not an LFEA collection.`);
  }
  return structuredClone(value);
}

export function setAtPath(value, path, replacement) {
  const result = structuredClone(value);
  const keys = path.split('.');
  let current = result;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(current[key])) {
      throw new TypeError(`Missing LFEA package path: ${path}.`);
    }
    current = current[key];
  }
  current[keys.at(-1)] = replacement;
  return result;
}

export function assertCollectionPath(path) {
  if (!LFEA_COLLECTION_PATHS.includes(path)) {
    throw new TypeError(`Unsupported LFEA collection path: ${path}.`);
  }
}

export function assertResultMode(mode) {
  if (!LFEA_RESULT_MODES.includes(mode)) {
    throw new TypeError(`Unsupported LFEA result mode: ${mode}.`);
  }
}

export function assertRecord(value) {
  if (!isRecord(value)) {
    throw new TypeError('LFEA record must be a JSON object.');
  }
}

export function assertIndex(rows, index, path) {
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    throw new RangeError(`LFEA record index ${index} is outside ${path}.`);
  }
}

export function assertNodeCoordinates(nodeId, x, y) {
  if (typeof nodeId !== 'string' || !nodeId) {
    throw new TypeError('LFEA node identity is required.');
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('LFEA node coordinates must be finite.');
  }
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
