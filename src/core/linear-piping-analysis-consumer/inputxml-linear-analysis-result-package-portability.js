import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';

const PROHIBITED_KEYS = new Set([
  'factorizationHandle', 'factorizationCache', 'genericRuntime', 'runtime',
  'K', 'sparseK', 'triplets', 'matrix', 'localStiffness', 'globalStiffness',
  'sparseFactor', 'factorizationObject',
]);

export function requirePortableInputXmlAnalysisResultPackage(value) {
  walk(value, 'package');
}

function walk(value, path) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} is non-finite.`, 'INPUTXML_RESULT_PACKAGE_NONFINITE');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    return;
  }
  if (!isPlainRecord(value)) fail(
    `${path} contains non-portable state.`, 'INPUTXML_RESULT_PACKAGE_RUNTIME_STATE_PROHIBITED',
  );
  for (const [key, entry] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key) && entry !== null && typeof entry !== 'string') fail(
      `${path}.${key} is prohibited runtime state.`,
      'INPUTXML_RESULT_PACKAGE_RUNTIME_STATE_PROHIBITED',
    );
    walk(entry, `${path}.${key}`);
  }
}
