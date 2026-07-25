import { freezeDeep } from './dataset-utils.js';

export const ANALYSIS_COMPARISON_SCHEMA = 'analysis-ledger-comparison/v1';

export function compareLedgerEntries(leftEntry, rightEntry) {
  assertCompatible(leftEntry, rightEntry);
  const leftValues = flattenComparable(buildComparable(leftEntry));
  const rightValues = flattenComparable(buildComparable(rightEntry));
  const paths = [...new Set([...leftValues.keys(), ...rightValues.keys()])].sort();
  const rows = paths.map((path) => {
    const hasLeft = leftValues.has(path);
    const hasRight = rightValues.has(path);
    const left = hasLeft ? leftValues.get(path) : null;
    const right = hasRight ? rightValues.get(path) : null;
    let status = 'equal';
    if (!hasLeft) status = 'right-only';
    else if (!hasRight) status = 'left-only';
    else if (left !== right) status = 'changed';
    return freezeDeep({ path, left, right, status });
  });
  const counts = rows.reduce((summary, row) => {
    summary[row.status] += 1;
    return summary;
  }, { equal: 0, changed: 0, 'left-only': 0, 'right-only': 0 });
  return freezeDeep({
    schema: ANALYSIS_COMPARISON_SCHEMA,
    datasetId: leftEntry.datasetId,
    analysisType: leftEntry.session.analysisType,
    leftEntryId: leftEntry.entryId,
    rightEntryId: rightEntry.entryId,
    counts,
    rows,
  });
}

function buildComparable(entry) {
  const session = entry.session;
  const inputEvidence = Object.fromEntries((session.inputs || []).map((field) => [field.key, {
    value: field.value,
    unit: field.unit,
    source: field.source,
    sourcePath: field.sourcePath,
    validation: field.validation,
  }]));
  return {
    archiveKey: entry.archiveKey,
    sessionId: session.sessionId,
    requestId: session.requestId,
    workspaceVersion: session.workspaceVersion,
    sessionVersion: session.version,
    targetId: session.targetId,
    analysisType: session.analysisType,
    inputs: inputEvidence,
    overrides: session.overrides || {},
    fieldErrors: session.fieldErrors || {},
    readiness: session.readiness || {},
    result: session.result ? {
      status: session.result.status,
      summary: session.result.summary || {},
      results: session.result.results || {},
      warnings: session.result.warnings || [],
      diagnostics: session.result.diagnostics || [],
      meta: session.result.meta || {},
    } : null,
    failure: session.failure || null,
  };
}

function flattenComparable(value, path = '', output = new Map()) {
  if (Array.isArray(value)) {
    if (!value.length) output.set(path || '$', '[]');
    value.forEach((child, index) => flattenComparable(child, joinPath(path, `[${index}]`), output));
    return output;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (!keys.length) output.set(path || '$', '{}');
    keys.forEach((key) => flattenComparable(value[key], joinPath(path, key), output));
    return output;
  }
  output.set(path || '$', stableScalar(value));
  return output;
}

function stableScalar(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function joinPath(parent, child) {
  if (!parent) return child;
  return child.startsWith('[') ? `${parent}${child}` : `${parent}.${child}`;
}

function assertCompatible(leftEntry, rightEntry) {
  if (!leftEntry || !rightEntry) throw new TypeError('Two ledger entries are required for comparison.');
  if (leftEntry.entryId === rightEntry.entryId) {
    throw new Error('Analysis comparison requires two distinct ledger entries.');
  }
  if (leftEntry.datasetId !== rightEntry.datasetId) {
    throw new Error('Analysis comparison requires entries from the same dataset.');
  }
  if (leftEntry.session.analysisType !== rightEntry.session.analysisType) {
    throw new Error('Analysis comparison requires entries from the same capability.');
  }
}
