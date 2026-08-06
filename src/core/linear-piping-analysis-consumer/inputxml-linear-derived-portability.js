import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';

const PROHIBITED_KEYS = new Set([
  'factorizationHandle', 'factorizationCache', 'genericRuntime',
  'solvePreparation', 'preflight', 'solverProfile', 'frameProfile',
  'K', 'sparseK', 'triplets', 'matrix', 'localStiffness',
  'globalStiffness', 'sparseFactor', 'scaleFactors', 'factors',
]);

export function requirePortableDerivedTree(value) {
  walkPortableTree(value, 'derivedCase');
}

function walkPortableTree(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return requireFinite(value, path);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkPortableTree(entry, `${path}[${index}]`));
    return;
  }
  if (!isPlainRecord(value)) fail(
    `${path} contains non-serializable runtime state.`,
    'INPUTXML_DERIVED_RUNTIME_STATE_PROHIBITED',
  );
  Object.entries(value).forEach(([key, entry]) => {
    if (PROHIBITED_KEYS.has(key)) fail(
      `${path}.${key} is prohibited runtime or matrix state.`,
      'INPUTXML_DERIVED_RUNTIME_STATE_PROHIBITED',
    );
    walkPortableTree(entry, `${path}.${key}`);
  });
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(
    `${field} must be finite.`, 'INPUTXML_DERIVED_NONFINITE',
  );
}
